// The tilted camera (phase P3 of wiki/Rendering-spec.md; editor spec §73, render_one_camera): render/render-tilt.ts.
// 2.5D and 3D see the same marks as 2D from an angle. No tilt is the flat picture; far is smaller; nothing moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneOf } from '../src/render/render-scene.ts';
import { roomsOf } from '../src/render/render-rooms.ts';
import { detailAt, roomSizes } from '../src/render/render-detail.ts';
import { LIGHT } from '../src/render/render-look.ts';
import { marksOf, onScreen } from '../src/render/render-marks.ts';
import { fitView } from '../src/render/render-camera.ts';
import { groundOf, groundShift, heightOf, isTilted, tilted, turnedBy } from '../src/render/render-tilt.ts';
import { paintCanvas } from '../src/render/paint-canvas.ts';

const thing = (key, names = {}) => ({
  key,
  text: `Thing ${key}`,
  kinds: ['Item'],
  texts: new Map(Object.entries(names)),
});
const link = (from, to) => ({ from, to, type: 'RELATES' });

function drawing() {
  const things = [];
  for (const subject of ['Work', 'Money', 'Home'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 8; i++) things.push(thing(`${subject[0]}${area}${i}`, { subject, area }));
  const scene = sceneOf({ things, links: [link('WA0', 'MA0'), link('MA1', 'WB1'), link('HA0', 'WA2')] });
  const spots = roomsOf(scene);
  return { scene, spots, sizes: roomSizes(scene, spots) };
}

const overlap = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

// proves: render_one_camera
test('with no tilt the picture is the flat one; tipped back, far things are smaller and the middle stays put', () => {
  // Roger, 7 Nov 2026: the old 2.5D and 3D look goes; they see the same marks as 2D, from an angle
  const flat = { x: 0, y: 0, scale: 1, w: 1000, h: 600 };
  assert.equal(isTilted(flat), false);
  assert.deepEqual(onScreen({ x: 120, y: 80, r: 10 }, flat), { x: 120, y: 80, r: 10 }, 'no tilt: as flat');
  assert.deepEqual(onScreen({ x: 120, y: 80, r: 10 }, { ...flat, tilt: 0, turn: 0 }), { x: 120, y: 80, r: 10 });
  const view = { ...flat, tilt: 0.7 };
  assert.ok(isTilted(view));
  const middle = tilted(500, 300, 0, view);
  assert.ok(Math.abs(middle.x - 500) < 1e-9 && Math.abs(middle.y - 300) < 1e-9 && middle.k === 1, 'the middle stays');
  const far = onScreen({ x: 500, y: 50, r: 20 }, view),
    near = onScreen({ x: 500, y: 550, r: 20 }, view);
  assert.ok(far.r < 20 && near.r > 20, 'far things are smaller, near ones bigger');
  assert.ok(far.y < 300 && near.y > 300, 'far stays above the middle, near below');
  assert.ok(300 - far.y < 250 && near.y - 300 < 250, 'the ground is foreshortened');
  // a lifted point comes nearer and rises on the screen
  const lifted = tilted(500, 300, 40, view);
  assert.ok(lifted.k > 1 && lifted.y < 300);
  // a quarter turn takes the right of the screen to the bottom
  const turned = tilted(600, 300, 0, { ...flat, turn: Math.PI / 2 });
  assert.ok(Math.abs(turned.x - 500) < 1e-9 && Math.abs(turned.y - 400) < 1e-9);
});

// proves: render_one_camera
test('tipped back, the same marks are drawn: far clouds first, rooms under what they hold, names never overlap, nothing moves', () => {
  const { scene, spots, sizes } = drawing();
  const kept = new Map([...spots].map(([k, s]) => [k, { ...s }]));
  const fit = fitView(spots.values(), 1280, 800);
  const view = { ...fit, tilt: 0.8, turn: 0.3 };
  const flat = marksOf(scene, spots, detailAt(sizes, fit.scale), LIGHT, fit);
  const marks = marksOf(scene, spots, detailAt(sizes, view.scale), LIGHT, view);
  const kinds = (ms) => [...new Set(ms.map((m) => m.kind))].sort();
  assert.deepEqual(kinds(marks), [...kinds(flat), 'ground'].sort(), 'the same kinds of marks as flat, on a ground');
  const clouds = marks.filter((m) => m.kind === 'cloud');
  const depth = (m) => scene.nodes.get(m.key).depth;
  for (let i = 1; i < clouds.length; i++) {
    const [a, b] = [clouds[i - 1], clouds[i]];
    assert.ok(depth(a) < depth(b) || (depth(a) === depth(b) && a.y <= b.y), 'far first, a room under its insides');
  }
  const labels = marks.filter((m) => m.kind === 'label');
  assert.ok(labels.length > 0);
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++) assert.ok(!overlap(labels[i], labels[j]), labels[i].text);
  assert.deepEqual(spots, kept, 'the camera moved, nothing in the drawing did');
});

// proves: render_one_camera
test('tipped back in a small card beside a panel, every group still shows its name, and none overlap', () => {
  // the ground's gaps shrink as it tips, so a group's name may sit just clear of its neighbour's (Roger, 7 Nov 2026)
  const subjects = ['Work', 'Money', 'Home', 'Health', 'Learning', 'Side projects'];
  const things = [];
  subjects.forEach((subject, n) => {
    for (const area of ['A', 'B', 'C'])
      for (let i = 0; i < 4 + n * 3; i++) things.push(thing(`${n}${area}${i}`, { subject, area }));
  });
  const scene = sceneOf({ things, links: [] });
  const spots = roomsOf(scene),
    sizes = roomSizes(scene, spots);
  for (const tilt of [0.6, 0.8])
    for (const turn of [0, 0.3]) {
      const fit = fitView(spots.values(), 500, 330, { top: 0, right: 0, bottom: 0, left: 280 });
      const view = { ...fit, tilt, turn };
      const labels = marksOf(scene, spots, detailAt(sizes, view.scale), LIGHT, view).filter((m) => m.kind === 'label');
      const names = new Set(labels.map((m) => m.text));
      assert.deepEqual(
        subjects.filter((s) => !names.has(s)),
        [],
        `tilt ${tilt}, turn ${turn}`,
      );
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++) assert.ok(!overlap(labels[i], labels[j]), labels[i].text);
    }
});

// proves: space_one_bar
test('the bar’s 2.5D and 3D tip the new rendering’s camera back, flat looks straight down, and the globe is left alone', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const boxes = [],
      props = new Map();
    for (const subject of ['Work', 'Money'])
      for (let i = 0; i < 6; i++) {
        const key = `${subject[0]}${i}`;
        boxes.push({ key, text: key, label: key, kinds: ['Item'] });
        props.set(key, { name: key, subject, area: `${subject}${i % 2}` });
      }
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    (viewport.win ?? globalThis).matchMedia = (q) => ({ matches: q.includes('reduce') });
    const stage = new RenderStage(
      viewport,
      { boxes, links: [], estimates: [] },
      { nodes: props, p: (k) => props.get(k) },
    );
    const kept = new Map([...stage.spots].map(([k, s]) => [k, { ...s }]));
    const flat = stage.view;
    assert.equal(stage.lookFrom('cards'), true, 'the stage shows 2.5D itself');
    assert.equal(stage.view.tilt, 0.6);
    assert.equal(stage.view.lift, 0, '2.5D lies on the ground');
    assert.equal(stage.view.scale, flat.scale, 'the same zoom');
    assert.ok(isTilted(stage.view));
    assert.equal(stage.lookFrom('balls'), true);
    assert.ok(stage.view.tilt > 0.6, '3D tips further back');
    assert.equal(stage.view.lift, 1, '3D stands each level on the one that holds it');
    stage.resized();
    assert.ok(stage.view.tilt > 0.6, 'a fit keeps the angle');
    assert.equal(stage.lookFrom(null), true);
    assert.equal(isTilted(stage.view), false, 'flat again');
    assert.equal(stage.lookFrom('globe'), false, 'the globe is the view in space');
    assert.deepEqual(stage.spots, kept, 'the camera moved, nothing in the drawing did');
    stage.unload();
  } finally {
    uninstall();
  }
});

// proves: render_one_camera
test('in 3D each level stands on the one that holds it: items on stems, rooms over their footprints, on a ground', () => {
  const { scene, spots, sizes } = drawing();
  const kept = new Map([...spots].map(([k, s]) => [k, { ...s }]));
  const fit = fitView(spots.values(), 1280, 800);
  assert.deepEqual(groundOf(fit), [], 'flat: no ground drawn');
  assert.equal(heightOf({ ...fit, lift: 0 }, 3), 0, '2.5D lies on the ground');
  const view = { ...fit, tilt: 0.8, lift: 1 };
  assert.ok(heightOf(view, 2) > heightOf(view, 1) && heightOf(view, 1) > 0, 'deeper stands higher');
  const detail = detailAt(sizes, 1e6); // close enough that every level shows
  const marks = marksOf(scene, spots, detail, LIGHT, view);
  const ground = marks.find((m) => m.kind === 'ground');
  assert.ok(ground && ground.lines.length > 4, 'a ground of grid lines');
  assert.equal(marks[0], ground, 'the ground is painted first, under everything');
  const dots = marks.filter((m) => m.kind === 'dot');
  assert.ok(
    dots.length > 0 && dots.every((d) => d.foot && d.foot[1] > d.y),
    'each item stands on a stem above its foot',
  );
  const inner = marks.filter((m) => m.kind === 'cloud' && scene.nodes.get(m.key).depth > 0);
  assert.ok(inner.length > 0 && inner.every((c) => c.shadow && c.shadow.y > c.y), 'a room stands over its footprint');
  const top = marks.filter((m) => m.kind === 'cloud' && scene.nodes.get(m.key).depth === 0);
  assert.ok(
    top.every((c) => !c.shadow),
    'the top level lies on the ground',
  );
  // the painter draws the ground, the stems and the footprints it is given, and nothing of its own
  const calls = [];
  const c = new Proxy(
    { createRadialGradient: () => ({ addColorStop() {} }) },
    { get: (t, k) => t[k] ?? ((...a) => calls.push([k, ...a])), set: () => true },
  );
  paintCanvas(c, marks, 1280, 800);
  const lines = calls.filter(([k]) => k === 'lineTo').length;
  assert.ok(lines >= ground.lines.length + dots.length, 'grid lines and stems drawn');
  assert.deepEqual(spots, kept, 'nothing in the drawing moved');
});

// proves: render_one_camera
test('seen from an angle, a drag moves the ground under the pointer, and Shift or the right button turns and tips', async () => {
  // the ground follows the pointer, however the camera is turned
  const view = { x: 0, y: 0, scale: 1, w: 1000, h: 600, tilt: 0.7, turn: 0.9 };
  const at = (v) => tilted(500 - v.x, 300 - v.y, 0, v);
  const [gx, gy] = groundShift(view, 30, -20);
  const moved = { ...view, x: view.x - gx, y: view.y - gy };
  const [a, b] = [at(view), at(moved)];
  assert.ok(Math.abs(b.x - a.x - 30) < 3 && Math.abs(b.y - a.y + 20) < 3, `${b.x - a.x}, ${b.y - a.y}`);
  assert.deepEqual(groundShift({ ...view, tilt: 0, turn: 0 }, 30, -20), [30, -20], 'flat: as dragged');
  // turning and tipping, never straight down and never edge on
  const turned = turnedBy(view, 100, 0);
  assert.ok(turned.turn > view.turn && turned.tilt === view.tilt);
  assert.ok(turnedBy(view, 0, -1e4).tilt >= 0.2 && turnedBy(view, 0, 1e4).tilt <= 1.2);
  // on the stage: Shift or the right button turns, a plain drag moves, and nothing in the drawing moves
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const boxes = [],
      props = new Map();
    for (const subject of ['Work', 'Money'])
      for (let i = 0; i < 6; i++) {
        const key = `${subject[0]}${i}`;
        boxes.push({ key, text: key, label: key, kinds: ['Item'] });
        props.set(key, { name: key, subject, area: `${subject}${i % 2}` });
      }
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    (viewport.win ?? globalThis).matchMedia = (q) => ({ matches: q.includes('reduce') });
    const stage = new RenderStage(
      viewport,
      { boxes, links: [], estimates: [] },
      { nodes: props, p: (k) => props.get(k) },
    );
    const kept = new Map([...stage.spots].map(([k, s]) => [k, { ...s }]));
    const drag = (from, to, extra = {}) => {
      const e = (x, y) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, stopPropagation() {}, ...extra });
      stage.down(e(...from));
      stage.move(e(...to));
      stage.up(e(...to));
    };
    // flat, Shift does not turn: there is no angle to turn
    drag([100, 100], [160, 100], { shiftKey: true });
    assert.equal(stage.view.turn ?? 0, 0);
    stage.lookFrom('cards');
    const before = stage.view;
    drag([100, 100], [160, 130], { shiftKey: true });
    assert.ok(stage.view.turn > 0 && stage.view.tilt > before.tilt, 'Shift and a drag turn and tip');
    assert.equal(stage.view.x, before.x, 'turning does not move the drawing');
    const turned = stage.view;
    drag([100, 100], [80, 100], { button: 2 });
    assert.ok(stage.view.turn < turned.turn, 'the right button turns too');
    const still = stage.view;
    drag([100, 100], [160, 100]);
    assert.equal(stage.view.turn, still.turn, 'a plain drag moves, it does not turn');
    assert.notEqual(stage.view.x, still.x);
    assert.deepEqual(stage.spots, kept, 'the camera moved, nothing in the drawing did');
    stage.unload();
  } finally {
    uninstall();
  }
});
