// The card's one button for 2D, 2.5D, 3D and the globe, in a real browser (editor spec §53, space_press_kept).
// - The button goes from 2.5D to 3D, then Escape closes the view in space. The button says 2D again. Its next press
//   opens the view once more.
// - Pressed five times before a view is open, it ends as the last press said, with one view in the frame.
//
// Chrome paints in software here (SwiftShader). Chrome is the one THOUGHTKNOT_CHROME names, or the first on the PATH.
// Where none is found the cases skip, except in CI.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findChrome, startChrome } from '../scripts/chrome.mjs';
import { ROOT } from './repository/repo.js';

/** The page's script: a card's bar and drawing, as graph-view.ts builds them, and the button between 2D and space. */
const PAGE = `
import { installDomHelpers } from './packages/core/src/display/dom-helpers.ts';
import { installHost } from './packages/core/src/display/host.ts';
import { SpaceSwitch } from './packages/core/src/display/graph-view/space-switch.ts';
installDomHelpers(window);
installHost({ icon() {}, isPhone: () => false, notice() {}, menu() {} });
const frames = (n = 2) => new Promise((r) => { const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); });
window.pressing = async () => {
  const root = document.body.appendChild(document.createElement('div'));
  root.style.cssText = 'width:480px';
  const bar = root.appendChild(document.createElement('div'));
  const frame = root.appendChild(document.createElement('div'));
  frame.style.cssText = 'position:relative;height:360px';
  frame.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><g class="graph">
    <g class="node" data-key="ada"><polygon fill="rgb(200, 240, 200)" points="20,20 120,20 120,60 20,60"/><text x="70" y="45" font-size="14">Ada</text></g>
    <g class="node" data-key="bob"><polygon fill="rgb(200, 240, 200)" points="200,140 280,140 280,180 200,180"/><text x="240" y="165" font-size="14">Bob</text></g>
    <g class="edge" data-link="0"><path fill="none" stroke="rgb(90, 90, 90)" d="M120,60 C150,90 180,120 200,140"/></g>
  </g></svg>\`;
  const spaces = new SpaceSwitch(() => frame.querySelector('svg'));
  const b = bar.appendChild(document.createElement('button'));
  b.createSpan({ cls: 'thoughtknot-badge-text' });
  b.addEventListener('click', () => spaces.pressed());
  spaces.bar(b, 'Team');
  const views = () => frame.querySelectorAll(':scope > .thoughtknot-space-view');
  const settled = async () => { for (let n = 0; n < 150 && !views().length !== !spaces.mode(); n++) await frames(); await frames(10); };
  const said = () => ({ said: b.textContent, mode: spaces.mode(), views: views().length });
  const out = {};
  b.click(); // 2.5D
  await settled();
  b.click(); // 3D
  await settled();
  out.before = said();
  views()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settled();
  out.escaped = said();
  b.click();
  await settled();
  out.again = said();
  await spaces.show(null);
  await settled();
  for (let i = 0; i < 5; i++) b.click(); // 2.5D, 3D, globe, 2D, 2.5D: all before the first view is open
  await settled();
  out.fast = said();
  await spaces.show(null);
  root.remove();
  return out;
};
// a short drawing in a card's frame, styled as the plugin styles it. How tall is the frame in 2D and in each way in space?
window.heights = async () => {
  const view = document.body.appendChild(document.createElement('div'));
  view.className = 'thoughtknot-view';
  view.style.cssText = 'width:480px';
  const bar = view.appendChild(document.createElement('div'));
  const frame = view.appendChild(document.createElement('div'));
  frame.className = 'thoughtknot-viewport';
  frame.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120" style="display:block"><g class="graph">
    <g class="node" data-key="ada"><polygon fill="rgb(200, 240, 200)" points="20,20 120,20 120,60 20,60"/><text x="70" y="45" font-size="14">Ada</text></g>
    <g class="node" data-key="bob"><polygon fill="rgb(200, 240, 200)" points="200,60 280,60 280,100 200,100"/><text x="240" y="85" font-size="14">Bob</text></g>
  </g></svg>\`;
  const after = view.appendChild(document.createElement('p'));
  after.textContent = 'The note goes on.';
  const spaces = new SpaceSwitch(() => frame.querySelector('svg'));
  const b = bar.appendChild(document.createElement('button'));
  b.createSpan({ cls: 'thoughtknot-badge-text' });
  b.addEventListener('click', () => spaces.pressed());
  spaces.bar(b, 'Team');
  const views = () => frame.querySelectorAll(':scope > .thoughtknot-space-view');
  const settled = async () => { for (let n = 0; n < 150 && !views().length !== !spaces.mode(); n++) await frames(); await frames(10); };
  const at = () => [frame.getBoundingClientRect().height, after.getBoundingClientRect().top, b.getBoundingClientRect().width];
  const out = [at()];
  for (let i = 0; i < 4; i++) {
    b.click(); // 2.5D, 3D, globe, then 2D again
    await settled();
    out.push(at());
  }
  view.remove();
  return out;
};
`;

describe('the 2D, 2.5D and 3D button, in a real browser', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the button is checked in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must check the 2D, 2.5D and 3D button, and found no Chrome');
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
    browser = await startChrome({
      chrome,
      width: 500,
      height: 400,
      scale: 1,
      flags: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
    });
    folder = mkdtempSync(join(tmpdir(), 'space-switch-'));
    writeFileSync(join(folder, 'page.js'), bundle.outputFiles[0].text);
    copyFileSync(join(ROOT, 'styles.css'), join(folder, 'styles.css'));
    writeFileSync(
      join(folder, 'page.html'),
      '<!doctype html><meta charset="utf-8"><title>2D and 3D</title><link rel="stylesheet" href="styles.css">' +
        '<script src="page.js"></script>',
    );
    await browser.send('Page.navigate', { url: pathToFileURL(join(folder, 'page.html')).href });
    for (let i = 0; i < 50 && (await browser.run('document.readyState')) !== 'complete'; i++)
      await new Promise((r) => setTimeout(r, 100));
  });
  after(async () => {
    await browser?.stop();
    if (folder) rmSync(folder, { recursive: true, force: true });
  });

  test(
    'Escape after a change of way leaves the button saying 2D, and fast presses end as the last said',
    options,
    async () => {
      const out = JSON.parse(await browser.run('pressing().then(JSON.stringify)'));
      assert.deepEqual(out.before, { said: '3D', mode: 'balls', views: 1 });
      assert.deepEqual(out.escaped, { said: '2D', mode: null, views: 0 }, 'Escape left the button as it was');
      assert.deepEqual(out.again, { said: '2.5D', mode: 'cards', views: 1 }, 'the next press opened no view');
      assert.deepEqual(out.fast, { said: '2.5D', mode: 'cards', views: 1 }, 'five fast presses');
    },
  );

  // Adversarial review, 1 Nov 2026 (finding 10): a short drawing's frame grew from 334 to 480 pixels in space, and
  // the note below it moved. Nothing on the page moves when the drawing goes into space and back. The button keeps its
  // width as it names each way, so the bar never wraps anew.
  // proves: space_frame_kept
  test(
    'a short drawing keeps its frame as tall in 2.5D, 3D and the globe as in 2D, so the note below and the bar stay put',
    options,
    async () => {
      const out = JSON.parse(await browser.run('heights().then(JSON.stringify)'));
      const [flat] = out;
      assert.ok(flat[0] > 100 && flat[0] < 200, `the short drawing's frame is ${flat[0]} pixels tall`);
      for (const [i, at] of out.entries())
        assert.deepEqual(at, flat, `press ${i}: frame height, the note below, and the button as wide`);
    },
  );
});
