// The phone's shell (ES§40, phone_shell). The app's window is opened in a real Chrome as a phone: 393 by 852 points,
// touch, with the Tauri calls answered by a note held in the page. Then:
// - a bar of four views sits at the foot, each a 56 point target: Board, Graph, Note and More.
// - one view shows at a time, so nothing stacks, and the page never grows past the screen on the Board view.
// - the board fills the screen between the header and the bar.
// - the Graph view opens on the drawing, with its 2D, 2.5D and 3D switch in reach.
// - the Note view opens on the note's own words, not the text version of its graph.
// - a computer's page has no bar and keeps its layout.
// Chrome is the one THOUGHTKNOT_CHROME names, or the first of the usual names on the PATH. Where none is found the
// browser cases skip, except in CI, which fails.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { findChrome, startChrome } from '../scripts/chrome.mjs';
import { buildApp } from '../packages/app/esbuild.config.mjs';

const NOTE =
  "# Map\nThe note's own words.\n```gql\n// graph: g · SOURCE\n(a:Idea {title: 'One'}),\n(b:Idea {title: 'Two'}),\n(a)-[:RELATES_TO]->(b)\n```\n";
const LINK = 'editor.html#token=app&note=Map.md';

describe('the phone shell, in a real browser', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the phone shell is checked in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must check the phone shell, and found no Chrome');
    console.warn(why);
  }
  const options = { skip: why ?? false, timeout: 120_000 };

  let built, server, base, browser;
  const stub = `(() => {
    const notes = { 'Map.md': ${JSON.stringify(NOTE)} };
    window.__TAURI__ = { core: { invoke: async (c, a = {}) => {
      if (c === 'own_folder') return 'Documents';
      if (c === 'read_dir') return Object.keys(notes).map((n) => [n, false]);
      if (c === 'read_text') { if (a.path in notes) return notes[a.path]; throw 'ENOENT'; }
      if (c === 'write_text') { notes[a.path] = a.text; return; }
      if (c === 'machine_found') return [];
      throw 'not in this test: ' + c;
    } } };
  })()`;

  before(async () => {
    if (why) return;
    built = mkdtempSync(join(tmpdir(), 'phone-shell-'));
    await buildApp(built);
    const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' };
    server = createServer((q, r) => {
      const file = join(built, decodeURIComponent(q.url.split(/[?#]/)[0]).replace(/\/$/, '/index.html'));
      if (!file.startsWith(built) || !existsSync(file)) return r.writeHead(404).end();
      r.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
    }).listen(0, '127.0.0.1');
    await new Promise((done) => server.once('listening', done));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await startChrome({ chrome, width: 393, height: 852, scale: 2 });
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: stub });
  });
  after(async () => {
    await browser?.stop();
    server?.close();
    if (built) rmSync(built, { recursive: true, force: true });
  });

  /** Opens the note as a phone (touch, 393 wide) or as a computer, and waits for the page to draw it. */
  async function open(phone) {
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: phone ? 393 : 1280,
      height: phone ? 852 : 900,
      deviceScaleFactor: 2,
      mobile: phone,
    });
    await browser.send('Emulation.setTouchEmulationEnabled', { enabled: phone });
    await browser.send('Page.navigate', { url: 'about:blank' });
    await browser.send('Page.navigate', { url: `${base}/${LINK}` });
    for (let i = 0; i < 200 && !(await browser.run(`Boolean(document.querySelector('.thoughtknot-board'))`)); i++)
      await new Promise((t) => setTimeout(t, 100));
    for (let i = 0; i < 100 && !(await browser.run(`${VIEWPORT_READY}`)); i++)
      await new Promise((t) => setTimeout(t, 100));
  }
  const VIEWPORT_READY = `(document.querySelector('.thoughtknot-board .thoughtknot-viewport')?.getBoundingClientRect().height || 0) > 0`;
  const DRAWING_READY = `(document.querySelector('.gn-pane .thoughtknot-pane-drawing .thoughtknot-viewport')?.getBoundingClientRect().height || 0) > 0`;
  const tap = (tab) => browser.run(`document.querySelector('.gn-tab[data-tab=${tab}]').click()`);
  const shown = (selector) =>
    browser.run(
      `[...document.querySelectorAll(${JSON.stringify(selector)})].some((e) => e.getBoundingClientRect().height > 0)`,
    );

  test('a bar of four views sits at the foot, each a large target', options, async () => {
    await open(true);
    const bar = await browser.run(`[...document.querySelectorAll('.gn-tabbar .gn-tab')].map((b) => {
      const r = b.getBoundingClientRect(); return [b.textContent, Math.round(r.width), Math.round(r.height), Math.round(r.bottom)]; })`);
    assert.deepEqual(
      bar.map((b) => b[0]),
      ['Board', 'Graph', 'Note', 'More'],
    );
    for (const [name, width, height, bottom] of bar) {
      assert.ok(width >= 44 && height >= 44, `${name} is ${width} by ${height}`);
      assert.ok(bottom <= 852, `${name} is on the screen`);
    }
    assert.equal(await browser.run(`document.querySelector('.gn-tab[aria-current]').textContent`), 'Board');
  });

  test('the Board view fills the screen: the board is tall, and the page does not scroll', options, async () => {
    await open(true);
    const m =
      await browser.run(`(() => { const v = document.querySelector('.thoughtknot-board .thoughtknot-viewport').getBoundingClientRect();
      return { height: v.height, bottom: v.bottom, scroll: document.documentElement.scrollHeight - innerHeight, over: document.documentElement.scrollWidth - innerWidth }; })()`);
    assert.ok(m.height >= 400, `the board is ${m.height} tall`);
    assert.ok(m.scroll <= 0, `the page is ${m.scroll} taller than the screen`);
    assert.ok(m.over <= 0, 'nothing scrolls sideways');
    assert.ok(m.bottom <= 852 - 56, 'the board ends above the bar');
  });

  test('one view shows at a time', options, async () => {
    await open(true);
    assert.ok(await shown('.gn-boards .thoughtknot-board'));
    assert.ok(!(await shown('.gn-pane')), 'the graph is not under the board');
    assert.ok(!(await shown('article.gn-prose')), 'nor is the note');
    await tap('graph');
    assert.ok(await shown('.gn-pane'));
    assert.ok(!(await shown('.gn-boards .thoughtknot-board')));
    await tap('note');
    assert.ok(await shown('article.gn-prose'));
    assert.ok(!(await shown('.gn-pane')));
    await tap('more');
    assert.ok(await shown('.gn-presets'));
    assert.ok(!(await shown('article.gn-prose')));
    assert.equal(await browser.run(`document.querySelector('.gn-tab[aria-current]').textContent`), 'More');
  });

  test('the Graph view opens on the drawing, with the space switch in reach', options, async () => {
    await open(true);
    await tap('graph');
    for (let i = 0; i < 100 && !(await browser.run(`${DRAWING_READY}`)); i++)
      await new Promise((t) => setTimeout(t, 100));
    assert.ok(await shown('.gn-pane .thoughtknot-pane-drawing'), 'the drawing shows, not the text');
    assert.ok(!(await shown('.gn-pane .thoughtknot-pane-text')));
    const height = await browser.run(
      `document.querySelector('.gn-pane .thoughtknot-pane-drawing .thoughtknot-viewport').getBoundingClientRect().height`,
    );
    assert.ok(height >= 450, `the drawing is ${height} tall: it fills the screen`);
  });

  test('the Note view opens on the note’s own words', options, async () => {
    await open(true);
    await tap('note');
    const top = await browser.run(`(() => {
      const prose = document.querySelector('article.gn-prose').getBoundingClientRect().top;
      const version = document.querySelector('.gn-text-version'); return [prose, version ? version.getBoundingClientRect().top : 1e9]; })()`);
    assert.ok(top[0] < top[1], 'the note comes before the text version of its graph');
    assert.ok(!(await shown('article.gn-prose pre')), 'its graph block is in the Graph view, not read as code here');
  });

  test('a computer’s page has no bar and no phone class', options, async () => {
    await open(false);
    assert.equal(await browser.run(`document.querySelector('.gn-tabbar')`), null);
    assert.equal(await browser.run(`document.documentElement.classList.contains('gn-phone')`), false);
    assert.ok(await shown('.gn-pane'), 'the drawing and the board sit together');
    assert.ok(await shown('.gn-boards .thoughtknot-board'));
  });
});
