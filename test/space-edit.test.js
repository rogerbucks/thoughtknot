// Editing in 2.5D, 3D and on the globe, in a real browser (editor spec §72, edit_gestures, edit_every_view). The view
// asks its card for each edit (space-edit.ts), as a 2D drawing's gestures do.
// - A double click on a thing asks to open its name. Where no card takes it, the view flies to the thing as before.
// - A double click on empty space asks to add a thing.
// - Pressed on the thing picked and dragged to another, a line follows, and letting go asks to link the two. A drag
//   from anywhere else turns the view, and asks for nothing.
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

/** The page's script: a drawing of two things in a frame, opened in space, each way in turn, its asks recorded. */
const PAGE = `
import { installDomHelpers } from './packages/core/src/display/dom-helpers.ts';
import { installHost } from './packages/core/src/display/host.ts';
import { openSpaceView } from './packages/core/src/display/graph-view/space-view-panel.ts';
import { SPACE_EDIT } from './packages/core/src/display/graph-view/space-edit.ts';
installDomHelpers(window);
installHost({ icon() {}, isPhone: () => false, notice() {}, menu() {} });
const frames = (n = 2) => new Promise((r) => { const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); });
window.editing = async (mode, taken) => {
  const frame = document.body.appendChild(document.createElement('div'));
  frame.style.cssText = 'position:relative;width:480px;height:360px';
  frame.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><g class="graph">
    <g class="node" data-key="ada"><polygon fill="rgb(200, 240, 200)" points="20,20 120,20 120,60 20,60"/><text x="70" y="45" font-size="14">Ada</text></g>
    <g class="node" data-key="bob"><polygon fill="rgb(200, 240, 200)" points="200,140 280,140 280,180 200,180"/><text x="240" y="165" font-size="14">Bob</text></g>
    <g class="node" data-key="cy"><polygon fill="rgb(200, 240, 200)" points="200,20 280,20 280,60 200,60"/><text x="240" y="45" font-size="14">Cy</text></g>
    <g class="node" data-key="dee"><polygon fill="rgb(200, 240, 200)" points="20,100 60,100 60,120 20,120"/><text x="40" y="114" font-size="12">Dee</text></g>
    <g class="node" data-key="eve"><polygon fill="rgb(200, 240, 200)" points="70,100 110,100 110,120 70,120"/><text x="90" y="114" font-size="12">Eve</text></g>
    <g class="node" data-key="fay"><polygon fill="rgb(200, 240, 200)" points="120,100 160,100 160,120 120,120"/><text x="140" y="114" font-size="12">Fay</text></g>
    <g class="node" data-key="gus"><polygon fill="rgb(200, 240, 200)" points="170,100 210,100 210,120 170,120"/><text x="190" y="114" font-size="12">Gus</text></g>
    <g class="edge" data-link="0"><path fill="none" stroke="rgb(90, 90, 90)" d="M120,60 C150,90 180,120 200,140"/></g>
    <g class="edge" data-link="1"><path fill="none" stroke="rgb(90, 90, 90)" d="M120,40 C150,40 180,40 200,40"/></g>
  </g></svg>\`;
  const asked = [];
  frame.addEventListener(SPACE_EDIT, (e) => {
    asked.push(e.detail);
    if (taken) e.preventDefault();
  });
  let boxes = null;
  const view = await openSpaceView(frame, frame.querySelector('svg'), 'team', () => {}, {
    cards: mode === 'cards',
    globe: mode === 'globe',
    moved: (o, screen) => (boxes = screen?.boxes()),
  });
  view.as(mode);
  for (let n = 0; n < 60; n++) await frames();
  const el = frame.querySelector('.thoughtknot-space-view');
  const r = el.getBoundingClientRect();
  const mid = (key) => { const b = boxes.get(key); if (!b) throw new Error('not seen: ' + key + ' of ' + [...boxes.keys()].join()); return { x: r.left + (b.left + b.right) / 2, y: r.top + (b.top + b.bottom) / 2 }; };
  const p = (type, at, id = 1) =>
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'mouse', isPrimary: true, button: 0, clientX: at.x, clientY: at.y, bubbles: true }));
  const click = (at, id) => (p('pointerdown', at, id), p('pointerup', at, id));
  const ada = mid('ada'), empty = { x: r.left + 4, y: r.bottom - 4 };
  const out = {};
  click(ada); click(ada); // a double click on Ada
  out.rename = asked.splice(0);
  out.line = !!el.querySelector('.thoughtknot-space-link-line');
  await new Promise((s) => setTimeout(s, 400));
  click(empty); click(empty); // a double click on nothing
  out.add = asked.splice(0);
  await new Promise((s) => setTimeout(s, 400));
  click(ada); // Ada picked
  await new Promise((s) => setTimeout(s, 400));
  for (let n = 0; n < 30; n++) await frames(); // the globe turns to it
  if (mode === 'globe') for (let i = 0; i < 4; i++) view.move({ zoom: 0.6 }); // back from it, so the others show
  for (let n = 0; n < 10; n++) await frames();
  // on the globe only the side facing the camera is seen: the link goes to whichever other thing is in sight
  const other = [...boxes.keys()].find((k) => k !== 'ada') ?? 'bob';
  out.other = other;
  const ada2 = mid('ada'), bob2 = mid(other);
  p('pointerdown', ada2, 2);
  p('pointermove', { x: (ada2.x + bob2.x) / 2, y: (ada2.y + bob2.y) / 2 }, 2);
  out.drawn = !!el.querySelector('.thoughtknot-space-link-line');
  p('pointermove', bob2, 2);
  p('pointerup', bob2, 2);
  out.link = asked.splice(0);
  out.lineGone = !el.querySelector('.thoughtknot-space-link-line');
  await new Promise((s) => setTimeout(s, 400));
  // a drag from empty space turns the view and asks for nothing
  p('pointerdown', empty, 3);
  p('pointermove', { x: empty.x + 60, y: empty.y - 30 }, 3);
  p('pointerup', { x: empty.x + 60, y: empty.y - 30 }, 3);
  out.turned = asked.splice(0);
  view.close();
  frame.remove();
  return out;
};
`;

describe('editing in 2.5D, 3D and on the globe, in a real browser', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): editing in space is checked in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must check editing in space, and found no Chrome');
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
    folder = mkdtempSync(join(tmpdir(), 'space-edit-'));
    writeFileSync(join(folder, 'page.js'), bundle.outputFiles[0].text);
    copyFileSync(join(ROOT, 'styles.css'), join(folder, 'styles.css'));
    writeFileSync(
      join(folder, 'page.html'),
      '<!doctype html><meta charset="utf-8"><title>Editing in space</title><link rel="stylesheet" href="styles.css">' +
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

  for (const mode of ['cards', 'balls', 'globe'])
    // proves: edit_gestures, edit_every_view
    test(
      `in ${mode}, a double click asks to rename or add, and a drag from the picked thing asks to link`,
      options,
      async () => {
        const out = JSON.parse(await browser.run(`editing(${JSON.stringify(mode)}, true).then(JSON.stringify)`));
        assert.deepEqual(out.rename, [{ rename: 'ada' }], 'a double click on Ada asks for its name');
        assert.equal(out.line, false, 'a click on a thing draws no line');
        assert.deepEqual(out.add, [{ add: true }], 'a double click on nothing asks for a new thing');
        assert.equal(out.drawn, true, 'a line follows the pointer from the picked thing');
        assert.deepEqual(out.link, [{ link: ['ada', out.other] }], 'let go on the other, it asks to link Ada to it');
        assert.equal(out.lineGone, true, 'the line goes once let go');
        assert.deepEqual(out.turned, [], 'a drag from empty space only turns the view');
      },
    );

  // proves: edit_gestures, edit_read_only
  test(
    'where no card takes the ask, a double click on a thing still flies to it, and nothing breaks',
    options,
    async () => {
      const out = JSON.parse(await browser.run('editing("balls", false).then(JSON.stringify)'));
      assert.deepEqual(out.rename, [{ rename: 'ada' }], 'asked, and not taken');
    },
  );
});
