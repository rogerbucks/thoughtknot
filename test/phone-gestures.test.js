// The phone's gestures (ES§40, phone_gestures). The app's window is opened in a real Chrome as a phone.
// It is 393 by 852 points, and driven by real touches (DevTools Input.dispatchTouchEvent), not clicks. Then:
// - a tap on each tab of the bar changes the view the page shows.
// - one finger dragging the board or the graph's drawing moves it, and the page itself does not scroll.
// - two fingers pinching the board or the drawing zoom it, and the page does not zoom.
// - a tap on a board item or a graph node selects it, as a click does.
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
  "# Map\nThe note's own words.\n```gql\n// graph: g · SOURCE\n(a:Idea {title: 'One'}),\n(b:Idea {title: 'Two'}),\n(a)-[:RELATES_TO]->(b)\n```\n" +
  "```gql\n// graph: plan · BOARD ON g\n(s:Sticky {x: 0, y: 0, w: 200, h: 120, text: 'Tap me'}),\n(t:Sticky {x: 300, y: 0, w: 200, h: 120, text: 'Not me'})\n```\n";
const LINK = 'editor.html#token=app&note=Map.md';
const BOARD = '.thoughtknot-board .thoughtknot-viewport';
const DRAWING = '.gn-pane .thoughtknot-pane-drawing .thoughtknot-viewport';

describe('the phone’s gestures, in a real browser', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the phone’s gestures is checked in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must check the phone’s gestures, and found no Chrome');
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
    built = mkdtempSync(join(tmpdir(), 'phone-touch-'));
    await buildApp(built);
    const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' };
    server = createServer((q, r) => {
      const file = join(built, decodeURIComponent(q.url.split(/[?#]/)[0]).replace(/\/$/, '/index.html'));
      if (!file.startsWith(built) || !existsSync(file)) return r.writeHead(404).end();
      r.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
    }).listen(0, '127.0.0.1');
    await new Promise((done) => server.once('listening', done));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await browser?.stop();
    server?.close();
    if (built) rmSync(built, { recursive: true, force: true });
  });

  const wait = (ms) => new Promise((t) => setTimeout(t, ms));
  async function until(expression) {
    for (let i = 0; i < 100 && !(await browser.run(expression)); i++) await wait(100);
  }
  const ready = (selector) =>
    `(document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().height || 0) > 0`;

  /** Opens the note as a phone with touch, and waits for the board to draw. */
  async function open() {
    // A fresh Chrome for each case: after a two finger pinch Chrome keeps ignoring the next touches of that page.
    await browser?.stop();
    browser = await startChrome({ chrome, width: 393, height: 852, scale: 2 });
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: stub });
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 393,
      height: 852,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await browser.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await browser.send('Page.navigate', { url: 'about:blank' });
    await browser.send('Page.navigate', { url: `${base}/${LINK}` });
    await until(`Boolean(document.querySelector('.thoughtknot-board'))`);
    await until(ready(BOARD));
  }

  /** Real touches: each finger is a list of [x, y] steps, all fingers moving together, then all lifted. */
  let next = 0;
  async function touch(fingers) {
    const first = next;
    next += fingers.length;
    const points = (i) =>
      fingers.map((f, n) => ({
        id: first + n,
        x: f[Math.min(i, f.length - 1)][0],
        y: f[Math.min(i, f.length - 1)][1],
      }));
    const steps = Math.max(...fingers.map((f) => f.length));
    await browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(0) });
    for (let i = 1; i < steps; i++) {
      await browser.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(i) });
      await wait(16);
    }
    await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await browser.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }).catch(() => {});
    await wait(150);
  }
  const line = (from, to, n = 12) =>
    Array.from({ length: n + 1 }, (_, i) => [
      from[0] + ((to[0] - from[0]) * i) / n,
      from[1] + ((to[1] - from[1]) * i) / n,
    ]);
  const centre = (selector) =>
    browser.run(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  /** What the view is: where it sits and how big its picture is. */
  const view = (selector) =>
    browser.run(`(() => { const v = document.querySelector(${JSON.stringify(selector)}); const s = getComputedStyle(v);
      const svg = v.querySelector('svg');
      return { x: s.getPropertyValue('--thoughtknot-x'), y: s.getPropertyValue('--thoughtknot-y'),
        width: svg ? svg.getAttribute('width') : null }; })()`);
  /** The page as a whole: scrolled, or zoomed by a pinch. */
  const page = () =>
    browser.run(
      `({ x: scrollX, y: scrollY, zoom: visualViewport.scale, over: document.documentElement.scrollHeight - innerHeight })`,
    );
  const tab = (name) =>
    browser.run(`document.querySelector('.gn-tab[data-tab=${name}]').getBoundingClientRect().toJSON()`);

  test('a tap on each tab of the bar changes the view', options, async () => {
    await open();
    for (const name of ['graph', 'note', 'more', 'board']) {
      const r = await tab(name);
      await touch([[[r.left + r.width / 2, r.top + r.height / 2]]]);
      assert.equal(await browser.run(`document.documentElement.dataset.tab`), name, `a tap on ${name}`);
      assert.equal(await browser.run(`document.querySelector('.gn-tab[aria-current]').dataset.tab`), name);
    }
  });

  for (const [name, selector, show] of [
    ['the board', BOARD, 'board'],
    ['the graph’s drawing', DRAWING, 'graph'],
  ]) {
    describe(name, () => {
      async function go() {
        await open();
        if (show !== 'board') {
          const r = await tab(show);
          await touch([[[r.left + r.width / 2, r.top + r.height / 2]]]);
        }
        await until(ready(selector));
        await wait(300);
      }
      /** Two fingers apart: the drawing is zoomed in, as a person does before panning. */
      async function zoomIn() {
        const [x, y] = await centre(selector);
        await touch([line([x - 20, y], [x - 90, y]), line([x + 20, y], [x + 90, y])]);
      }

      test('two fingers pinching zoom it, and the page does not zoom', options, async () => {
        await go();
        const before = await view(selector);
        const [x, y] = await centre(selector);
        await touch([line([x - 20, y], [x - 90, y]), line([x + 20, y], [x + 90, y])]);
        const after = await view(selector);
        assert.notEqual(after.width, before.width, `the picture was ${before.width} wide and is ${after.width}`);
        assert.ok(Number(after.width) > Number(before.width), 'it zooms in as the fingers part');
        const p = await page();
        assert.equal(p.zoom, 1, 'the page itself is not zoomed');
      });

      test('one finger dragging moves it, and the page does not scroll', options, async () => {
        await go();
        await zoomIn();
        const before = await view(selector);
        const [x, y] = await centre(selector);
        await touch([line([x + 60, y + 60], [x - 60, y - 40])]);
        const after = await view(selector);
        assert.ok(after.x !== before.x || after.y !== before.y, `it stayed at ${before.x}, ${before.y}`);
        assert.equal(after.width, before.width, 'a drag moves the view and does not zoom it');
        const p = await page();
        assert.deepEqual([p.x, p.y], [0, 0], 'the page did not scroll');
        assert.equal(p.zoom, 1);
      });
    });
  }

  test('a tap on a board item selects it, as a click does', options, async () => {
    await open();
    const item = (id) => `.thoughtknot-board [data-item=${id}]`;
    const focused = () =>
      browser.run(
        `[...document.querySelectorAll('.thoughtknot-board [data-item].is-focused')].map((g) => g.dataset.item)`,
      );
    assert.deepEqual(await focused(), [], 'nothing is selected to begin with');
    await touch([[await centre(item('s'))]]);
    assert.deepEqual(await focused(), ['s'], 'a tap selects the item it is on');
    await touch([[await centre(item('t'))]]);
    assert.deepEqual(await focused(), ['t'], 'a tap on another moves the selection there');
  });

  test('a tap on a graph node selects it, as a click does', options, async () => {
    await open();
    const r = await tab('graph');
    await touch([[[r.left + r.width / 2, r.top + r.height / 2]]]);
    await until(`document.querySelector('${DRAWING} g.node')`);
    await wait(300);
    const state = () =>
      browser.run(`({ hot: [...document.querySelectorAll('${DRAWING} g.node.thoughtknot-hot')].map((g) => g.dataset.key),
        sheet: Boolean(document.querySelector('.thoughtknot-details:not([hidden])')) })`);
    const before = await state();
    await touch([[await centre(`${DRAWING} g.node`)]]);
    await wait(300);
    assert.deepEqual(before, { hot: [], sheet: false }, 'nothing is selected to begin with');
    assert.deepEqual(await state(), { hot: ['a'], sheet: true }, 'a tap on a node selects it and opens its details');
  });
});
