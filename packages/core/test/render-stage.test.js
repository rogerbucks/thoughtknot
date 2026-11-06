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
