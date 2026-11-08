// The globe on the new rendering (phase P3 of wiki/Rendering-spec.md; editor spec §71, globe_view): render-globe.ts and
// stage-look.ts. Roger, 7 Nov 2026: the globe flipped between two looks, and looked as if no work had been done on it.
// Now it shows the same marks as 2D wrapped round a ball, at every zoom: one look, never the old view in space.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneOf } from '../src/render/render-scene.ts';
import { roomsOf } from '../src/render/render-rooms.ts';
import { detailAt, roomSizes } from '../src/render/render-detail.ts';
import { LIGHT } from '../src/render/render-look.ts';
import { marksOf, onScreen } from '../src/render/render-marks.ts';
import { fitView, zoomTo } from '../src/render/render-camera.ts';
import { ballRadius, bendOf, middleOf, unwrapped, wrapped } from '../src/render/render-globe.ts';
import { aNetwork, lookedFrom, turnedView } from '../src/display/graph-view/stage-look.ts';
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
  for (const subject of ['Work', 'Money', 'Home', 'Health'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 8; i++) things.push(thing(`${subject[0]}${area}${i}`, { subject, area }));
  const links = [link('WA0', 'MA0'), link('MA1', 'WB1'), link('HA0', 'WA2'), link('HB0', 'MB2'), link('WA1', 'WB2')];
  const scene = sceneOf({ things, links });
  const spots = roomsOf(scene);
  return { scene, spots, sizes: roomSizes(scene, spots) };
}

/** The fitted view of `spots` on the globe. */
const globeOf = (spots) => {
  const fit = fitView(spots.values(), 1280, 800);
  return lookedFrom(fit, 'globe', spots.values());
};

// proves: globe_view
test('the globe wraps the flat drawing round a ball: the middle faces you, the edge curves away, the far side hides', () => {
  const { spots } = drawing();
  const kept = new Map([...spots].map(([k, s]) => [k, { ...s }]));
  const fit = fitView(spots.values(), 1280, 800);
  const view = globeOf(spots);
  assert.ok(view.globe > 0 && view.scale === fit.scale, 'the same zoom, bent round a ball');
  // with no bend, the picture is the flat one, pixel for pixel
  for (const s of spots.values()) {
    const [a, b] = [onScreen(s, fit), onScreen(s, { ...fit, globe: 0 })];
    assert.deepEqual([a.x, a.y, a.r], [b.x, b.y, b.r]);
  }
  const [cx, cy] = middleOf(view);
  const mid = wrapped(cx, cy, view);
  assert.deepEqual([mid.x, mid.y, mid.k, mid.behind], [cx, cy, 1, false], 'the middle faces you, as drawn');
  const radius = ballRadius(view);
  // further out on the flat drawing lies further round the ball, never past its edge, and shrinks toward it
  let last = { x: cx, k: 1 };
  for (let d = 20; d < radius * 1.5; d += 20) {
    const p = wrapped(cx + d, cy, view);
    assert.ok(p.x >= last.x - 1e-9 && p.x <= cx + radius + 1e-9, `${d} px out stays on the ball`);
    assert.ok(p.k <= last.k, 'smaller toward the edge');
    assert.equal(p.behind, d / radius > Math.PI / 2, 'past a quarter turn it is round the far side');
    last = p;
  }
  // every room of the drawing is on the near side at the fitted zoom, so nothing is lost at first
  for (const s of spots.values()) assert.ok(!onScreen(s, view).behind);
  // a point on the ball goes back to where it was on the flat drawing
  const [ux, uy] = unwrapped(...Object.values(wrapped(cx + 150, cy - 90, view)).slice(0, 2), view);
  assert.ok(Math.abs(ux - (cx + 150)) < 1e-6 && Math.abs(uy - (cy - 90)) < 1e-6);
  assert.deepEqual(spots, kept, 'the eye moved; nothing in the drawing did (nodes stay put)');
  assert.ok(bendOf([]) === 0, 'nothing to wrap: no bend');
});

// proves: globe_view
test('on the globe the marks are the 2D marks: a ball under them, arched roads, and signposts to rooms round the back', () => {
  const { scene, spots, sizes } = drawing();
  const view = globeOf(spots);
  const marks = marksOf(scene, spots, detailAt(sizes, view.scale), LIGHT, view);
  const ground = marks[0];
  assert.equal(ground.kind, 'ground', 'the ball is painted first, under everything');
  assert.ok(ground.ball && Math.abs(ground.ball.r - ballRadius(view)) < 1e-6, 'its outline is the ball’s edge');
  assert.ok(ground.lines.length > 10, 'with a faint grid on its skin');
  assert.notEqual(
    ground.ball.paper,
    LIGHT.paper,
    'its skin is tinted, so near in it still reads as a surface, not the page',
  );
  assert.ok(ground.alpha >= 0.7, 'the grid on the skin is clear enough to see');
  const roads = marks.filter((m) => m.kind === 'road');
  assert.ok(roads.length > 0 && roads.every((r) => r.via), 'every road arches over the ball');
  assert.ok(
    marks.some((m) => m.kind === 'label' && m.text.startsWith('Work')),
    'names read as in 2D',
  );
  // turned so the room furthest out faces you: what lies round the back is gone, and a signpost points to it
  const [mx, my] = middleOf(view).map((m, i) => (i ? view.y : view.x) + m / view.scale);
  const far = (s) => Math.hypot(s.x - mx, s.y - my);
  const work = scene.named.map((k) => spots.get(k)).sort((a, b) => far(b) - far(a))[0];
  const near = view;
  const turned = { ...near, x: work.x - near.w / 2 / near.scale, y: work.y - near.h / 2 / near.scale };
  const behind = [...spots].filter(([, s]) => onScreen(s, turned).behind).map(([k]) => k);
  assert.ok(behind.length > 0, 'part of the drawing is round the far side');
  const seen = marksOf(scene, spots, detailAt(sizes, turned.scale), LIGHT, turned);
  for (const m of seen) if (m.kind === 'cloud' || m.kind === 'dot') assert.ok(!behind.includes(m.key), m.key);
  const signs = seen.filter((m) => m.kind === 'label' && /^[→↘↓↙←↖↑↗] /.test(m.text));
  // a room whose middle is round the back but whose body reaches over the edge is drawn, cut at the edge, not dropped
  const radius = ballRadius(turned),
    [bx, by] = middleOf(turned);
  const edge = seen.filter((m) => m.kind === 'cloud' && Math.abs(Math.hypot(m.x - bx, m.y - by) - radius) < 1);
  assert.ok(
    signs.length > 0 || edge.length > 0,
    'a room out of sight has a signpost, or shows partly at the ball’s edge',
  );
  assert.ok(edge.length > 0, 'a room part way over the edge is drawn, as a room is part way off a flat screen');
  const touches = (p) => radius - Math.hypot(p[0] - bx, p[1] - by) < 0.15 * radius;
  assert.ok(
    seen.some((m) => m.kind === 'road' && (touches(m.from) || touches(m.to))),
    'a road with one end round the back runs as far as the ball’s edge',
  );
  // the painter draws the ball and its marks without deciding anything
  const calls = [];
  const c = new Proxy(
    { createRadialGradient: () => ({ addColorStop() {} }) },
    { get: (o, k) => o[k] ?? ((...a) => calls.push([k, ...a])), set: () => true },
  );
  paintCanvas(c, seen, turned.w, turned.h);
  assert.ok(
    calls.some(([k]) => k === 'arc'),
    'the ball is painted',
  );
  const names = calls.map(([k]) => k);
  assert.ok(names.includes('clip'), 'what reaches over the ball’s edge is cut there');
  assert.equal(
    names.filter((k) => k === 'save').length,
    names.filter((k) => k === 'restore').length,
    'each cut is undone',
  );
});

// proves: globe_view
test('a zoom on the globe stays at the pointer, and a drag or the turn keys spin the ball', () => {
  const { spots } = drawing();
  const view = globeOf(spots);
  const at = [view.w / 2 + 180, view.h / 2 - 120];
  const [fx, fy] = unwrapped(at[0], at[1], view);
  const point = { x: view.x + fx / view.scale, y: view.y + fy / view.scale, r: 0 };
  for (const scale of [view.scale * 1.3, view.scale * 4]) {
    const zoomed = zoomTo(view, scale, at);
    const s = onScreen(point, zoomed);
    assert.ok(Math.hypot(s.x - at[0], s.y - at[1]) < 1e-6, 'what was under the pointer is still under it');
    assert.equal(zoomed.globe, view.globe, 'still the same globe');
  }
  const spun = turnedView(view, 40, -10);
  assert.ok(spun && spun.x < view.x && spun.y > view.y && spun.globe === view.globe, 'the ball spins under the keys');
  assert.equal(turnedView({ ...view, globe: 0 }, 40, 0), null, 'flat: nothing to turn');
});

// proves: type_try_reading
test('the new rendering draws a network only: a card drawn as another type shows that type', () => {
  // Roger, 7 Nov 2026: "I click different diagram types and nothing happens": the stage covered every type
  assert.equal(aNetwork(undefined), true, 'no diagram types offered: drawn as a network');
  assert.equal(aNetwork({ choice: { drawn: 'network' } }), true);
  assert.equal(aNetwork({ choice: { drawn: 'radial', chosen: 'radial' } }), false);
  assert.equal(aNetwork({ choice: { drawn: 'network' }, table: {} }), false, 'a table is drawn as one');
  assert.equal(aNetwork({ choice: { drawn: 'network' }, picture: {} }), false, 'a view draws its own picture');
});
