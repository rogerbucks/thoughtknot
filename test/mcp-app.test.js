// The MCP App: show, present and decide in Claude's desktop chat and in Claude Code, from a local MCP server (editor
// spec §49, workstream Y2). The server lists the three tools, each linked to its ui:// page, and draws the same graph
// the mod draws (mcp_app). The page draws with the core and the display layer, and says why when it cannot draw
// (mcp_app_one_core). The server reads only the folder named and makes no network call; a note above the ceiling is
// refused with the reason (mcp_app_local). The page's own calls need its key, and add only the pick to the
// conversation (mcp_app_page_bounded). No remote connector is built or named (mcp_app_remote).
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { gqlBlocks, PALETTES } from '@thoughtknot/core';
import { McpServer, PAGE_URI, PAGE_TYPE, KEY_META } from '../packages/claude-code/src/mcp-server.ts';
import { viewOf } from '../packages/claude-code/src/graph-view.ts';

const READER = `// graph: reader
(question:Question {name: 'Which device?'}),
(large_reader:Option {name: 'Large reader'}),
(small_reader:Option {name: 'Small reader'}),
(large_reader)-[:ANSWERS]->(question),
(small_reader)-[:ANSWERS]->(question)`;
const noteAt = (level) => `---\nclassification: ${level}\n---\n# Reader\n\n\`\`\`gql\n${READER}\n\`\`\`\n`;
const SVG = '<svg width="10" height="10"><g id="node1" class="node"><ellipse/></g></svg>';
const lay = async (dots) => ({ svgs: dots.map(() => SVG) });
// the person's settings: Claude may read up to Internal, as the plugin keeps them
const SETTINGS = {
  classifications: ['Public', 'Internal', 'Confidential', 'Restricted'],
  aiUnlabelled: 'Restricted',
  aiModels: [{ name: 'Claude', purpose: '', ceiling: 'Internal', endpoint: '', model: '', keyName: '' }],
};

/** A folder of notes, the server over it, and what it wrote. */
async function served(settings = SETTINGS) {
  const top = mkdtempSync(join(tmpdir(), 'mcp-app-'));
  after(() => rmSync(top, { recursive: true, force: true }));
  const folder = join(top, 'vault');
  mkdirSync(folder);
  writeFileSync(join(top, 'outside.md'), noteAt('Public'));
  writeFileSync(join(folder, 'reader.md'), noteAt('Public'));
  writeFileSync(join(folder, 'secret.md'), noteAt('Confidential'));
  writeFileSync(join(folder, 'top.md'), noteAt('Restricted'));
  let keys = 0;
  const server = new McpServer({
    folder: await realpath(folder),
    realPath: (p) => realpath(p),
    read: async (p) => readFileSync(p, 'utf8'),
    write: async (p, t) => writeFileSync(p, t),
    settings: async () => settings,
    lay,
    palette: PALETTES.system,
    page: async () => '<!doctype html><p>page</p>',
    now: () => '2026-11-05T09:00:00Z',
    key: () => `key-${++keys}-abcdefghijklmnop`,
  });
  let id = 0;
  const call = async (name, args) =>
    (await server.handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { top, folder, server, call };
}
const ASK = {
  question: 'Which reader?',
  options: [
    { label: 'Large', things: ['large_reader'] },
    { label: 'Small', things: ['small_reader'] },
  ],
};

describe('mcp_app: show, present and decide, each linked to its ui:// page', () => {
  test('the server lists the three tools for the model, each linked to the page, and serves the page', async () => {
    const { server } = await served();
    const init = await server.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' },
    });
    assert.deepEqual(init.result.capabilities, { tools: {}, resources: {} });
    const { tools } = (await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).result;
    const forModel = tools.filter((t) => !t._meta.ui.visibility);
    assert.deepEqual(
      forModel.map((t) => t.name),
      ['show', 'present', 'decide'],
    );
    for (const t of tools) assert.equal(t._meta.ui.resourceUri, PAGE_URI);
    const read = (await server.handle({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: PAGE_URI } }))
      .result;
    assert.equal(read.contents[0].mimeType, PAGE_TYPE);
    assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  });

  test('a shared case draws the same graph the mod draws', async () => {
    const { call, folder } = await served();
    const shown = await call('show', { note: 'reader.md' });
    const mod = await viewOf(readFileSync(join(folder, 'reader.md'), 'utf8'), lay, PALETTES.system);
    assert.deepEqual(shown.structuredContent.view, mod);
    assert.match(shown.content[0].text, /reader: 3 things, 2 links/);
  });

  test('present gives each step picked out, and decide the question with its options and things', async () => {
    const { call } = await served();
    const steps = [
      { things: ['question'], caption: 'The question' },
      { things: ['large_reader'], caption: 'Big' },
    ];
    const p = await call('present', { note: 'reader.md', steps });
    assert.deepEqual(
      p.structuredContent.steps.map((s) => s.picked.nodes),
      [[1], [2]],
    );
    const d = await call('decide', { note: 'reader.md', ...ASK });
    assert.deepEqual(d.structuredContent.options, ASK.options);
    assert.equal(typeof d._meta[KEY_META], 'string');
    assert.doesNotMatch(JSON.stringify(d.content), /key-/);
  });
});

describe('mcp_app_one_core: the page draws with the core and the display layer, and never a blank frame', () => {
  const PAGE = readFileSync(new URL('../packages/claude-code/page/mcp-page.ts', import.meta.url), 'utf8');

  test('the page imports the core and the shared display layer, and holds no rule of the notation', () => {
    const from = [...PAGE.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    assert.ok(from.includes('@thoughtknot/core'));
    assert.ok(from.some((f) => f.startsWith('@thoughtknot/core/display/')));
    assert.ok(
      from.every((f) => f.startsWith('@thoughtknot/core') || f === './browser-host.ts'),
      from.join(', '),
    );
    assert.doesNotMatch(PAGE, /graph:|MATCH|-\[:|\bgql\b/);
  });

  test('a graph it cannot draw is shown as text, with the reason', async () => {
    const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
    const { installDomHelpers } = await import('@thoughtknot/core/display/dom-helpers');
    installDomHelpers(dom.window);
    const { drawView } = await import('../packages/claude-code/page/mcp-page.ts');
    const root = dom.window.document.body.createDiv();
    drawView(root, {
      title: 'reader',
      alt: 'reader: 3 things',
      lines: ['reader: 3 things', 'a —answers→ b'],
      why: 'Too large to draw.',
    });
    assert.match(root.textContent, /⚠ Too large to draw\./);
    assert.match(root.textContent, /a —answers→ b/);
    assert.equal(root.querySelector('svg'), null);
  });
});

describe('mcp_app_local: only the folder named, no network, and the gate before anything reaches the conversation', () => {
  test('a note outside the folder, by a path, a .. or a link, is refused and not read', async () => {
    const { call, top, folder } = await served();
    symlinkSync(join(top, 'outside.md'), join(folder, 'link.md'));
    for (const note of [join(top, 'outside.md'), '../outside.md', 'link.md', 'reader.txt', '/etc/passwd']) {
      const r = await call('show', { note });
      assert.equal(r.isError, true, note);
      assert.equal(r.structuredContent, undefined);
    }
  });

  test('a note above the ceiling, or at the highest classification, is refused with the reason, nothing of it said', async () => {
    const { call } = await served();
    for (const note of ['secret.md', 'top.md']) {
      for (const [tool, args] of [
        ['show', {}],
        ['present', { steps: [{ things: ['question'], caption: 'Q' }] }],
        ['decide', ASK],
      ]) {
        const r = await call(tool, { note, ...args });
        assert.equal(r.isError, true, `${tool} ${note}`);
        assert.equal(r.structuredContent, undefined);
        assert.doesNotMatch(r.content[0].text, /Which device|large_reader/);
        assert.match(r.content[0].text, /Confidential|highest|Restricted/);
      }
    }
  });

  test('with no settings saved, the strictest hold: an unlabelled note is refused', async () => {
    const { call, folder } = await served(null);
    writeFileSync(join(folder, 'plain.md'), `# Plain\n\n\`\`\`gql\n${READER}\n\`\`\`\n`);
    assert.equal((await call('show', { note: 'plain.md' })).isError, true);
  });

  test('the server and its process make no network call, open no port and run over standard input and output', () => {
    for (const f of ['src/mcp-server.ts', 'bin/mcp-process.ts', 'page/mcp-page.ts']) {
      const text = readFileSync(new URL(`../packages/claude-code/${f}`, import.meta.url), 'utf8');
      assert.doesNotMatch(
        text,
        /node:(?:https?|net|tls|dgram|dns|http2)\b|\bfetch\s*\(|XMLHttpRequest|WebSocket|listen\(|https?:\/\//,
        f,
      );
    }
    assert.match(
      readFileSync(new URL('../packages/claude-code/bin/mcp-process.ts', import.meta.url), 'utf8'),
      /process\.stdin/,
    );
  });
});

describe('mcp_app_page_bounded: the page’s calls pass the gate, write only proposals the person made, add only the pick', () => {
  test('an answer with no key, a wrong one or one used already is refused, and writes nothing', async () => {
    const { call, folder } = await served();
    const before = readFileSync(join(folder, 'reader.md'), 'utf8');
    assert.equal((await call('answer', { picked: 0 })).isError, true);
    assert.equal((await call('answer', { key: 'guess', picked: 0 })).isError, true);
    const d = await call('decide', { note: 'reader.md', ...ASK });
    assert.equal((await call('keep', { key: d._meta[KEY_META] })).isError, true);
    assert.equal(readFileSync(join(folder, 'reader.md'), 'utf8'), before);
    const ok = await call('answer', { key: d._meta[KEY_META], picked: 1, reason: 'It fits a pocket.' });
    assert.equal(ok.isError, undefined);
    assert.equal((await call('answer', { key: d._meta[KEY_META], picked: 0 })).isError, true);
  });

  test('the pick is kept as a decision through the core, and what the page adds holds only the pick and its reason', async () => {
    const { call, folder } = await served();
    const d = await call('decide', { note: 'reader.md', ...ASK });
    const r = await call('answer', { key: d._meta[KEY_META], picked: 1, reason: 'It fits a pocket.' });
    assert.equal(
      r.content[0].text,
      'You picked Small. Because: It fits a pocket. Your answer is kept in the note as a decision.',
    );
    const blocks = gqlBlocks(readFileSync(join(folder, 'reader.md'), 'utf8')).map((b) => b.text);
    assert.equal(blocks[0], READER);
    assert.match(blocks[1], /^\/\/ graph: judgements\n/);
  });

  test('a call to write outright, or to any tool the server lacks, is refused', async () => {
    const { call } = await served();
    for (const name of ['write', 'edit', 'propose'])
      assert.equal((await call(name, { note: 'reader.md', text: 'x' })).isError, true);
  });

  test('a kept presentation is written only once Keep is pressed in the page', async () => {
    const { call, folder } = await served();
    const p = await call('present', { note: 'reader.md', steps: [{ things: ['question'], caption: 'Q' }] });
    assert.doesNotMatch(readFileSync(join(folder, 'reader.md'), 'utf8'), /presentation/);
    await call('keep', { key: p._meta[KEY_META] });
    assert.match(readFileSync(join(folder, 'reader.md'), 'utf8'), /\/\/ graph: reader_tour_presentation/);
  });

  /**
   * The page started in a DOM, as a host's frame holds it. It gives what the page posts to the host, and a way to hand
   * it a message from the host. The host answers each `tools/call` with `answers`, in turn.
   */
  async function framed(answers = []) {
    const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
    const win = dom.window;
    const posted = [];
    win.postMessage = (m) => {
      posted.push(m);
      if (m.method === 'tools/call') {
        const r = answers.shift() ?? { content: [{ type: 'text', text: 'Done.' }] };
        queueMicrotask(() => fromHost({ jsonrpc: '2.0', id: m.id, result: r }));
      }
    };
    const fromHost = (data, source = win) => win.dispatchEvent(new win.MessageEvent('message', { data, source }));
    const { startPage } = await import('../packages/claude-code/page/mcp-page.ts');
    startPage(win);
    const settle = () => new Promise((r) => setTimeout(r, 0));
    const buttons = () => [...win.document.querySelectorAll('button')];
    const press = (label) =>
      buttons()
        .find((b) => b.getAttribute('aria-label')?.startsWith(label))
        .click();
    const said = () => win.document.querySelector('.thoughtknot-mcp-said')?.textContent ?? '';
    return { win, posted, fromHost, settle, buttons, press, said };
  }
  const VIEW = { title: 'reader', svg: SVG, alt: 'reader: 3 things', lines: ['reader: 3 things'] };
  const result = (structuredContent) => ({
    method: 'ui/notifications/tool-result',
    params: { structuredContent, _meta: { [KEY_META]: 'key-1' } },
  });

  test('the page says it is ready, draws only what its host hands it, and walks a presentation by button and key', async () => {
    const page = await framed();
    assert.equal(page.posted[0].method, 'ui/initialize');
    // a message from any frame but its host is not drawn
    page.fromHost(result({ kind: 'show', view: VIEW }), null);
    assert.equal(page.win.document.querySelector('svg'), null);
    page.fromHost({ method: 'ui/notifications/tool-result', params: {} });
    assert.match(
      page.win.document.body.textContent,
      /\S/,
      'a result with nothing to show says so, never a blank frame',
    );
    page.fromHost(result({ kind: 'show', view: VIEW }));
    assert.equal(page.win.document.querySelector('[role=img]').getAttribute('aria-label'), 'reader: 3 things');

    const steps = [
      { caption: 'The question', picked: { nodes: [1], edges: [] } },
      { caption: 'The answer', picked: { nodes: [], edges: [] } },
    ];
    page.fromHost(result({ kind: 'present', view: VIEW, steps }));
    assert.match(page.said(), /1 of 2.*The question/);
    const [back, next] = page.buttons();
    assert.equal(back.disabled, true);
    next.click();
    assert.match(page.said(), /2 of 2.*The answer/);
    assert.equal(next.disabled, true);
    const root = page.win.document.querySelector('.thoughtknot-mcp');
    root.dispatchEvent(new page.win.KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    assert.match(page.said(), /1 of 2/);
    root.dispatchEvent(new page.win.KeyboardEvent('keydown', { key: 'PageUp' }));
    assert.match(page.said(), /1 of 2/, 'nothing moves past the first step');
    root.dispatchEvent(new page.win.KeyboardEvent('keydown', { key: 'PageDown' }));
    assert.match(page.said(), /2 of 2/);
    root.dispatchEvent(new page.win.KeyboardEvent('keydown', { key: 'ArrowRight' }));
    assert.match(page.said(), /2 of 2/);

    page.press('Keep');
    await page.settle();
    const keep = page.posted.find((m) => m.method === 'tools/call');
    assert.deepEqual(keep.params, { name: 'keep', arguments: { key: 'key-1' } });
    assert.equal(page.said(), 'Done.');
    assert.equal(page.posted.filter((m) => m.method === 'ui/message').length, 0, 'keeping adds nothing to the chat');
  });

  test('the page asks the question, and adds only the pick and its reason, once the server has taken it', async () => {
    const page = await framed([
      { content: [{ type: 'text', text: 'Refused.' }], isError: true },
      { content: [{ type: 'text', text: 'You picked Large reader. Because: bigger text' }] },
      {},
    ]);
    const options = [
      { label: 'Large reader', things: ['large_reader'] },
      { label: 'Small reader', things: ['small_reader'] },
    ];
    page.fromHost(result({ kind: 'decide', view: VIEW, question: 'Which device?', options }));
    assert.match(page.said(), /Which device\?/);
    assert.match(page.win.document.body.textContent, /large_reader/);
    page.win.document.querySelector('textarea').value = 'bigger text';

    page.press('Pick Large reader');
    assert.ok(
      page.buttons().every((b) => b.disabled),
      'no second press while the server answers',
    );
    await page.settle();
    assert.equal(page.said(), 'Refused.');
    assert.ok(
      page.buttons().every((b) => !b.disabled),
      'a refused answer can be given again',
    );
    assert.equal(page.posted.filter((m) => m.method === 'ui/message').length, 0);

    page.press('Pick Large reader');
    await page.settle();
    const calls = page.posted.filter((m) => m.method === 'tools/call');
    assert.deepEqual(calls[1].params, {
      name: 'answer',
      arguments: { key: 'key-1', picked: 0, reason: 'bigger text' },
    });
    const added = page.posted.filter((m) => m.method === 'ui/message');
    assert.equal(added.length, 1);
    assert.deepEqual(added[0].params.content, [
      { type: 'text', text: 'You picked Large reader. Because: bigger text' },
    ]);

    page.fromHost(result({ kind: 'decide', view: VIEW, question: 'Which device?', options }));
    page.press('None');
    await page.settle();
    assert.equal(page.posted.filter((m) => m.method === 'tools/call').at(-1).params.arguments.picked, null);
  });
});

describe('mcp_app_remote: no remote connector until a security review approves one', () => {
  test('nothing builds or names a remote connector: the server is local, over standard input and output', () => {
    const dir = new URL('../packages/claude-code/', import.meta.url);
    const files = ['src/mcp-server.ts', 'bin/mcp-process.ts', 'page/mcp-page.ts', 'esbuild.config.mjs'];
    for (const f of files) {
      const text = readFileSync(new URL(f, dir), 'utf8');
      assert.doesNotMatch(text, /streamable-?http|\bsse\b|remote connector|mcpServers|oauth/i, f);
    }
    assert.ok(!readdirSync(new URL('mod/', dir)).some((f) => /remote|connector/i.test(f)));
  });

  test('the guide says a remote connector waits for a security review', () => {
    const guide = readFileSync(new URL('../packages/claude-code/GUIDE.md', import.meta.url), 'utf8');
    assert.match(guide, /remote connector[^.]*waits for a security review/i);
  });
});
