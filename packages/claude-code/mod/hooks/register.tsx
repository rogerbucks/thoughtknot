// /graph: draws a graph note's first graph in a pane, with the ThoughtKnot core (spec §10, a Claude Code host). Reading,
// the layout source and theming run here, in the mod's own environment (graph.js); Graphviz runs as a process through
// node (bin/render.mjs), since a mod has no WebAssembly. Where no drawing can be, the pane shows the graph as text with
// the reason: when node is missing, on the terminal (which draws no Svg), and for a graph too large to draw.
//
// /graph edit <note> starts the session's browser editor (spec §26, bin/editor-server.mjs) and draws, in a pane of its
// own, the address to open in the browser pane. The address carries the session's secret token, so it is drawn and
// copied and goes nowhere else: not into the command's answer, a log line, a toast, state or the conversation
// (cc_transcript_clean). /graph stop stops the server; so does the session ending. When the server cannot start, the
// answer says why and the pane shows the drawing /graph gives.
import { atom, read, update } from 'claude-code';
import type { EngineInterface, Register } from 'claude-code';

import type { GraphView } from '../types';
import type { Asking as AskingT, DecisionAnswer, PresentStep, StagePorts, Walk as WalkT } from './graph.js';
import {
  Asking,
  decideThrough,
  pickArgs,
  pickedView,
  presentThrough,
  showThrough,
  Walk,
  cleanSvg,
  dataFolderRefusal,
  EditorLauncher,
  guardDataFolder,
  guardGateFiles,
  guardOpenNote,
  pathOf,
  confirmArgs,
  editArgs,
  followSystemLanguage,
  layOut,
  notePath,
  PANE_PALETTE,
  readLinkVia,
  realPathVia,
  sayEdit,
  sayProposed,
  sayStopped,
  settingsFrom,
  viewOf,
  word,
  pressFromPerson,
} from './graph.js';

const PANE = 'graph';
const EDITOR_PANE = 'graph-editor';
const PROPOSE = 'mcp__thoughtknot__propose';
const PROPOSE_TOOL =
  'Propose changes to the graph of the note open in the ThoughtKnot editor. Nothing is applied: the changes wait on a card ' +
  'in the editor for the user to accept or reject. Each change is one of: {op: "add-thing", name, kind, properties?}, ' +
  '{op: "add-link", from, type, to}, {op: "set", thing, key, value}, {op: "remove-thing", thing}, ' +
  '{op: "remove-link", from, type, to}, each with an optional "reason". Names are one word. You cannot add a Person, ' +
  'a Model or a Step. "read" lists what you read, if you say so.';
const PROPOSE_SCHEMA = {
  type: 'object',
  properties: {
    changes: { type: 'array', items: { type: 'object', properties: { op: { type: 'string' } }, required: ['op'] } },
    read: { type: 'array', items: { type: 'string' } },
  },
  required: ['changes'],
};
const SHOW = 'mcp__thoughtknot__show';
const PRESENT = 'mcp__thoughtknot__present';
const DECIDE = 'mcp__thoughtknot__decide';
const LINKS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: { from: { type: 'string' }, type: { type: 'string' }, to: { type: 'string' } },
    required: ['from', 'type', 'to'],
  },
};
const STAGE_TOOLS = [
  {
    name: 'show',
    description:
      'Show the graph of a note in the ThoughtKnot pane, or turn it to things, links, a path or a lens you name. ' +
      'Nothing in the note changes. "note" is its path. Things are node names; links are {from, type, to}; "path" is a ' +
      'path id; "lens" is a saved lens or a query such as "Option WHERE price < 3". A note above your level is not shown.',
    inputSchema: {
      type: 'object',
      properties: {
        note: { type: 'string' },
        things: { type: 'array', items: { type: 'string' } },
        links: LINKS_SCHEMA,
        path: { type: 'string' },
        lens: { type: 'string' },
      },
      required: ['note'],
    },
  },
  {
    name: 'present',
    description:
      'Walk the person through the graph of a note in the ThoughtKnot pane, one step at a time. Each step names the ' +
      'things and links to pick out and a short caption. The person moves with Next and Back. Every name must be in the ' +
      'graph, or nothing is shown and you are told which.',
    inputSchema: {
      type: 'object',
      properties: {
        note: { type: 'string' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              things: { type: 'array', items: { type: 'string' } },
              links: LINKS_SCHEMA,
              caption: { type: 'string' },
            },
            required: ['caption'],
          },
        },
      },
      required: ['note', 'steps'],
    },
  },
  {
    name: 'decide',
    description:
      'Ask the person a question about the graph of a note, in the ThoughtKnot pane, with two to six options, each tied ' +
      'to things in the graph. Only the person answers. You get back the option they picked and their reason, or that ' +
      'they chose none. Their answer is kept in the note as a decision.',
    inputSchema: {
      type: 'object',
      properties: {
        note: { type: 'string' },
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
  },
] as const;
const view = atom({ plugin: 'thoughtknot', key: 'view' } as const, null as GraphView | null);
// counts changes to the editor pane so it is drawn again; it holds no address, token or note
const editorChanges = atom({ plugin: 'thoughtknot', key: 'editor' } as const, 0);

// counts changes of the walk or the question in the graph pane, so it is drawn again; it holds no note
const stageChanges = atom({ plugin: 'thoughtknot', key: 'stage' } as const, 0);

/** The presentation being walked: the walk, the note, and whether the person has kept it. */
let walking: { walk: WalkT; path: string; note: string; graph: string; kept: string | null } | null = null;
/** The question waiting for the person's answer. */
let asking: AskingT | null = null;

/** The session's editor: made when first asked for, and kept for the module's life (its server dies with it). */
let launcher: EditorLauncher | null = null;

/** The mod's data folder (settings and drafts): `CLAUDE_PLUGIN_DATA`, else the plugins data folder under the config. */
async function dataFolderOf($: EngineInterface): Promise<{ data: string; home?: string }> {
  const home = await $.env.get('HOME');
  // an empty CLAUDE_PLUGIN_DATA is unset
  const data = (await $.env.get('CLAUDE_PLUGIN_DATA')) || `${home ?? ''}/.claude/plugins/data/thoughtknot`;
  return home ? { data, home } : { data };
}

/** The user's settings, saved as settings.json in the data folder; none, or one that cannot be read, is the defaults. */
async function settingsAt($: EngineInterface, data: string) {
  try {
    return settingsFrom(JSON.parse(await $.fs.read(`${data}/settings.json`)));
  } catch {
    return settingsFrom(null);
  }
}

/** The launcher over this host's calls; the server it runs is the mod's own bin/editor-server.mjs. */
async function launcherOf($: EngineInterface): Promise<EditorLauncher> {
  if (launcher) return launcher;
  const { data } = await dataFolderOf($);
  launcher = new EditorLauncher({
    spawn: (request) => $.process.spawn(request),
    // a matrix note is read only when its real path, links settled, is inside the vault: the mod's file calls do not
    // settle links, so node is asked
    realPath: realPathVia(
      (request) => $.process.spawn(request),
      ['node', `${$.plugin.root}/bin/real-path.mjs`],
      (ms, fn) => $.clock.after(ms, fn),
    ),
    exists: (path) => $.fs.exists(path),
    read: (path) => $.fs.read(path),
    // the user's settings, saved as settings.json in the plugin data folder; none, or one that cannot be read, is the
    // defaults, which are the strictest: Claude's ceiling the lowest, a note with no classification the highest
    settings: () => settingsAt($, data),
    after: (ms, fn) => $.clock.after(ms, fn),
    cwd: await $.session.cwd(),
    server: ['node', `${$.plugin.root}/bin/editor-server.mjs`],
    drafts: data,
    // Claude's proposals: a key made for each start, and the shipped sender (node), which is handed the request on its
    // standard input so the key is in no command line (cc_claude_proposes)
    key: () => {
      const bytes = new Uint8Array(32);
      globalThis.crypto.getRandomValues(bytes);
      return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    },
    propose: async (request) => {
      const ran = await $.process.run(['node', `${$.plugin.root}/bin/propose.mjs`], {
        stdin: JSON.stringify(request),
        timeoutMs: 30_000,
      });
      return JSON.parse(ran.stdout) as { status: number; text: string };
    },
    changed: () => void update($, editorChanges, (n) => n + 1).then(() => $.ui.invalidate('ui.render')),
  });
  return launcher;
}

/** The view of the note at `path`, or of why it could not be read. */
async function viewAt($: EngineInterface, path: string): Promise<GraphView> {
  let note: string;
  try {
    note = await $.fs.read(path);
  } catch (err) {
    const why = word('cc.could-not-read', { path, why: err instanceof Error ? err.message : String(err) });
    return { title: path, alt: why, lines: [why] };
  }
  const run = (argv: readonly string[], stdin: string, timeoutMs: number) => $.process.run(argv, { stdin, timeoutMs });
  // the drawing carries light and dark and follows the app's own appearance (PANE_PALETTE says why)
  return viewOf(note, (dots) => layOut(dots, $.plugin.root, run), PANE_PALETTE);
}

/**
 * Draws the note in the graph pane, as /graph does; the text it answers with. The pane is one Claude can read, so the
 * note is held to the same gate as the editor's (cc_classified_asks, cc_credential_never): one that may not open is not
 * drawn, and the answer says why, with no text of the note.
 */
async function drawNote($: EngineInterface, path: string): Promise<string> {
  const gate = await (await launcherOf($)).gate(path, await $.session.cwd());
  if ('refuse' in gate) return word('cc.refused-not-drawn', { why: gate.refuse });
  if ('ask' in gate) return word('cc.asks-not-drawn', { why: gate.ask, path });
  const shown = await viewAt($, path);
  await update($, view, () => shown);
  await $.ui.open({ id: PANE, title: word('cc.pane-title', { title: shown.title }) });
  return shown.why ? word('cc.shown-as-text', { alt: shown.alt, why: shown.why }) : shown.alt;
}

/** What show, present and decide need of this host: the same gate as /graph, the note read, the layout, the palette. */
async function stagePorts($: EngineInterface): Promise<StagePorts> {
  const launcher = await launcherOf($);
  const cwd = await $.session.cwd();
  const run = (argv: readonly string[], stdin: string, timeoutMs: number) => $.process.run(argv, { stdin, timeoutMs });
  return {
    gate: (path) => launcher.gate(path, cwd),
    read: (path) => $.fs.read(path),
    lay: (dots) => layOut(dots, $.plugin.root, run),
    palette: PANE_PALETTE,
  };
}

/** Puts a view in the graph pane and opens it, drawing the stage again. */
async function putInPane($: EngineInterface, shown: GraphView) {
  await update($, view, () => shown);
  await update($, stageChanges, (n) => n + 1);
  await $.ui.open({ id: PANE, title: word('cc.pane-title', { title: shown.title }) });
  await $.ui.invalidate('ui.render');
}

/** Draws the step the walk is on, picked out, with its caption. */
async function drawStep($: EngineInterface) {
  if (!walking) return;
  const ports = await stagePorts($);
  const shown = await pickedView(walking.note, walking.walk.step, walking.walk.said(), ports.lay, ports.palette);
  if ('view' in shown) await putInPane($, shown.view);
}

/** Writes the person's decision or kept presentation into the note, through node; what the pane says of it. */
async function record($: EngineInterface, request: unknown): Promise<string> {
  try {
    const ran = await $.process.run(['node', `${$.plugin.root}/bin/record.mjs`], {
      stdin: JSON.stringify(request),
      timeoutMs: 30_000,
    });
    return (JSON.parse(ran.stdout) as { text: string }).text;
  } catch (err) {
    return word('decide.not-recorded', { why: err instanceof Error ? err.message : String(err) });
  }
}

/** The person's answer to the waiting question, from a press or the composer; what they are told when it is refused. */
function answerWith(from: { press: unknown } | { origin: unknown }, picked: number | null, reason?: string) {
  if (!asking || asking.answered) return word('decide.no-question');
  const r = asking.answer(from, picked, reason);
  return r.ok ? null : r.why;
}

export const register: Register = (on) => {
  // the pane's words are said in the system's language (spec §42)
  followSystemLanguage();
  // Claude's own writes to the data folder are refused (spec §26): it could loosen its own gate. So are its writes to
  // the note open in the editor (cc_claude_proposes, risk AI-1): it changes that note only by the propose tool, which
  // the refusal names. So are its writes to the matrix note and to a classification line (risk TRUST-1). Every tool is
  // hooked, as the guards judge any tool whose input names a path, not only the ones listed (risk TRUST-2). A guard
  // that fails refuses too. Reads are not judged.
  on('tool.call', async ($, e, next) => {
    const tool = e.tool;
    const input = e as Record<string, unknown>;
    if (tool !== 'Bash' && pathOf(tool, input) === null) return next(e);
    const { data, home } = await dataFolderOf($);
    const ports = {
      ...(home ? { home } : {}),
      cwd: await $.session.cwd(),
      realPath: realPathVia(
        (request) => $.process.spawn(request),
        ['node', `${$.plugin.root}/bin/real-path.mjs`],
        (ms, fn) => $.clock.after(ms, fn),
      ),
      readLink: readLinkVia(
        (request) => $.process.spawn(request),
        ['node', `${$.plugin.root}/bin/real-path.mjs`],
        (ms, fn) => $.clock.after(ms, fn),
      ),
    };
    const refusal =
      (await guardDataFolder(tool, input, { data, ...ports })) ??
      (await guardOpenNote(tool, input, { note: launcher?.note ?? null, ...ports })) ??
      (await guardGateFiles(tool, input, {
        matrixNote: (await settingsAt($, data)).aiMatrixNote ?? null,
        read: (path) => $.fs.read(path),
        ...ports,
      }));
    return refusal === null ? next(e) : { deny: refusal };
  }).catch(($, e, next) => (next.called ? next(e) : { deny: dataFolderRefusal() }));

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'graph', description: word('cc.command') });
    // the one tool Claude has here: to propose changes to the note open in the editor. It writes nothing itself.
    await $.tool.register({
      name: 'propose',
      description: PROPOSE_TOOL,
      inputSchema: PROPOSE_SCHEMA,
      isDeferred: false,
    });
    // Claude shows, presents and asks in the graph pane (spec §49). None of them writes: only the person's answer does
    for (const tool of STAGE_TOOLS) await $.tool.register({ ...tool, isDeferred: false });
    return next(e);
  });

  on('tool.call', { tool: SHOW }, async ($, e) => {
    const shown = await showThrough(await stagePorts($), e);
    if (!shown.view) return { deny: shown.text };
    walking = null;
    await putInPane($, shown.view);
    return { result: shown.text };
  });

  on('tool.call', { tool: PRESENT }, async ($, e) => {
    const got = await presentThrough(await stagePorts($), e);
    if ('text' in got) return { deny: got.text };
    const drawn = got.steps as PresentStep[];
    const graph = /\/\/\s*graph:\s*(\w+)/.exec(got.note)?.[1] ?? 'graph';
    walking = { walk: new Walk(drawn), path: got.path, note: got.note, graph, kept: null };
    await drawStep($);
    return { result: walking.walk.said() };
  });

  // Claude asks; the call waits for the person's own answer in the pane or the composer, then is told only that
  on('tool.call', { tool: DECIDE }, async ($, e) => {
    if (asking && !asking.answered) return { deny: word('decide.one-at-a-time') };
    const ports = await stagePorts($);
    const got = await decideThrough(ports, e);
    if ('text' in got) return { deny: got.text };
    const note = await $.fs.read(got.path);
    const shown = await pickedView(
      note,
      got.focus,
      word('decide.asks', { question: got.ask.question }),
      ports.lay,
      ports.palette,
    );
    const answer = await new Promise<DecisionAnswer>((resolve) => {
      asking = new Asking(got.ask, { graph: got.graph, note: got.path }, resolve);
      walking = null;
      if ('view' in shown) void putInPane($, shown.view);
    });
    const { data } = await dataFolderOf($);
    const by = (await settingsAt($, data)).decider;
    const at = new Date().toISOString();
    const kept = await record($, { kind: 'decision', path: got.path, graph: got.graph, ask: got.ask, answer, by, at });
    await update($, stageChanges, (n) => n + 1);
    await $.ui.invalidate('ui.render');
    return { result: `${(asking as AskingT).said(answer)} ${kept}` };
  });

  // Claude proposes; the server makes the change set, and the user accepts or rejects it on the card (cc_claude_proposes)
  on('tool.call', { tool: PROPOSE }, async ($, e) => {
    const outcome = await (await launcherOf($)).propose({ changes: e.changes, read: e.read });
    return outcome.ok ? { result: sayProposed(outcome) } : { deny: sayProposed(outcome) };
  });

  on('command.run', { command: 'graph' }, async ($, e) => {
    if (e.args.trim() === 'stop') {
      const stopped = launcher ? await launcher.stop('/graph stop') : false;
      return { text: stopped ? sayStopped('/graph stop') : word('cc.editor.usage') };
    }
    const origin = (e as { origin?: unknown }).origin;
    const pick = pickArgs(e.args);
    if (pick) {
      const refused = answerWith({ origin }, pick.n === null ? null : pick.n - 1, pick.reason);
      return { text: refused ?? word('decide.recorded') };
    }
    if (walking && /^\s*(next|back)\s*$/.test(e.args)) {
      if (e.args.trim() === 'next') walking.walk.next();
      else walking.walk.back();
      await drawStep($);
      return { text: walking.walk.said() };
    }
    const confirming = confirmArgs(e.args);
    const editing = editArgs(e.args);
    if (confirming || editing !== null) {
      // who ran the command, as the host says: only the composer is the person typing, and nothing else may say yes
      const opened = confirming
        ? await (await launcherOf($)).confirm(origin)
        : await (await launcherOf($)).edit(editing ?? '', await $.session.cwd(), origin);
      if (!opened.ok) {
        // the editor did not start: say why, and show the drawing /graph gives, unless the gate held the note back
        if (editing && !opened.held) await drawNote($, editing);
        return { text: sayEdit(opened) };
      }
      await update($, editorChanges, (n) => n + 1);
      await $.ui.open({ id: EDITOR_PANE, title: word('cc.editor.pane-title'), focus: true });
      return { text: sayEdit(opened) };
    }
    const path = notePath(e.args);
    if (!path) return { text: word('cc.usage') };
    return { text: await drawNote($, path) };
  });

  // the session ending ends its server
  on('session.end', async ($, e, next) => {
    await launcher?.stop(word('server.session-ended'));
    return next(e);
  });

  // the one place the address is read: to draw it for the person, and to copy it for them
  on('ui.render', { component: 'Pane', requestId: EDITOR_PANE }, async ($, e) => {
    const { Box, Text, Link, Button } = $.ui.resolve(e);
    await read($, editorChanges);
    const href = launcher?.link ?? null;
    if (href === null) {
      const ended = launcher?.ended;
      return <Text dimColor>{ended ? sayStopped(ended) : word('cc.editor.usage')}</Text>;
    }
    return (
      <Box flexDirection="column">
        <Text>{word('cc.editor.open-address')}</Text>
        <Link href={href} label={word('cc.editor.open-link')} />
        <Button label={word('cc.editor.copy')} onPress={(press) => $.ui.copy({ text: href, surface: press.surface })} />
        <Text dimColor>{word('cc.editor.secret')}</Text>
      </Box>
    );
  });

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e);
    const { Box, Text } = elements;
    const shown = await read($, view);
    await read($, stageChanges);
    if (!shown) return <Text dimColor>{word('cc.usage')}</Text>;
    const drawing = stageDrawing(elements, e.surface, shown);
    const { Button } = elements;
    // the walk: Back and Next, the person setting the pace, and Keep, which writes the steps only once pressed
    if (walking) {
      const w = walking;
      const move = (to: 'next' | 'back') => async () => {
        if (to === 'next') w.walk.next();
        else w.walk.back();
        await drawStep($);
      };
      const keep = async (press: unknown) => {
        if (!pressFromPerson(press)) return;
        w.kept = await record($, {
          kind: 'presentation',
          path: w.path,
          name: `${w.graph}_tour`,
          graph: w.graph,
          steps: w.walk.steps,
        });
        await update($, stageChanges, (n) => n + 1);
        await $.ui.invalidate('ui.render');
      };
      return (
        <Box flexDirection="column">
          <Text>{w.walk.said()}</Text>
          {drawing}
          <Box flexDirection="row">
            <Button label={word('present.back')} disabled={w.walk.first} onPress={move('back')} />
            <Button label={word('present.next')} disabled={w.walk.last} onPress={move('next')} />
            <Button label={word('present.keep')} disabled={w.kept !== null} onPress={keep} />
          </Box>
          {w.walk.last ? <Text dimColor>{word('present.done')}</Text> : null}
          {w.kept ? <Text>{w.kept}</Text> : null}
        </Box>
      );
    }
    // the question: each option beside the things it is tied to, and None; only the person's press answers
    if (asking && !asking.answered) {
      const q = asking;
      const pressed = (picked: number | null) => async (press: unknown) => {
        answerWith({ press }, picked);
        await update($, stageChanges, (n) => n + 1);
        await $.ui.invalidate('ui.render');
      };
      return (
        <Box flexDirection="column">
          <Text>{word('decide.asks', { question: q.ask.question })}</Text>
          {drawing}
          {q.ask.options.map((o, i) => (
            <Box key={`option-${i}`} flexDirection="row">
              <Button label={word('decide.pick', { label: o.label })} onPress={pressed(i)} />
              <Text dimColor>{word('decide.tied-to', { things: o.things.join(', ') })}</Text>
            </Box>
          ))}
          <Button label={word('decide.none')} onPress={pressed(null)} />
          <Text dimColor>{word('decide.not-the-person')}</Text>
        </Box>
      );
    }

    return drawing;
  });
};

/** The graph pane's drawing: the SVG where the surface draws one, else the text, with why. Never a blank pane. */
function stageDrawing(elements: any, surface: string, shown: GraphView) {
  const { Box, Text } = elements;
  // the terminal draws no Svg (Image and Raster only), though `'Svg' in` its table holds: the text stands in there
  const Svg = surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined;
  // the drawing passes the allowlist before the pane shows it: no script, event or outside link (TRUST-7)
  if (Svg && shown.svg) return <Svg source={cleanSvg(shown.svg)} alt={shown.alt} />;
  // never text with no reason: a graph that could be drawn says why it is text here
  const why = shown.why ?? (shown.svg ? word('cc.no-pictures') : undefined);
  return (
    <Box flexDirection="column">
      {why ? <Text color="warning">⚠ {why}</Text> : null}
      {shown.lines.map((line: string, i: number) => (
        <Text key={`line-${i}`}>{line}</Text>
      ))}
    </Box>
  );
}
