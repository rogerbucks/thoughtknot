// The phone fits a hand and a screen (ES§40, phone_touch_ready). The app's window is opened in a real Chrome as a
// phone: 393 by 852 points, touch, with the Tauri calls answered by a few notes held in the page. Then:
// - each control of the start page and of a note is at least 44 by 44, the size of Apple's guide.
// - nothing scrolls sideways, and no field is under 16 pixels, which makes iOS zoom the page.
// - the window draws under the notch and the home bar, and the page steps in by their size.
// - the line naming Tab and Ctrl is out of sight on a touch screen but still read by a screen reader.
// - a phone shows neither the GitHub review nor the earlier-versions chooser, which it cannot run.
// A computer's page is checked by test/a11y-targets-reflow.test.js. Chrome is the one THOUGHTKNOT_CHROME names, or the
// first of the usual names on the PATH. Where none is found the browser cases skip, except in CI, which fails.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { findChrome, startChrome } from '../scripts/chrome.mjs';
import { buildApp } from '../packages/app/esbuild.config.mjs';
import { pageCss } from '../packages/claude-code/esbuild.page.mjs';
import { ROOT } from './repository/repo.js';

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const NOTE =
  "# Map\n```gql\n// graph: g · SOURCE\n(a:Idea {title: 'One'}),\n(b:Idea {title: 'Two'}),\n(a)-[:RELATES_TO]->(b)\n```\n";

describe('the phone layer, in the files', () => {
  test('both pages draw under the notch, so the page can step in by its size', () => {
    for (const path of ['packages/claude-code/page/index.html', 'packages/app/index.html'])
      assert.match(read(path), /name="viewport" content="[^"]*viewport-fit=cover/, path);
  });

  test('the page’s style sheet carries the phone layer, with the safe areas and the 44 pixel rule', () => {
    const css = pageCss([]);
    assert.match(css, /phone_touch_ready/, 'the layer’s own file is in the sheet');
    assert.match(css, /\.gn-no-gh/);
    assert.match(css, /env\(safe-area-inset-bottom\)/);
    assert.match(css, /@media \(pointer: coarse\)[\s\S]*min-height: 44px/);
    assert.doesNotMatch(
      read('styles.css'),
      /pointer: coarse[\s\S]*font-size: max\(16px/,
      'the plug-in’s own styles stay untouched',
    );
  });
});

describe('in a real browser, as a phone', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the phone layer is checked in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must check the phone layer, and found no Chrome');
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
    browser = await startChrome({ chrome, width: 393, height: 852, scale: 2 });
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 393,
      height: 852,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await browser.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: stub });
  });
  after(async () => {
    await browser?.stop();
    server?.close();
    if (built) rmSync(built, { recursive: true, force: true });
  });

  /** Opens `path` and waits for `ready` to be true in the page. */
  async function open(path, ready) {
    await browser.send('Page.navigate', { url: 'about:blank' });
    await browser.send('Page.navigate', { url: `${base}/${path}` });
    for (let i = 0; i < 200 && !(await browser.run(ready)); i++) await new Promise((t) => setTimeout(t, 100));
    await new Promise((t) => setTimeout(t, 500));
  }

  /** What the page measures: controls under 44, sideways scroll, fields under 16 pixels. */
  const MEASURE = `(() => {
    const controls = [...document.querySelectorAll('.gn-page :is(button, summary, select, input:not([type=checkbox],[type=radio]), a[href])')]
      .filter((e) => !e.closest('.thoughtknot-viewport') && !e.closest('p, li > a:not(#gn-app a)'));
    const small = controls.map((e) => [e, e.getBoundingClientRect()])
      .filter(([e, r]) => r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && (r.width < 44 || r.height < 44))
      .map(([e, r]) => (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    const fields = [...document.querySelectorAll('input, select, textarea')].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16)
      .map((e) => e.tagName + ' ' + getComputedStyle(e).fontSize);
    return { small, fields, over: document.documentElement.scrollWidth - innerWidth };
  })()`;

  test('the start page: every control is 44 by 44 and nothing scrolls sideways', options, async () => {
    await open('index.html', `document.querySelectorAll('#gn-app li a').length > 0`);
    const m = await browser.run(MEASURE);
    assert.deepEqual(m.small, []);
    assert.deepEqual(m.fields, []);
    assert.ok(m.over <= 0, `the page is ${m.over} wide of the screen`);
    assert.ok(await browser.run(`document.querySelector('#gn-app li a').getBoundingClientRect().height >= 44`));
  });

  test(
    'a note: every control is 44 by 44, no field zooms the page, and the keys line is only for a screen reader',
    options,
    async () => {
      await open('editor.html#token=app&note=Map.md', `Boolean(document.querySelector('.thoughtknot-board-help'))`);
      const m = await browser.run(MEASURE);
      assert.deepEqual(m.small, []);
      assert.deepEqual(m.fields, []);
      assert.ok(m.over <= 0, `the page is ${m.over} wide of the screen`);
      const help = await browser.run(
        `(() => { const r = document.querySelector('.thoughtknot-board-help').getBoundingClientRect(); return [r.width, r.height, document.querySelector('.thoughtknot-board-help').textContent.length]; })()`,
      );
      assert.ok(help[0] <= 1 && help[1] <= 1, 'the line is out of sight');
      assert.ok(help[2] > 0, 'but it is still there to read');
    },
  );

  test('a phone hides the choosers it cannot run', options, async () => {
    await open(
      'editor.html#token=app&note=Map.md',
      `Boolean(document.documentElement?.classList.contains('gn-no-gh'))`,
    );
    assert.equal(await browser.run(`getComputedStyle(document.querySelector('.gn-review')).display`), 'none');
    assert.equal(await browser.run(`getComputedStyle(document.querySelector('.gn-changes')).display`), 'none');
  });

  test('the window draws under the notch and the page steps in by its size', options, async () => {
    await open('index.html', `document.querySelectorAll('#gn-app li a').length > 0`);
    assert.match(await browser.run(`document.querySelector('meta[name=viewport]').content`), /viewport-fit=cover/);
    assert.ok(await browser.run(`getComputedStyle(document.body).paddingTop !== undefined`));
  });
});
