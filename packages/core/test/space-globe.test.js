// The globe in the 3D view (editor spec §71): space-globe.ts. Requirements: globe_view, globe_dive_detail and
// globe_explore_centre.
// - Each thing is a ball on the globe, its name on it; each link an arc ending in an arrowhead.
// - Seen from outside, the far side is hidden; from inside, all of it shows.
// - A link's words show only once the camera dives near; names show nearest first as there is room.
// - Laid again, each thing keeps its spot, and an exploration's centre faces the camera first; a new centre turns it.
// - A thing's properties show beside it only once the camera comes near it.
// - A drag turns the globe with the pointer: its front goes the way the pointer goes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOBE_FACING } from '../src/layouts/globe.ts';
import { GlobeLayout, facingHalf, globeSpace } from '../src/space-globe.ts';
import { eyeOf, orbitFit, projectPoint, spaceMatrix } from '../src/space-view.ts';
import { turnRound } from '../src/space-controls.ts';

/** A box mark for thing `key`, as svg-marks.ts reads one, with its name's label. */
const thing = (key) => [
  { id: `t:${key}`, kind: 'box', style: 'svg.0', of: key, x: 0, y: 0, width: 80, height: 30 },
  { id: `l:${key}`, kind: 'label', style: 'svg.0', of: key, x: 40, y: 15, text: key.toUpperCase(), size: 14 },
];
/** A link mark from `from` to `to`, saying `name`. */
const link = (id, from, to, name) => ({ id, kind: 'link', style: 'svg.1', points: [], from, to, name });

/** A hub with twenty spokes round it, each link saying "has". */
const HUB = [
  ...thing('hub'),
  ...Array.from({ length: 20 }, (_, i) => thing(`s${i}`)).flat(),
  ...Array.from({ length: 20 }, (_, i) => link(`k${i}`, 'hub', `s${i}`, 'has')),
];

/** Sixty things in pairs, each pair linked: spread over the whole globe. */
const SPREAD = [
  ...Array.from({ length: 60 }, (_, i) => thing(`p${i}`)).flat(),
  ...Array.from({ length: 30 }, (_, i) => link(`q${i}`, `p${2 * i}`, `p${2 * i + 1}`, 'pairs')),
];

const length = (v) => Math.hypot(...v);
const middle = (b) => [b.x + b.width / 2, b.y + b.depth / 2, b.floor + b.tall / 2];

test('each thing is a ball on the globe, named on it, and each link an arc ending at its ball', () => {
  const { space } = globeSpace(HUB);
  const r = space.globe.radius;
  assert.equal(space.blocks.length, 21);
  assert.ok(space.round, 'painted as balls');
  for (const b of space.blocks) assert.ok(Math.abs(length(middle(b)) - r) < 1e-6, `${b.of} sits on the globe`);
  const hub = space.labels.find((l) => l.of === 'hub');
  assert.equal(hub.text, 'HUB');
  assert.ok(Math.abs(length(hub.at) - r) < 1e-6, 'its name sits on its ball');
  assert.equal(space.lines.length, 20);
  for (const l of space.lines) for (const p of l.points) assert.ok(length(p) > r, 'each arc runs above the surface');
  assert.equal(space.arrows.length, 20);
  assert.equal(space.labels.filter((l) => l.link !== undefined).length, 20, 'each link has its words');
});

test('seen from outside, the far side is hidden; from inside, all of it shows', () => {
  const { space } = globeSpace(SPREAD);
  const r = space.globe.radius;
  const eye = GLOBE_FACING.map((c) => c * r * 3);
  const near = facingHalf(space, eye, space.globe);
  assert.ok(near.blocks.length > 0 && near.blocks.length < space.blocks.length, 'only the facing side');
  for (const b of near.blocks) assert.ok(middle(b).reduce((s, c, i) => s + c * GLOBE_FACING[i], 0) > -0.1 * r);
  assert.ok(
    near.blocks.some((b) => b.of === 'p0'),
    'the first thing faces the camera',
  );
  for (const a of near.arrows) assert.ok(a.tip.reduce((s, c, i) => s + c * GLOBE_FACING[i], 0) > -0.1 * r);
  const inside = facingHalf(space, [0, 0, r / 2], space.globe);
  assert.equal(inside.blocks.length, space.blocks.length, 'from inside nothing is hidden');
});

test("a link's words show only once the camera dives near", () => {
  const { space } = globeSpace(HUB);
  const r = space.globe.radius;
  const far = facingHalf(
    space,
    GLOBE_FACING.map((c) => c * r * 3),
    space.globe,
  );
  assert.equal(far.labels.filter((l) => l.link !== undefined).length, 0, 'far out, names only');
  assert.ok(far.labels.some((l) => l.of === 'hub'));
  const dived = facingHalf(
    space,
    GLOBE_FACING.map((c) => c * r * 1.3),
    space.globe,
  );
  assert.ok(
    dived.labels.some((l) => l.link !== undefined),
    'dived in, the words of links near show',
  );
});

test("the globe opens facing the viewer with an exploration's centre, and each thing keeps its spot", () => {
  const globe = new GlobeLayout();
  const first = globe.lay(HUB, 's7');
  const s7 = middle(first.blocks.find((b) => b.of === 's7'));
  const towards = s7.reduce((s, c, i) => s + c * GLOBE_FACING[i], 0) / length(s7);
  assert.ok(towards > 0.999, 'the centre is where the camera looks from as the view opens');
  // the view's own opening camera looks from that side
  const eye = eyeOf(orbitFit(first, 1));
  assert.ok(eye.reduce((s, c, i) => s + c * GLOBE_FACING[i], 0) > 0, 'the camera is on the centre side');
  // more opens: things shown before stay put
  const then = globe.lay([...HUB, ...thing('new'), link('kn', 's7', 'new', 'has')], 's7');
  for (const b of first.blocks) assert.deepEqual(middle(then.blocks.find((o) => o.of === b.of)), middle(b));
  // off, it shows the space as it is
  assert.equal(globe.facing(first, orbitFit(first, 1), false), first);
  assert.ok(
    globe.facing(first, orbitFit(first, 1), true).blocks.length < first.blocks.length,
    'on, the far side hides',
  );
});

test("a thing's properties show beside it only once the camera comes near it", () => {
  const details = (key) => (key === 'hub' ? ['status: open', 'owner: Ada'] : []);
  const { space } = globeSpace(HUB, undefined, 'hub', details);
  const said = space.labels.find((l) => l.text === 'status: open · owner: Ada');
  assert.ok(said && said.of === undefined, 'one line of properties, below the hub, not its name');
  assert.equal(space.labels.filter((l) => l.text.includes('owner')).length, 1, 'only things with properties get one');
  const r = space.globe.radius,
    from = (k) =>
      facingHalf(
        space,
        GLOBE_FACING.map((c) => c * r * k),
        space.globe,
      );
  assert.ok(!from(3).labels.includes(said), 'far out, no properties');
  assert.ok(!from(1.6).labels.includes(said), 'diving in, still none till near the thing');
  assert.ok(from(1.2).labels.includes(said), 'near the hub, its properties show');
});

test('a new centre turns the whole globe to face the viewer, each thing kept where it is on it', () => {
  const globe = new GlobeLayout();
  const first = globe.lay(HUB, 'hub');
  const at = (space, k) => middle(space.blocks.find((b) => b.of === k));
  const then = globe.lay(HUB, 's7');
  const s7 = at(then, 's7');
  assert.ok(s7.reduce((s, c, i) => s + c * GLOBE_FACING[i], 0) / length(s7) > 0.999, 's7 now faces the viewer');
  // turned all together: the gaps between things are as they were
  const gap = (a, b) => Math.hypot(...a.map((c, i) => c - b[i]));
  for (const [a, b] of [
    ['hub', 's7'],
    ['s1', 's12'],
    ['s3', 's19'],
  ])
    assert.ok(Math.abs(gap(at(first, a), at(first, b)) - gap(at(then, a), at(then, b))) < 1e-6, `${a} to ${b} kept`);
  assert.deepEqual(at(globe.lay(HUB, 's7'), 'hub'), at(then, 'hub'), 'the same centre again turns nothing');
});

test('a drag turns the globe with the pointer, in every 3D way of showing it', () => {
  const orbit = { target: [0, 0, 0], distance: 600, turn: -Math.PI / 2, tilt: 0.9 };
  const front = GLOBE_FACING.map((c) => c * 200);
  const seen = (o) => projectPoint(spaceMatrix(o, 1, 2000), front, 800, 800);
  const was = seen(orbit);
  assert.ok(seen(turnRound(orbit, 50, 0, [0, 0, 0])).x > was.x + 20, 'dragged right, its front goes right');
  assert.ok(seen(turnRound(orbit, 0, 50, [0, 0, 0])).y > was.y + 20, 'dragged down, its front goes down');
});
