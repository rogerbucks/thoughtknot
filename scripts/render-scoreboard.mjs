// The rendering scoreboard (editor spec §73, render_scoreboard; wiki/Rendering-spec.md, "The scoreboard"). It draws the
// fixed scenes (render-scenes.mjs) with the real plugin in a headless Chrome. Each is drawn at four zoom steps, in each
// space, light and dark, on a laptop and a phone. Each picture is saved, and the page is counted (render-measure.mjs).
// It counts labels that overlap, cut or tiny words, marks under the controls, icons shown as words, and things moved.
//
// It writes, in the folder given:
// - one PNG per picture, named scene-device-theme-space-zoom.png;
// - report.json, every count, and whether each picture passes;
// - sheet.html, each picture beside its mockup where one is given, with its counts under it.
//
// Usage:
//   node scripts/render-scoreboard.mjs --out DIR [--scenes mockup,small] [--mockups DIR] [--quick] [--chrome PATH]
// --quick draws only the laptop, light, 2D. A mockup is matched by name: DIR/scene-space-zoom.png.
// It is run by hand and by each rendering phase, never by CI's test run: it takes minutes.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, startChrome } from './chrome.mjs';
import { ICONS_IN, open, serve } from './wiki-screens.mjs';
import { SCENES } from './render-scenes.mjs';
import { PROBE, countsOf, moved, passes } from './render-measure.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** The screens drawn on, in CSS pixels. */
export const DEVICES = {
  laptop: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
};
export const THEMES = ['light', 'dark'];
/** The spaces, in the order the bar's space button steps through them (space-switch.ts). */
export const SPACES = ['2d', '2.5d', '3d', 'globe'];
/** The zoom steps: the fitted drawing, then one, two and three wheel notches in at its middle. */
export const ZOOMS = [0, 1, 2, 3];
/** How long a change is given to settle before the page is read, in milliseconds. */
const SETTLE = 900;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const flag = (args, name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};

/** Builds the harness drawing `scene`'s note into a fresh folder, and returns the folder. */
function buildScene(name) {
  const dir = mkdtempSync(join(tmpdir(), `scoreboard-${name}-`)),
    note = join(dir, 'note.md');
  writeFileSync(note, SCENES[name].note());
  execFileSync(process.execPath, [join(ROOT, 'packages/obsidian/harness/build.mjs'), join(dir, 'page'), note], {
    stdio: 'inherit',
  });
  return join(dir, 'page');
}

/** One wheel notch in, with the control key held, at the middle of the drawing. */
async function zoomIn(send) {
  const at = await run(
    send,
    `(() => { const r = document.querySelector('.thoughtknot-viewport').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
  );
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...at, deltaX: 0, deltaY: -120, modifiers: 2 });
}

/** Presses the bar's space button until the drawing shows `space`. */
async function showSpace(send, space) {
  for (let i = 0; i < SPACES.indexOf(space); i++) {
    await run(send, `document.querySelector('.block-language-gql [aria-label^="2D, 2.5D or 3D"]')?.click()`);
    await wait(SETTLE * 2);
  }
}

/** Draws one scene on one device and theme, in every space and zoom step; returns a row per picture. */
async function drawScene(send, url, out, { scene, device, theme, spaces }) {
  const rows = [];
  for (const space of spaces) {
    await send('Emulation.setDeviceMetricsOverride', DEVICES[device]);
    const start = Date.now();
    await open(send, url);
    const firstPicture = Date.now() - start;
    if (theme === 'dark')
      await run(send, `document.documentElement.classList.add('dark'); document.body.classList.add('theme-dark')`);
    await showSpace(send, space);
    let before = null;
    for (const zoom of ZOOMS) {
      if (zoom) await zoomIn(send);
      await wait(SETTLE);
      await run(send, ICONS_IN);
      const reading = await run(send, PROBE);
      const spots = new Map(Object.entries(reading.spots ?? {}));
      const movedKeys = before ? moved(before, spots) : [];
      before = spots;
      const name = `${scene}-${device}-${theme}-${space}-${zoom}`;
      const png = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(out, `${name}.png`), Buffer.from(png.data, 'base64'));
      const counts = countsOf(reading);
      rows.push({
        name,
        scene,
        device,
        theme,
        space,
        zoom,
        firstPicture,
        counts,
        moved: movedKeys.length,
        pass: passes(counts, movedKeys),
      });
    }
  }
  return rows;
}

/** The sheet: each picture beside its mockup, if there is one, with its counts. */
export function sheetOf(rows, out, mockups) {
  const cell = (r) => {
    const mock = mockups && join(mockups, `${r.scene}-${r.space}-${r.zoom}.png`);
    const c = r.counts;
    const said = c
      ? `overlaps ${c.overlaps ?? 'n/a'} · cut ${c.cut ?? 'n/a'} · tiny ${c.tiny ?? 'n/a'} · under controls ${c.covered.pixels}px · icon words ${c.iconWords} · moved ${r.moved}`
      : 'not measured';
    return `<section class="${r.pass ? 'pass' : 'fail'}"><h2>${r.name} ${r.pass ? 'PASS' : 'FAIL'}</h2><p>${said}</p>
<div class="pair">${mock && existsSync(mock) ? `<figure><img src="${relative(out, mock)}"><figcaption>Mockup</figcaption></figure>` : ''}<figure><img src="${r.name}.png"><figcaption>Today</figcaption></figure></div></section>`;
  };
  return `<!doctype html><meta charset="utf-8"><title>Rendering scoreboard</title>
<style>body{font:14px system-ui;margin:16px}.pair{display:flex;gap:12px}figure{margin:0;flex:1}img{width:100%;border:1px solid #ccc}
.fail h2{color:#b42318}.pass h2{color:#067647}h2{font-size:15px;margin:24px 0 4px}</style>
<h1>Rendering scoreboard</h1><p>${rows.filter((r) => r.pass).length} of ${rows.length} pictures pass.</p>${rows.map(cell).join('\n')}`;
}

/** Runs the scoreboard into `out`; returns its rows. */
export async function scoreboard(out, { scenes = Object.keys(SCENES), quick = false, mockups, chrome } = {}) {
  mkdirSync(out, { recursive: true });
  const rows = [];
  const browser = await startChrome({ chrome });
  try {
    for (const scene of scenes) {
      const server = await serve(buildScene(scene));
      const url = `http://127.0.0.1:${server.address().port}/index.html`;
      try {
        for (const device of quick ? ['laptop'] : Object.keys(DEVICES))
          for (const theme of quick ? ['light'] : THEMES)
            rows.push(
              ...(await drawScene(browser.send, url, out, { scene, device, theme, spaces: quick ? ['2d'] : SPACES })),
            );
      } finally {
        server.close();
      }
    }
  } finally {
    await browser.stop();
  }
  writeFileSync(join(out, 'report.json'), JSON.stringify({ when: new Date().toISOString(), rows }, null, 2) + '\n');
  writeFileSync(join(out, 'sheet.html'), sheetOf(rows, out, mockups));
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const out = flag(args, '--out');
  if (!out) throw new Error('give the folder for the pictures: --out DIR');
  const rows = await scoreboard(out, {
    scenes: flag(args, '--scenes')?.split(','),
    quick: args.includes('--quick'),
    mockups: flag(args, '--mockups'),
    chrome: flag(args, '--chrome'),
  });
  console.log(
    `render-scoreboard: ${rows.filter((r) => r.pass).length} of ${rows.length} pictures pass. See ${join(out, 'sheet.html')}`,
  );
}
