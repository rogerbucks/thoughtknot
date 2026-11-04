// The globe in the 3D view (editor spec §71): space-globe.ts. Requirements: globe_view, globe_dive_detail and
// globe_explore_centre.
// - Each thing is a card on the globe, the size of its box, with its name; balls once asked (Roger, 2 Nov 2026).
// - As balls, each has its name on it; each link is an arc ending in an arrowhead.
// - Seen from outside, the far side is hidden; from inside, all of it shows.
// - A link's words show only once the camera dives near; names show nearest first as there is room.
// - Laid again, each thing keeps its spot, and an exploration's centre faces the camera first; a new centre turns it.
// - A thing's properties show beside it only once the camera comes near it.
// - A drag turns the globe with the pointer: its front goes the way the pointer goes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOBE_FACING } from '../src/layouts/globe.ts';
import { GLOBE_DIVE, GlobeLayout, facingHalf, globeFacing, globeSpace } from '../src/space-globe.ts';
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

// proves: globe_view
test('each thing is a card on the globe, the size of its box, and swapped for balls it keeps its spot', () => {
  const { space } = globeSpace(HUB);
  const r = space.globe.radius;
  assert.equal(space.cards, true, 'painted as cards');
  for (const b of space.blocks) {
    assert.deepEqual(b.card, { width: 80, height: 30 }, `${b.of} is a card the size of its box`);
    assert.ok(Math.abs(length(middle(b)) - r) < 1e-6, `${b.of} sits on the globe`);
  }
  assert.equal(space.labels.find((l) => l.of === 'hub').text, 'HUB');
  const ends = space.lines.map((l) => [l.points[0], l.points.at(-1)]);
  for (const [a] of ends) assert.ok(Math.abs(length(a) - r) < r * 0.05, 'a link runs from its card, middle on');
  assert.equal(space.arrows.length, 20, 'each link ends in an arrowhead, put at the card it points to');
  const globe = new GlobeLayout();
  const cards = globe.lay(HUB, 'hub');
  globe.balls = true;
  const balls = globe.lay(HUB, 'hub');
  assert.ok(!balls.cards && balls.blocks.every((b) => !b.card), 'as balls');
  for (const b of cards.blocks) {
    const ball = balls.blocks.find((o) => o.of === b.of);
    assert.ok(length(middle(b).map((c, i) => c - middle(ball)[i])) < 1e-6, `${b.of} stays put`);
  }
});

test('as balls, each thing is a ball on the globe, named on it, and each link an arc ending at its ball', () => {
  const { space } = globeSpace(HUB, undefined, undefined, undefined, true);
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

// proves: globe_face_picked
test('a thing picked on the globe turns to face the camera square on, in the middle; another click dives to it', () => {
  const { space } = globeSpace(HUB);
  const g = space.globe,
    from = { ...orbitFit(space, 1), turn: 2 * Math.PI + 0.3 };
  for (const b of space.blocks) {
    const at = middle(b),
      o = globeFacing(from, g, at);
    assert.deepEqual(o.target, g.middle, 'it still turns round the globe');
    const eye = eyeOf(o),
      out = at.map((c, k) => c - g.middle[k]),
      look = eye.map((c, k) => c - g.middle[k]);
    const square = out.reduce((s, c, k) => s + c * look[k], 0) / (length(out) * length(look));
    assert.ok(square > 0.9999, `${b.of}: the camera is on the line out from the middle through it`);
    assert.ok(
      o.distance >= from.distance && length(look) > g.radius,
      'never nearer than it was, never inside the globe',
    );
    const p = projectPoint(spaceMatrix(o, 1, o.distance * 4), at, 600, 600);
    assert.ok(Math.hypot(p.x - 300, p.y - 300) < 1, 'in the middle of the screen');
    assert.ok(Math.abs(o.turn - from.turn) <= Math.PI + 1e-9, 'the short way round');
    const dived = globeFacing(o, g, at, true);
    assert.equal(dived.distance, g.radius * GLOBE_DIVE, 'a dive comes near enough for its details');
  }
});

/** The graph as the card reads it: things a to d, a linked to each of the others, as a hub. */
const GRAPH = {
  boxes: ['a', 'b', 'c', 'd'].map((key) => ({ key, kind: 'Idea', text: key.toUpperCase() })),
  links: ['b', 'c', 'd'].map((to) => ({ from: 'a', type: 'HAS', reading: 'has', to })),
};

// proves: globe_view
test('where its type draws no things or no links, the globe lays the graph’s own (Density, Treemap)', () => {
  // Density: a heat map, its squares drawing no thing
  const heat = [0, 1, 2].map((i) => ({
    id: `h${i}`,
    kind: 'box',
    style: 'svg.2',
    x: i * 10,
    y: 0,
    width: 10,
    height: 10,
  }));
  const blank = new GlobeLayout().lay(heat, null, undefined, GRAPH);
  assert.deepEqual(blank.blocks.map((b) => b.of).sort(), ['a', 'b', 'c', 'd'], 'each thing of the graph is on it');
  assert.equal(blank.lines.length, 3, 'and each of its links');
  assert.equal(blank.labels.find((l) => l.of === 'a')?.text, 'A', 'each named as the graph names it');
  // Treemap: its things drawn, no links between them; the drawn cards are kept as drawn
  const tiles = ['a', 'b', 'c', 'd'].flatMap((k) => thing(k));
  const tree = new GlobeLayout().lay(tiles, null, undefined, GRAPH);
  assert.equal(tree.blocks.length, 4, 'no thing drawn twice');
  assert.ok(
    tree.blocks.every((b) => b.card?.width === 80),
    'each card the size its type drew it',
  );
  assert.deepEqual(tree.lines.map((l) => `${l.from}>${l.to}`).sort(), ['a>b', 'a>c', 'a>d'], 'the graph’s links');
  // a drawing with its own links is laid as drawn
  const drawn = new GlobeLayout().lay(HUB, 'hub', undefined, GRAPH);
  assert.equal(drawn.lines.length, 20, 'only the links it draws');
  assert.ok(!drawn.blocks.some((b) => b.of === 'a'), 'only the things it draws');
});

// proves: globe_view
test('folded groups among many small things get room for their cards on the globe’s surface (700 things)', () => {
  // as a big graph draws it: each thing a dot, each folded hub a wide card holding its name and count
  const dot = (key) => ({ id: `t:${key}`, kind: 'box', style: 'svg.0', of: key, x: 0, y: 0, width: 6, height: 6 });
  const fold = (i) => ({ ...dot(`fold_group_${i}`), name: `Hub ${i} · 30 things`, width: 300, height: 60 });
  const big = [
    ...Array.from({ length: 40 }, (_, i) => dot(`d${i}`)),
    ...Array.from({ length: 10 }, (_, i) => fold(i)),
    ...Array.from({ length: 40 }, (_, i) => link(`f${i}`, `fold_group_${i % 10}`, `d${i}`, 'has')),
  ];
  for (const balls of [false, true]) {
    const { space } = globeSpace(big, undefined, undefined, undefined, balls);
    const r = space.globe.radius,
      folds = space.blocks.filter((b) => b.of.startsWith('fold_group_'));
    assert.equal(folds.length, 10);
    for (const b of folds) assert.ok(Math.abs(length(middle(b)) - r) < 1e-6, `${b.of} sits on the globe`);
    // each card's own square of room, as the globe gives a thing, fits on its surface with the others'
    const room = folds.reduce((s, b) => s + (Math.max(b.card.width, b.card.height) * 1.3) ** 2, 0);
    assert.ok(4 * Math.PI * r * r >= room, `${balls ? 'balls' : 'cards'}: the globe has room for its folded cards`);
  }
});

// proves: globe_view
test('the points where a big drawing merges its links are no things on the globe: its links join the things', () => {
  // as a big graph draws merged links: a's link runs into a trunk, which splits to b and to c
  const point = (key) => ({ id: `t:${key}`, kind: 'box', style: 'svg.0', of: key, x: 0, y: 0, width: 6, height: 6 });
  const merged = [
    ...['a', 'b', 'c'].flatMap((k) => thing(k)),
    point('trunk_1_in'),
    point('trunk_1_out'),
    { ...link('m0', 'a', 'trunk_1_in'), headless: true },
    { ...link('m1', 'trunk_1_in', 'trunk_1_out'), headless: true },
    link('m2', 'trunk_1_out', 'b', 'has'),
    link('m3', 'trunk_1_out', 'c', 'has'),
  ];
  const space = new GlobeLayout().lay(merged, 'a');
  assert.deepEqual(space.blocks.map((b) => b.of).sort(), ['a', 'b', 'c'], 'only the things are on the globe');
  assert.deepEqual(space.lines.map((l) => `${l.from}>${l.to}`).sort(), ['a>b', 'a>c'], 'each link thing to thing');
  assert.equal(space.arrows.length, 2, 'each with its arrowhead');
});
