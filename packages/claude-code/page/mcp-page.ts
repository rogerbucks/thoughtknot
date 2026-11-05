// The MCP App's page (editor spec §49: mcp_app, mcp_app_one_core, mcp_app_page_bounded). The host draws it in its
// sandboxed frame and hands it each tool's result. It shows the graph, walks a presentation, or asks the question.
// - It draws with the core and the shared display layer: the SVG the server laid out, cleaned by the core, and the
//   display layer's buttons. It holds no rule of the notation.
// - Where it cannot draw, it says why and shows the graph as text, never a blank frame.
// - It calls only the server's `answer` and `keep`, with the one-time key the result gave it. What it adds to the
//   conversation is only the person's pick and its reason.
// It speaks the MCP Apps messages, JSON-RPC over postMessage to the host.
import { cleanSvg, withPicked, word } from '@thoughtknot/core';
import type { Picked } from '@thoughtknot/core';
import { button } from '@thoughtknot/core/display/button';
import { installDomHelpers } from '@thoughtknot/core/display/dom-helpers';
import { installHost } from '@thoughtknot/core/display/host';
import { browserHost } from './browser-host.ts';

/** The view a tool's result carries: the drawing where there is one, and always the graph as lines of text. */
interface View {
  title: string;
  svg?: string;
  alt: string;
  lines: string[];
  why?: string;
}

/** A tool's result, as the host hands it to the page. */
export interface ToolResult {
  structuredContent?:
    | { kind: 'show'; view: View }
    | { kind: 'present'; view: View; steps: { caption: string; picked: Picked }[] }
    | { kind: 'decide'; view: View; question: string; options: { label: string; things: string[] }[] };
  _meta?: Record<string, unknown>;
}

/** What the page asks of the host: to call a server tool, or to put the person's pick into the conversation. */
export interface PageHost {
  call: (name: 'answer' | 'keep', args: Record<string, unknown>) => Promise<{ text: string; isError: boolean }>;
  say: (text: string) => void;
}

/** The drawing, or the graph as text with why: never a blank frame. */
export function drawView(parent: HTMLElement, view: View, picked?: Picked): void {
  const box = parent.createDiv({ cls: 'thoughtknot-mcp-drawing' });
  if (view.svg) {
    // parsed as SVG, never as HTML: the core's allowlist has already taken out any script, event or outside link
    const svg = new DOMParser().parseFromString(
      cleanSvg(picked ? withPicked(view.svg, picked) : view.svg),
      'image/svg+xml',
    );
    box.append(box.ownerDocument.importNode(svg.documentElement, true));
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', view.alt);
    return;
  }
  box.createEl('p', { cls: 'thoughtknot-mcp-why', text: `⚠ ${view.why ?? word('cc.no-pictures')}` });
  for (const line of view.lines) box.createEl('p', { text: line });
}

/** The page for one result, drawn into `root`. */
export function stage(root: HTMLElement, result: ToolResult, host: PageHost): void {
  root.empty();
  const s = result.structuredContent;
  if (!s) return void root.createEl('p', { text: word('cc.usage') });
  const key = typeof result._meta?.['thoughtknot/key'] === 'string' ? result._meta['thoughtknot/key'] : '';
  const said = root.createEl('p', { cls: 'thoughtknot-mcp-said', attr: { 'aria-live': 'polite' } });
  if (s.kind === 'show') return drawView(root, s.view);

  if (s.kind === 'present') {
    let at = 0;
    const holder = root.createDiv();
    const bar = root.createDiv({ cls: 'thoughtknot-mcp-bar' });
    const draw = () => {
      holder.empty();
      const step = s.steps[at];
      if (!step) return;
      said.setText(word('present.at', { at: at + 1, all: s.steps.length, caption: step.caption }));
      drawView(holder, s.view, step.picked);
      back.disabled = at === 0;
      next.disabled = at === s.steps.length - 1;
    };
    const move = (by: number) => {
      const to = Math.min(Math.max(at + by, 0), s.steps.length - 1);
      if (to === at) return;
      at = to;
      draw();
    };
    const back = button(bar, word('present.back'), 'arrow-left', () => move(-1), word('present.back'));
    const next = button(bar, word('present.next'), 'arrow-right', () => move(1), word('present.next'));
    const keep = button(
      bar,
      word('present.keep'),
      'download',
      () => {
        keep.disabled = true;
        void host.call('keep', { key }).then((r) => said.setText(r.text));
      },
      word('present.keep'),
    );
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') move(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') move(-1);
    });
    root.tabIndex = 0;
    return draw();
  }

  said.setText(word('decide.asks', { question: s.question }));
  drawView(root, s.view);
  const reason = root.createEl('textarea', { attr: { 'aria-label': word('decide.because', { reason: '' }) } });
  const pick = (picked: number | null) => {
    for (const b of Array.from(root.querySelectorAll('button'))) b.disabled = true;
    void host.call('answer', { key, picked, reason: reason.value }).then((r) => {
      said.setText(r.text);
      // only the pick and its reason go into the conversation, and only once the server has taken it
      if (!r.isError) host.say(r.text);
      else for (const b of Array.from(root.querySelectorAll('button'))) b.disabled = false;
    });
  };
  s.options.forEach((o, i) => {
    const row = root.createDiv({ cls: 'thoughtknot-mcp-option' });
    button(
      row,
      word('decide.pick', { label: o.label }),
      'check',
      () => pick(i),
      word('decide.pick', { label: o.label }),
    );
    row.createSpan({ text: word('decide.tied-to', { things: o.things.join(', ') }) });
  });
  button(root, word('decide.none'), 'x', () => pick(null), word('decide.none'));
}

/** The page's link to its host: JSON-RPC over postMessage, as MCP Apps sets out. */
function hostOf(win: Window): PageHost {
  let next = 1;
  const pending = new Map<number, (r: unknown) => void>();
  win.addEventListener('message', (e: MessageEvent) => {
    const m = e.data as { id?: number; result?: unknown };
    if (e.source === win.parent && typeof m?.id === 'number' && pending.has(m.id)) {
      pending.get(m.id)?.(m.result);
      pending.delete(m.id);
    }
  });
  const request = (method: string, params: unknown) =>
    new Promise<unknown>((resolve) => {
      const id = next++;
      pending.set(id, resolve);
      win.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
    });
  return {
    call: async (name, args) => {
      const r = (await request('tools/call', { name, arguments: args })) as {
        content?: { text?: string }[];
        isError?: boolean;
      };
      return { text: r?.content?.[0]?.text ?? '', isError: r?.isError === true };
    },
    say: (text) => void request('ui/message', { role: 'user', content: [{ type: 'text', text }] }),
  };
}

/** Starts the page in a host's frame: it says it is ready, then draws each tool result it is handed. */
export function startPage(win: Window & typeof globalThis): void {
  installDomHelpers(win);
  installHost(browserHost(win));
  const root = win.document.body.createDiv({ cls: 'thoughtknot-mcp' });
  const host = hostOf(win);
  win.addEventListener('message', (e: MessageEvent) => {
    const m = e.data as { method?: string; params?: ToolResult };
    if (e.source === win.parent && m?.method === 'ui/notifications/tool-result' && m.params)
      stage(root, m.params, host);
  });
  win.parent.postMessage(
    { jsonrpc: '2.0', id: 0, method: 'ui/initialize', params: { appInfo: { name: 'ThoughtKnot', version: '0.9.0' } } },
    '*',
  );
}

if (typeof window !== 'undefined' && window.parent !== window) startPage(window);
