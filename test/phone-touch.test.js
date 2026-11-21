// The phone fits a hand and a screen (ES§40, phone_touch_ready). The app's window is opened in a real Chrome as a
// phone: 393 by 852 points, touch, with the Tauri calls answered by a few notes held in the page. Then:
// - each interactive element of the start page and of the shell's four views is at least 44 by 44, the size of Apple's
//   guide. The views are board, graph, note and more. Every miss is listed with its selector, view and size.
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
    for (let i = 0; i < 50 && !(await browser.run(`document.readyState === 'complete'`)); i++)
      await new Promise((t) => setTimeout(t, 100));
  }

  /** Polls until `ready` is true in the page, or fails. */
  async function until(ready) {
    for (let i = 0; i < 100 && !(await browser.run(ready)); i++) await new Promise((t) => setTimeout(t, 50));
    assert.ok(await browser.run(ready), `never true in the page: ${ready}`);
  }

  /** Shows one of the shell's views, and opens the board's folded tools when it is the board. */
  async function showView(view) {
    await browser.run(`document.querySelector('.gn-tab[data-tab=${view}]').click()`);
    await until(`document.documentElement.dataset.tab === '${view}'`);
    if (view === 'board') {
      await browser.run(`document.querySelector('.thoughtknot-board-tools-fold[aria-expanded=false]')?.click()`);
      await until(`document.querySelector('.thoughtknot-board-tools-fold')?.getAttribute('aria-expanded') !== 'false'`);
    }
  }

  /** What the page measures besides the 44 rule (WALK): sideways scroll, and fields under 16 pixels. */
  const MEASURE = `(() => {
    const fields = [...document.querySelectorAll('input, select, textarea')].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16)
      .map((e) => e.tagName + ' ' + getComputedStyle(e).fontSize);
    return { fields, over: document.documentElement.scrollWidth - innerWidth };
  })()`;

  /** Every visible control on the screen, measured against the 44 rule: what misses it is listed with selector, view, size. */
  const WALK = (view) => `(() => {
    const sel = 'button, a[href], summary, select, input:not([type=checkbox],[type=radio]), [role=button], [role=tab], [tabindex]';
    const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
      [...e.classList].slice(0, 3).map((c) => '.' + c).join('') +
      (e.getAttribute('role') ? '[role=' + e.getAttribute('role') + ']' : '') +
      (e.dataset.tab ? '[data-tab=' + e.dataset.tab + ']' : '') +
      ((e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24) ? ' "' + (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 24) + '"' : '');
    const seen = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('.thoughtknot-viewport') && !e.closest('[hidden]'); };
    const miss = [];
    let walked = 0;
    const check = (e, box, what) => { const r = box.getBoundingClientRect();
      if (r.width < 44 - 0.5 || r.height < 44 - 0.5) miss.push(${JSON.stringify(view)} + ': ' + what + name(e) + ' ' + r.width.toFixed(1) + 'x' + r.height.toFixed(1)); };
    for (const e of document.querySelectorAll(sel)) if (seen(e)) { walked++; check(e, e, ''); }
    if (walked < 2) miss.push(${JSON.stringify(view)} + ': only ' + walked + ' controls were found, so nothing was checked');
    for (const e of document.querySelectorAll('input[type=checkbox], input[type=radio]')) {
      if (!seen(e) && !(e.labels?.[0] && seen(e.labels[0]))) continue;
      const label = e.labels?.[0] ?? e.closest('label');
      if (label) { const r = label.getBoundingClientRect(); if (r.height < 44 - 0.5) miss.push(${JSON.stringify(view)} + ': label of ' + name(e) + ' ' + r.width.toFixed(1) + 'x' + r.height.toFixed(1)); }
      else check(e, e, 'unlabelled ');
    }
    return miss;
  })()`;

  /** Opens the editor on a note, taps one of the shell's four views, and returns what misses the rule there. */
  async function walkView(view) {
    await open('editor.html#token=app&note=Map.md', `Boolean(document.querySelector('.gn-tab'))`);
    // the board's tools are folded: showView opens them, so they are measured too
    await showView(view);
    return browser.run(WALK(view));
  }

  test('the start page: every interactive element is at least 44 by 44', options, async () => {
    await open('index.html', `document.querySelectorAll('#gn-app li a').length > 0`);
    assert.deepEqual(await browser.run(WALK('start')), []);
  });

  // Each row of tool buttons the phone layer spaces, in the view that shows it.
  const TOOL_ROWS = [
    ['board', '.thoughtknot-board-tools'],
    ['graph', '.thoughtknot-pane-tools'],
  ];
  for (const [view, row] of TOOL_ROWS)
    test(`the ${view} view's ${row} row: its buttons do not touch each other`, options, async () => {
      await open('editor.html#token=app&note=Map.md', `Boolean(document.querySelector('.gn-tab'))`);
      await showView(view);
      const found = await browser.run(`(() => {
        const out = [];
        const rs = [...document.querySelectorAll('${row} button')].map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0);
        for (let i = 1; i < rs.length; i++) {
          const a = rs[i - 1], b = rs[i];
          const sameRow = Math.abs(a.top - b.top) < 4;
          const gap = sameRow ? b.left - a.right : b.top - a.bottom;
          if (gap < 8) out.push('button ' + i + ' is ' + gap.toFixed(1) + ' from the one before');
        }
        return { out, shown: rs.length };
      })()`);
      assert.ok(found.shown > 1, `${row} shows at least two buttons in the ${view} view, so there is a gap to check`);
      assert.deepEqual(found.out, []);
    });

  for (const view of ['board', 'graph', 'note', 'more'])
    test(`the ${view} view: every interactive element is at least 44 by 44`, options, async () => {
      assert.deepEqual(await walkView(view), []);
    });

  test('the start page: nothing scrolls sideways and no field zooms the page', options, async () => {
    await open('index.html', `document.querySelectorAll('#gn-app li a').length > 0`);
    const m = await browser.run(MEASURE);
    assert.deepEqual(m.fields, []);
    assert.ok(m.over <= 0, `the page is ${m.over} wide of the screen`);
  });

  test(
    'a note: no field zooms the page, nothing scrolls sideways, and the keys line is only for a screen reader',
    options,
    async () => {
      await open('editor.html#token=app&note=Map.md', `Boolean(document.querySelector('.thoughtknot-board-help'))`);
      const m = await browser.run(MEASURE);
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
