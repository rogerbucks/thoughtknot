// The new rendering's stage (editor spec §73, render_switch): display/graph-view/render-stage.ts. With the setting on, a
// graph with levels is drawn on one canvas over its card; Ctrl and the wheel step one level; unloading puts today's
// drawing back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, OPTIONS, settingsFrom } from '../src/settings.ts';

/** A drawing of two subjects, each with two areas of four boxes, named by property. */
function drawingAndGraph() {
  const boxes = [],
    props = new Map();
  for (const subject of ['Work', 'Money'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 4; i++) {
        const key = `${subject[0]}${area}${i}`;
        boxes.push({ key, text: key, label: key, kinds: ['Item'] });
        props.set(key, { name: key, subject, area });
      }
  const g = { nodes: props, p: (k) => props.get(k) };
  return { drawing: { boxes, links: [], estimates: [] }, g };
}

// proves: render_switch
test('the setting is on until turned off, and the settings page offers it', () => {
  assert.equal(DEFAULT_SETTINGS.newRendering, 'on');
  assert.equal(settingsFrom({ newRendering: 'off' }).newRendering, 'off');
  assert.equal(settingsFrom({ newRendering: 'maybe' }).newRendering, 'on');
  assert.equal(OPTIONS.find((o) => o.key === 'newRendering')?.section, 'Drawing');
});

// proves: render_switch
test('the stage covers the card, zooms smoothly with a trackpad pinch, and unloads cleanly', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { RenderStage, hasLevels } = await import('../src/display/graph-view/render-stage.ts');
    const { drawing, g } = drawingAndGraph();
    assert.ok(hasLevels(drawing, g));
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    const stage = new RenderStage(viewport, drawing, g);
    assert.ok(viewport.classList.contains('thoughtknot-new-rendering'));
    assert.equal(viewport.querySelector('canvas.thoughtknot-render-stage'), stage.canvas);
    // what it painted last, as data the scoreboard counts (scripts/render-measure.mjs)
    const drawn = stage.canvas.thoughtknotDrawn();
    assert.equal(drawn.view, stage.view);
    assert.ok(drawn.marks.some((m) => m.kind === 'label'));
    const at = () => Number(/^Level (\d) of 3 · /.exec(stage.level())[1]);
    const start = at();
    assert.ok(start < 3, 'a small card does not open every level at once');
    // a Mac trackpad's pinch: many Ctrl-wheel events of a few pixels each, every one heard and each a small zoom
    let prevented = 0;
    const pinch = {
      ctrlKey: true,
      metaKey: false,
      deltaY: -3,
      clientX: 400,
      clientY: 200,
      preventDefault: () => prevented++,
      stopPropagation() {},
    };
    const scales = [stage.view.scale],
      seen = [start];
    for (let i = 0; i < 600; i++) {
      stage.wheel(pinch);
      scales.push(stage.view.scale);
      seen.push(at());
    }
    assert.equal(prevented, 600, 'the page does not zoom instead');
    for (let i = 1; i < scales.length; i++) assert.ok(scales[i] / scales[i - 1] < 1.03, 'never a jump');
    for (let i = 1; i < seen.length; i++) assert.ok([0, 1].includes(seen[i] - seen[i - 1]), seen.join());
    assert.equal(seen.at(-1), 3, 'every level opens on the way');
    const still = stage.view;
    stage.wheel({ ...pinch, ctrlKey: false });
    assert.equal(stage.view, still, 'plain scrolling is the page’s');
    stage.unload();
    assert.ok(!viewport.classList.contains('thoughtknot-new-rendering'));
    assert.equal(viewport.querySelector('canvas'), null);
  } finally {
    uninstall();
  }
});

// proves: render_one_camera
test('a click picks from the marks: a group opens a level, an item opens, a second click centres it', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { GLIDE_MS, RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const { pickAt } = await import('../src/render/render-camera.ts');
    const { drawing, g } = drawingAndGraph();
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    const said = [];
    let chosen = null;
    const hands = {
      open: (key) => (said.push(`open ${key}`), (chosen = key)),
      clear: () => (said.push('clear'), (chosen = null)),
      selected: () => chosen,
    };
    const win = viewport.win ?? globalThis;
    win.matchMedia = (q) => ({ matches: q.includes('reduce') }); // less motion: each glide lands at once
    const stage = new RenderStage(viewport, drawing, g, hands);
    const view = () => stage.view;
    // the press is the stage's own, so today's drawing underneath does not take the pointer and lose the click
    let stopped = false;
    stage.down({ clientX: 1, clientY: 1, pointerId: 1, stopPropagation: () => (stopped = true) });
    assert.ok(stopped, 'a press on the stage goes no further');
    stage.drag = null;
    stage.clicked(-50, -50);
    assert.deepEqual(said, ['clear'], 'empty space clears the choice');
    // groups: each click glides one level nearer
    for (let i = 0; i < 4 && !stage.marks.some((m) => m.kind === 'dot'); i++) {
      const cloud = stage.marks.find((m) => m.kind === 'cloud');
      const before = view().scale;
      stage.clicked(cloud.x, cloud.y);
      assert.ok(view().scale > before, 'a click on a group opens its next level');
    }
    const dot = stage.marks.find((m) => m.kind === 'dot' && pickAt(stage.marks, m.x, m.y) === m.key);
    assert.ok(dot, 'clicking groups reaches items a click can pick');
    const where = { ...view() };
    stage.clicked(dot.x, dot.y);
    assert.equal(said.at(-1), `open ${dot.key}`);
    assert.deepEqual(view(), where, 'the first click on an item moves nothing');
    stage.clicked(dot.x, dot.y);
    const again = stage.marks.find((m) => m.kind === 'dot' && m.key === dot.key);
    const c = view().clear ?? { left: 0, right: 0, top: 0, bottom: 0 };
    const middle = c.left + (view().w - c.left - c.right) / 2;
    assert.ok(Math.abs(again.x - middle) < 1, 'the second click centres it');
    // with motion, the same click glides there over a moment rather than jumping
    win.matchMedia = () => ({ matches: false });
    const far = { ...view(), x: view().x + 200 / view().scale };
    stage.view = far;
    stage.draw();
    stage.clicked(again.x - 200, again.y);
    assert.deepEqual(view(), far, 'a glide starts where the view is');
    await new Promise((r) => setTimeout(r, GLIDE_MS + 80));
    const landed = stage.marks.find((m) => m.kind === 'dot' && m.key === dot.key);
    assert.ok(Math.abs(landed.x - middle) < 1, 'and lands centred');
    stage.unload();
  } finally {
    uninstall();
  }
});

// Rule 4 of the rendering spec, things stay put: zooming and clicking move the camera, never a thing.
// proves: render_one_camera
test('nothing moves on a zoom or a click: every dot stays on its own place in the drawing', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const { drawing, g } = drawingAndGraph();
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    (viewport.win ?? globalThis).matchMedia = () => ({ matches: true });
    const stage = new RenderStage(viewport, drawing, g, { open() {}, clear() {}, selected: () => null });
    const places = new Map([...stage.spots].map(([k, s]) => [k, { x: s.x, y: s.y }]));
    const check = (when) => {
      const v = stage.view;
      for (const m of stage.marks.filter((m) => m.kind === 'dot' || m.kind === 'cloud')) {
        const p = places.get(m.key);
        assert.ok(Math.abs(m.x / v.scale + v.x - p.x) < 1e-6, `${m.key} moved across ${when}`);
        assert.ok(Math.abs(m.y / v.scale + v.y - p.y) < 1e-6, `${m.key} moved up or down ${when}`);
      }
    };
    check('when fitted');
    const notch = { ctrlKey: true, metaKey: false, deltaY: -40, clientX: 300, clientY: 150 };
    for (let i = 0; i < 12; i++) {
      stage.wheel({ ...notch, preventDefault() {}, stopPropagation() {} });
      check(`after ${i + 1} wheel movements`);
    }
    const cloud = stage.marks.find((m) => m.kind === 'cloud');
    if (cloud) stage.clicked(cloud.x, cloud.y);
    check('after a click');
    assert.deepEqual(new Map([...stage.spots].map(([k, s]) => [k, { x: s.x, y: s.y }])), places);
    stage.unload();
  } finally {
    uninstall();
  }
});

// proves: render_one_camera
test('on a touch screen, the drawing follows two fingers: it zooms as they spread, and a pinch is never a tap', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const { drawing, g } = drawingAndGraph();
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    const said = [];
    const stage = new RenderStage(viewport, drawing, g, {
      open: (k) => said.push(k),
      clear: () => said.push('clear'),
      selected: () => null,
    });
    const at = () => stage.view.scale;
    const finger = (pointerId, clientX, clientY = 200) => ({ pointerId, clientX, clientY, stopPropagation() {} });
    const start = at();
    stage.down(finger(1, 300));
    stage.down(finger(2, 340));
    stage.move(finger(2, 345)); // 40 to 45 pixels apart: a little nearer, at once
    assert.ok(Math.abs(at() - start * 1.125) < 1e-9, 'a little spread zooms a little');
    stage.move(finger(2, 360)); // 45 to 60
    assert.ok(Math.abs(at() - start * 1.5) < 1e-9, 'the zoom follows the fingers');
    stage.move(finger(2, 330)); // 60 to 30: out, but never past the fitted view
    assert.equal(at(), start);
    stage.up(finger(2, 330));
    stage.up(finger(1, 300));
    assert.deepEqual(said, [], 'a pinch is not a tap');
    stage.unload();
  } finally {
    uninstall();
  }
});

// proves: render_one_camera
test('while a view in space shows, the stage leaves the trackpad pinch and the pointer to it', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const { drawing, g } = drawingAndGraph();
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    let space = true;
    const stage = new RenderStage(viewport, drawing, g, {
      open() {},
      clear() {},
      selected: () => null,
      away: () => space,
    });
    let heard = 0;
    const pinch = { ctrlKey: true, metaKey: false, deltaY: -3, clientX: 400, clientY: 200 };
    const event = { ...pinch, preventDefault: () => heard++, stopPropagation: () => heard++ };
    const was = stage.view;
    stage.wheel(event);
    stage.down({ clientX: 1, clientY: 1, pointerId: 1, stopPropagation: () => heard++ });
    assert.equal(heard, 0, 'the view in space hears the pinch and the press');
    assert.equal(stage.view, was);
    space = false;
    stage.wheel(event);
    assert.ok(stage.view.scale > was.scale, 'back in 2D, the stage zooms again');
    stage.unload();
  } finally {
    uninstall();
  }
});

// proves: render_switch, level_colours
test('the colour key shows over the new rendering: told each new level, with the colours the drawing paints', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const { LIGHT } = await import('../src/render/render-look.ts');
    const { drawing, g } = drawingAndGraph();
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    const own = new Map();
    let told = 0;
    const stage = new RenderStage(viewport, drawing, g, {
      open() {},
      clear() {},
      selected: () => null,
      drawn: () => told++,
      own: (key) => own.get(key),
    });
    assert.equal(told, 1, 'the badge hears the first level');
    stage.draw();
    assert.equal(told, 1, 'a drawing at the same level says nothing new');
    const before = stage.level();
    for (let i = 0; i < 400 && stage.level() === before; i++)
      stage.wheel({
        ctrlKey: true,
        deltaY: -20,
        clientX: 400,
        clientY: 200,
        preventDefault() {},
        stopPropagation() {},
      });
    assert.notEqual(stage.level(), before);
    assert.ok(told >= 2, 'the badge hears the new level');
    // the chips take the drawing's colours: Work first, Money second, as the mockups do
    const [work, money] = stage.scene.named;
    assert.equal(stage.colourOf(work), LIGHT.subjects[0]);
    assert.equal(stage.colourOf(money), LIGHT.subjects[1]);
    // a colour picked on the key is the one the drawing paints
    own.set(work, 2);
    assert.equal(stage.colourOf(work), LIGHT.subjects[2]);
    stage.unload();
  } finally {
    uninstall();
  }
});

// proves: level_regions
test('a click on a signpost glides to the room off screen at the same zoom', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const { drawing: plain, g } = drawingAndGraph();
    const drawing = { ...plain, links: [{ from: 'WA0', type: 'TO', to: 'MA0' }] };
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    (viewport.win ?? globalThis).matchMedia = (q) => ({ matches: q.includes('reduce') });
    const stage = new RenderStage(viewport, drawing, g, { open() {}, clear() {}, selected: () => null });
    const [work, money] = stage.scene.named;
    // close on Work, so Money is off screen
    const w = stage.spots.get(work);
    stage.view = { ...stage.view, scale: 3, x: w.x - stage.view.w / 6, y: w.y - stage.view.h / 6 };
    stage.draw();
    const sign = stage.marks.find((m) => m.kind === 'label' && m.key === money);
    assert.ok(sign, 'a signpost to Money');
    assert.match(sign.text, /^[→↘↓↙←↖↑↗] /);
    stage.clicked(sign.x + sign.w / 2, sign.y + sign.h / 2);
    assert.equal(stage.view.scale, 3, 'the same zoom');
    const m = stage.spots.get(money);
    const x = (m.x - stage.view.x) * 3,
      y = (m.y - stage.view.y) * 3;
    assert.ok(x > 0 && x < stage.view.w && y > 0 && y < stage.view.h, 'Money is on screen now');
    stage.unload();
  } finally {
    uninstall();
  }
});

// proves: mini_map
test('the mini-map paints the drawing in its own look, outlines the part in view, and a press moves the view there', async () => {
  // Roger, 7 Nov 2026: the mini-map should reflect the overall look, not squares
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { GLIDE_MS, RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const { drawing, g } = drawingAndGraph();
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    const stage = new RenderStage(viewport, drawing, g);
    const mini = stage.mini;
    assert.ok(mini, 'shown by default');
    assert.ok(mini.canvas.classList.contains('thoughtknot-mini-map'), 'in the mini-map’s corner slot');
    // zoomed in: the outline is a small part of the copy
    const [work, money] = stage.scene.named;
    const w = stage.spots.get(work);
    stage.view = { ...stage.view, scale: stage.view.scale * 6, x: w.x, y: w.y };
    stage.draw();
    const f = mini.frame();
    assert.ok(f.w < 160 && f.h < 120, 'the part in view, outlined small');
    // a press on Money's place on the copy brings Money to the middle, at the same zoom
    const m = stage.spots.get(money);
    const scale = stage.view.scale;
    const whole = mini.whole;
    mini.moveTo({ clientX: (m.x - whole.x) * whole.scale, clientY: (m.y - whole.y) * whole.scale });
    assert.equal(stage.view.scale, scale);
    const x = (m.x - stage.view.x) * scale,
      y = (m.y - stage.view.y) * scale;
    assert.ok(Math.abs(x - stage.view.w / 2) < 2 && Math.abs(y - stage.view.h / 2) < 2, 'Money is in the middle');
    // a press during a glide wins: the glide stops, and the view stays where the press put it
    const win = viewport.win ?? globalThis;
    win.matchMedia = () => ({ matches: false });
    stage.glideTo({ ...stage.view, x: w.x, y: w.y });
    mini.moveTo({ clientX: (m.x - whole.x) * whole.scale, clientY: (m.y - whole.y) * whole.scale });
    const pressed = { ...stage.view };
    await new Promise((r) => setTimeout(r, GLIDE_MS + 80));
    assert.deepEqual(stage.view, pressed, 'the glide under way stopped');
    stage.unload();
    assert.ok(!mini.canvas.parentElement, 'gone with the stage');
    // the mini-map setting off: none
    const off = new RenderStage(viewport, drawing, g, undefined, false);
    assert.equal(off.mini, null);
    off.unload();
  } finally {
    uninstall();
  }
});
