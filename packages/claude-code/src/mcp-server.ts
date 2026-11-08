// The local MCP server: show, present and decide as an MCP App (editor spec §49, workstream Y2). It speaks JSON-RPC over
// standard input and output (bin/mcp-process.ts). Each tool links to one page, served as a `ui://` resource, which the
// host draws in its sandboxed frame (mcp_app).
// - It runs on the person's own device and reads notes only inside the folder they name (mcp_app_local).
// - Every note passes the same gate as the Claude Code mod, and the AI ceiling, before anything reaches the conversation.
//   A note it would ask about is refused here with the reason: there is no one to say yes.
// - It makes no network call, and there is no server of ours.
// - The page's own calls, `answer` and `keep`, are hidden from the model. Each needs the one-time key its tool's result
//   handed the page alone. They write only the person's own decision or a presentation they kept, each checked by the
//   core (mcp_app_page_bounded). Nothing else writes.
// - The drawing and the rules are the core's and claude-present.ts's: the same as the mod (mcp_app_one_core).
import { claudeGate, pickOut, settingsFrom, word } from '@thoughtknot/core';
import type { DecisionAsk, Palette, PresentStep } from '@thoughtknot/core';
import { Asking } from './claude-decide.ts';
import { decideThrough } from './claude-decide.ts';
import { firstDrawing, pickedView, presentThrough, showThrough } from './claude-present.ts';
import type { StagePorts } from './claude-present.ts';
import { recordInto } from './claude-record.ts';
import type { Laid } from './graphviz-process.ts';

/** The page every tool links to. */
export const PAGE_URI = 'ui://thoughtknot/stage.html';
/** The page's media type, as MCP Apps names an app's HTML. */
export const PAGE_TYPE = 'text/html;profile=mcp-app';
const PROTOCOL = '2025-06-18';
/** The key in a result's `_meta` that carries the page's one-time key. Hosts hand `_meta` to the page, not the model. */
export const KEY_META = 'thoughtknot/key';

/** What the server needs of the device: the folder, its files, the person's settings, the layout and the page. */
export interface McpPorts {
  /** The folder the person named, its links settled. */
  folder: string;
  /** A file's real path, links settled; rejects for one not there. */
  realPath: (path: string) => Promise<string>;
  read: (path: string) => Promise<string>;
  write: (path: string, text: string) => Promise<void>;
  /** The person's saved settings (classifications, ceilings), or null for the strictest defaults. */
  settings: () => Promise<unknown>;
  lay: (dots: string[]) => Promise<Laid>;
  palette: Palette;
  /** The page, as one HTML file. */
  page: () => Promise<string>;
  now: () => string;
  /** A new one-time key: hard to guess. */
  key: () => string;
}

type Json = Record<string, unknown>;
const LINK = { ui: { resourceUri: PAGE_URI } };
const APP_ONLY = { ui: { resourceUri: PAGE_URI, visibility: ['app'] } };
const NOTE = { type: 'string', description: 'The note, as a path inside the folder.' };
const LINKS = {
  type: 'array',
  items: {
    type: 'object',
    properties: { from: { type: 'string' }, type: { type: 'string' }, to: { type: 'string' } },
    required: ['from', 'type', 'to'],
  },
};

/** The tools: show, present and decide for the model, and the page's own answer and keep. */
export const TOOLS = [
  {
    name: 'show',
    description:
      'Show the graph of a note, or pick out things, links, a path or a lens in it. Nothing in the note changes. ' +
      'A note above your level is refused with the reason.',
    inputSchema: {
      type: 'object',
      properties: {
        note: NOTE,
        things: { type: 'array', items: { type: 'string' } },
        links: LINKS,
        path: { type: 'string' },
        lens: { type: 'string' },
      },
      required: ['note'],
    },
    _meta: LINK,
  },
  {
    name: 'present',
    description:
      'Walk the person through the graph of a note, one step at a time. Each step names the things and links to pick ' +
      'out and a short caption. The person moves with Next and Back. Every name must be in the graph.',
    inputSchema: {
      type: 'object',
      properties: {
        note: NOTE,
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              things: { type: 'array', items: { type: 'string' } },
              links: LINKS,
              caption: { type: 'string' },
            },
            required: ['caption'],
          },
        },
      },
      required: ['note', 'steps'],
    },
    _meta: LINK,
  },
  {
    name: 'decide',
    description:
      'Ask the person a question about the graph of a note, with two to six options, each tied to things in it. Only ' +
      'the person answers, in the page. Their pick and reason come back in the conversation, and are kept in the note.',
    inputSchema: {
      type: 'object',
      properties: {
        note: NOTE,
        question: { type: 'string' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, things: { type: 'array', items: { type: 'string' } } },
            required: ['label', 'things'],
          },
        },
      },
      required: ['note', 'question', 'options'],
    },
    _meta: LINK,
  },
  {
    name: 'answer',
    description: "The person's answer, from the page alone.",
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' }, picked: { type: ['integer', 'null'] }, reason: { type: 'string' } },
      required: ['key', 'picked'],
    },
    _meta: APP_ONLY,
  },
  {
    name: 'keep',
    description: 'Keep the presentation in the note, from the page alone, once the person presses Keep.',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    _meta: APP_ONLY,
  },
] as const;

/** What a page's key opens: a question waiting, or a presentation that may be kept. Each is used once. */
type Waiting =
  | { kind: 'decide'; path: string; graph: string; ask: DecisionAsk }
  | { kind: 'present'; path: string; graph: string; steps: PresentStep[] };

const text = (t: string, isError = false): Json => ({
  content: [{ type: 'text', text: t }],
  ...(isError ? { isError } : {}),
});

/** The server: one JSON-RPC message in, its answer out (null for a notification). */
export class McpServer {
  readonly #ports: McpPorts;
  readonly #waiting = new Map<string, Waiting>();

  constructor(ports: McpPorts) {
    this.#ports = ports;
  }

  /** The note's path inside the folder, links settled; or why it is refused. Never a path outside it. */
  async inFolder(given: string): Promise<{ path: string } | { refuse: string }> {
    const out = { refuse: word('mcp.outside', { note: given }) };
    if (!/\.md$/i.test(given) || given.includes('\0')) return out;
    const top = this.#ports.folder.replace(/\/+$/, '');
    const joined = given.startsWith('/') ? given : `${top}/${given}`;
    let real: string;
    try {
      real = await this.#ports.realPath(joined);
    } catch {
      return { refuse: word('mcp.no-note', { note: given }) };
    }
    return real.startsWith(`${top}/`) ? { path: real } : out;
  }

  /** The gate, as the mod's: inside the folder, then the classification and the ceiling. An ask is refused here. */
  #stage(): StagePorts & { resolved: Map<string, string> } {
    const resolved = new Map<string, string>();
    return {
      resolved,
      gate: async (given) => {
        const at = await this.inFolder(given);
        if ('refuse' in at) return at;
        resolved.set(given, at.path);
        const note = await this.#ports.read(at.path);
        const gate = claudeGate(note, settingsFrom(await this.#ports.settings()));
        if ('ask' in gate) return { refuse: gate.ask };
        return gate;
      },
      read: (given) => this.#ports.read(resolved.get(given) ?? given),
      lay: this.#ports.lay,
      palette: this.#ports.palette,
    };
  }

  /** A one-time key for the page, kept with what it opens. */
  #keyFor(w: Waiting): string {
    const key = this.#ports.key();
    this.#waiting.set(key, w);
    return key;
  }

  async #call(name: unknown, args: Json): Promise<Json> {
    if (name === 'show') {
      const shown = await showThrough(this.#stage(), args);
      if (!shown.view) return text(shown.text, true);
      return { ...text(shown.text), structuredContent: { kind: 'show', view: shown.view } };
    }
    if (name === 'present') {
      const stage = this.#stage();
      const got = await presentThrough(stage, args);
      if ('text' in got) return text(got.text, true);
      const drawing = firstDrawing(got.note);
      const base = await pickedView(got.note, null, null, stage.lay, stage.palette);
      if (!drawing || !('view' in base)) return text(word('cc.no-graph'), true);
      const steps = got.steps.map((s) => ({ caption: s.caption, picked: pickOut(drawing, s).picked }));
      const key = this.#keyFor({
        kind: 'present',
        path: stage.resolved.get(got.path) ?? got.path,
        graph: drawing.graph,
        steps: got.steps,
      });
      return {
        ...text(word('present.at', { at: 1, all: steps.length, caption: steps[0]?.caption ?? '' })),
        structuredContent: { kind: 'present', view: base.view, steps },
        _meta: { [KEY_META]: key },
      };
    }
    if (name === 'decide') {
      const stage = this.#stage();
      const got = await decideThrough(stage, args);
      if ('text' in got) return text(got.text, true);
      const note = await stage.read(got.path);
      const shown = await pickedView(
        note,
        got.focus,
        word('decide.asks', { question: got.ask.question }),
        stage.lay,
        stage.palette,
      );
      if (!('view' in shown)) return text(shown.refused, true);
      const key = this.#keyFor({
        kind: 'decide',
        path: stage.resolved.get(got.path) ?? got.path,
        graph: got.graph,
        ask: got.ask,
      });
      return {
        ...text(word('mcp.asked')),
        structuredContent: { kind: 'decide', view: shown.view, question: got.ask.question, options: got.ask.options },
        _meta: { [KEY_META]: key },
      };
    }
    if (name === 'answer' || name === 'keep') return this.#fromPage(name, args);
    return text(word('mcp.no-tool', { name: String(name) }), true);
  }

  /** The page's own call: only with the key its tool's result handed it, used once, and only for what it opened. */
  async #fromPage(name: 'answer' | 'keep', args: Json): Promise<Json> {
    const key = typeof args.key === 'string' ? args.key : '';
    const w = this.#waiting.get(key);
    if (!w || (name === 'answer') !== (w.kind === 'decide')) return text(word('mcp.not-the-page'), true);
    if (w.kind === 'present') {
      this.#waiting.delete(key);
      return this.#write(
        w.path,
        { kind: 'presentation', path: w.path, name: `${w.graph}_tour`, graph: w.graph, steps: w.steps },
        word('present.kept', { name: `${w.graph}_tour` }),
      );
    }
    const picked = args.picked === null ? null : typeof args.picked === 'number' ? args.picked : -1;
    // the page is the person's own input: the pick is taken as theirs, held to the same checks as the pane's
    let answer: { picked: number | null; reason?: string } | null = null;
    const asking = new Asking(w.ask, { graph: w.graph, note: w.path }, (a) => (answer = a));
    const r = asking.answer({ press: { surface: 'desktop' } }, picked, args.reason);
    if (!r.ok || !answer) return text(r.ok ? word('decide.no-question') : r.why, true);
    this.#waiting.delete(key);
    const said = asking.said(answer);
    const settings = settingsFrom(await this.#ports.settings());
    const request = {
      kind: 'decision' as const,
      path: w.path,
      graph: w.graph,
      ask: w.ask,
      answer,
      by: settings.decider,
      at: this.#ports.now(),
    };
    return this.#write(w.path, request, said);
  }

  /** Writes the person's decision or kept presentation, through the core's checks; what the page and model are told. */
  async #write(path: string, request: Parameters<typeof recordInto>[1], said: string): Promise<Json> {
    const done = recordInto(await this.#ports.read(path), request);
    if (!done.ok) return text(`${said} ${done.why}`, true);
    await this.#ports.write(path, done.note);
    return text(request.kind === 'decision' ? `${said} ${word('decide.recorded')}` : said);
  }

  /** One message in, its answer out; null for a notification, which has none. */
  async handle(message: unknown): Promise<Json | null> {
    const m = (message ?? {}) as Json;
    const id = m.id;
    if (id === undefined || id === null) return null;
    const ok = (result: Json) => ({ jsonrpc: '2.0', id, result });
    const params = (m.params ?? {}) as Json;
    switch (m.method) {
      case 'initialize':
        return ok({
          protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL,
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'thoughtknot', version: '0.9.0' },
        });
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: TOOLS });
      case 'tools/call':
        return ok(await this.#call(params.name, (params.arguments ?? {}) as Json));
      case 'resources/list':
        return ok({ resources: [{ uri: PAGE_URI, name: 'ThoughtKnot', mimeType: PAGE_TYPE }] });
      case 'resources/read':
        if (params.uri !== PAGE_URI)
          return { jsonrpc: '2.0', id, error: { code: -32002, message: 'No such resource.' } };
        return ok({ contents: [{ uri: PAGE_URI, mimeType: PAGE_TYPE, text: await this.#ports.page() }] });
      default:
        return { jsonrpc: '2.0', id, error: { code: -32601, message: 'No such method.' } };
    }
  }
}
