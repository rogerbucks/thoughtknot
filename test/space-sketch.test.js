// The drawings over a graph in the view in space, in a real browser (editor spec §70): space-sketch.ts and its view.
// - Hidden by the card's switch, a drawing is gone from the 2.5D and 3D views; shown, it is back where it was
//   (sketch_toggle).
// - A first click on a drawing says its words and opens nothing; another turns the view to it (sketch_click_rule).
//
// Chrome paints in software here (SwiftShader). Chrome is the one THOUGHTKNOT_CHROME names, or the first on the PATH.
// Where none is found the cases skip, except in CI.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findChrome, startChrome } from '../scripts/chrome.mjs';
import { ROOT } from './repository/repo.js';

/** Chrome's switches to paint with WebGL 2 in software. */
const SOFTWARE = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'];

/** The page's script: opens the view in space over a drawing with a drawing over it, and clicks in it. */
const PAGE = `
import { installDomHelpers } from './packages/core/src/display/dom-helpers.ts';
import { installHost } from './packages/core/src/display/host.ts';
import { SPACE_OPEN, openSpaceView } from './packages/core/src/display/graph-view/space-view-panel.ts';
import { MARKED } from './packages/core/src/display/graph-view/focus-marks.ts';
import { readSketch } from './packages/core/src/sketch.ts';
installDomHelpers(window);
installHost({ icon() {}, isPhone: () => false, notice() {}, menu() {} });
// a drawing over the graph in the view in space (§70), as cards or in 3D. Hidden, it is gone from the view; shown, it
// is back. A first click on it says its words and opens nothing; another click on it turns the view to it
window.sketchSpace = async (cards) => {
  const sized = document.head.appendChild(document.createElement('style'));
  sized.textContent = '.thoughtknot-space-view, .thoughtknot-space-view canvas { position: absolute; inset: 0; }';
  const root = document.body.appendChild(document.createElement('div'));
  root.style.cssText = 'position:relative;width:480px;height:360px';
  const holder = root.appendChild(document.createElement('div'));
  holder.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><g class="graph">
    <g class="node" data-key="ada"><polygon fill="rgb(200, 240, 200)" points="20,20 120,20 120,60 20,60"/><text x="70" y="45" font-size="14">Ada</text></g>
    <g class="node" data-key="bob"><polygon fill="rgb(200, 240, 200)" points="200,140 280,140 280,180 200,180"/><text x="240" y="165" font-size="14">Bob</text></g>
  </g></svg>\`;
  const { sketch } = readSketch(\`// graph: team_ink · SKETCH ON team
(d1:Shape {x: 10, y: 120, shape: 'line', text: 'Ask first', points: '0 0 160 0'})\`);
  let shown = true;
  const told = [];
  root.addEventListener(SPACE_OPEN, (e) => told.push(e.detail));
  const svg = holder.querySelector('svg');
  const opened = await openSpaceView(root, svg, 'Team', () => {}, { cards, sketch: () => (shown ? sketch : null) });
  const view = root.querySelector('.thoughtknot-space-view');
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await frames();
  const at = view.getBoundingClientRect();
  const click = (x, y) => {
    for (const type of ['pointerdown', 'pointerup'])
      view.dispatchEvent(new PointerEvent(type, { clientX: at.left + x, clientY: at.top + y, pointerId: 1, bubbles: true }));
  };
  const said = () => view.querySelector('.thoughtknot-space-said')?.textContent ?? '';
  // a click on nothing, far off, before each try: so no try is the second of a pair
  const off = () => click(1, 1);
  const hits = (x, y) => (off(), click(x, y), /Ask first/.test(said()));
  const find = () => {
    for (let y = 8; y < at.height; y += 4) for (let x = 8; x < at.width; x += 4) if (hits(x, y)) return { x, y };
    return null;
  };
  const toggled = async (to) => ((shown = to), svg.dispatchEvent(new Event(MARKED)), await wait(450), await frames());
  const first = find();
  await toggled(false);
  const hidden = find();
  await toggled(true);
  const hit = find();
  const middle = { x: Math.round(at.width / 2), y: Math.round(at.height / 2) };
  const before = !!hit && hits(middle.x, middle.y);
  told.length = 0;
  if (hit) hits(hit.x, hit.y);
  const words = said();
  await wait(450);
  const still = !!hit && hits(hit.x, hit.y); // still there: the first click left the view where it was
  if (hit) click(hit.x, hit.y); // and with it picked, another click turns the view to it
  await wait(450);
  await frames();
  const after = hits(middle.x, middle.y);
  opened?.close();
  root.remove();
  sized.remove();
  return { first: !!first, hidden: !!hidden, back: !!hit, words, told: told.length, before, still, after };
};
`;

describe('drawings in the view in space, in a real browser', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the view in space is checked in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must check the view in space, and found no Chrome');
    console.warn(why);
  }
  const options = { skip: why ?? false, timeout: 120_000 };
  let browser, folder;
  before(async () => {
    if (why) return;
    const bundle = await build({
      stdin: { contents: PAGE, resolveDir: ROOT, loader: 'ts' },
      bundle: true,
      format: 'iife',
      write: false,
      logLevel: 'silent',
    });
    browser = await startChrome({ chrome, width: 500, height: 400, scale: 1, flags: SOFTWARE });
    folder = mkdtempSync(join(tmpdir(), 'space-sketch-'));
    writeFileSync(join(folder, 'page.js'), bundle.outputFiles[0].text);
    // UTF-8, as the display's words hold letters past ASCII
    writeFileSync(
      join(folder, 'page.html'),
      '<!doctype html><meta charset="utf-8"><title>Drawings in space</title><script src="page.js"></script>',
    );
    await browser.send('Page.navigate', { url: pathToFileURL(join(folder, 'page.html')).href });
    for (let i = 0; i < 50 && (await browser.run('document.readyState')) !== 'complete'; i++)
      await new Promise((r) => setTimeout(r, 100));
  });
  after(async () => {
    await browser?.stop();
    if (folder) rmSync(folder, { recursive: true, force: true });
  });

  // proves: sketch_toggle, sketch_click_rule
  test('a drawing hides and shows in 2.5D and 3D; a first click says it, another turns to it', options, async () => {
    for (const cards of [true, false]) {
      const r = JSON.parse(await browser.run(`sketchSpace(${cards}).then(JSON.stringify)`));
      const as = cards ? '2.5D' : '3D';
      assert.equal(r.first, true, `${as}: the drawing is in the view`);
      assert.equal(r.hidden, false, `${as}: hidden, it is gone`);
      assert.equal(r.back, true, `${as}: shown, it is back`);
      assert.match(r.words, /Ask first/, `${as}: a first click says its words`);
      assert.equal(r.told, 0, `${as}: a drawing is not a thing: nothing opens`);
      assert.equal(r.before, false, `${as}: it is not in the middle at first`);
      assert.equal(r.still, true, `${as}: after the first click it is still where it was`);
      assert.equal(r.after, true, `${as}: after another click on it, it is in the middle`);
    }
  });
});
