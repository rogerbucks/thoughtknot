// The globe (editor spec §71): globe.ts. Requirements: globe_layout and globe_explore_centre.
// - Every thing sits on a sphere that grows with their number; the same graph gives the same globe.
// - Linked things sit nearer each other than unlinked ones; links run as arcs a little above the surface.
// - The centre faces the viewer, and a thing placed last time keeps its spot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOBE_FACING, globeArc, globeSpots } from '../src/layouts/globe.ts';

const length = (v) => Math.hypot(...v);
const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const near = (a, b, by = 1e-6) => Math.abs(a - b) <= by;

/** Two rings of ten, each a hub and its spokes, and no link between them. */
function twoHubs() {
  const things = [],
    links = [];
  for (const hub of ['a', 'b']) {
    things.push({ key: hub });
    for (let i = 0; i < 9; i++) {
      things.push({ key: `${hub}${i}` });
      links.push({ from: hub, to: `${hub}${i}` });
    }
  }
  return { things, links };
}

test('every thing sits on the sphere, at a finite spot, the same each time', () => {
  const shape = twoHubs();
  const globe = globeSpots(shape);
  assert.equal(globe.spots.size, 20);
  for (const [k, p] of globe.spots) {
    assert.ok(p.every(Number.isFinite), `${k} is finite`);
    assert.ok(near(length(p), globe.radius, 1e-6 * globe.radius), `${k} is on the sphere`);
  }
  assert.deepEqual([...globeSpots(shape).spots], [...globe.spots], 'the same graph gives the same globe');
});

test('the sphere grows with the number of things, and is never tiny', () => {
  const many = (n) => ({ things: Array.from({ length: n }, (_, i) => ({ key: `t${i}` })), links: [] });
  assert.equal(globeSpots(many(1)).radius, globeSpots(many(3)).radius, 'a few things share the smallest globe');
  assert.ok(globeSpots(many(400)).radius > globeSpots(many(100)).radius);
  assert.equal(globeSpots(many(0)).spots.size, 0);
  const one = globeSpots(many(1));
  const [only] = one.spots.values();
  assert.ok(
    near(
      gap(
        only,
        GLOBE_FACING.map((c) => c * one.radius),
      ),
      0,
    ),
    'one thing faces the viewer',
  );
});

test('linked things sit nearer each other than unlinked ones', () => {
  const globe = globeSpots(twoHubs());
  const spot = (k) => globe.spots.get(k);
  const linked = [],
    apart = [];
  for (let i = 0; i < 9; i++) {
    linked.push(gap(spot('a'), spot(`a${i}`)), gap(spot('b'), spot(`b${i}`)));
    apart.push(gap(spot('a'), spot(`b${i}`)), gap(spot('b'), spot(`a${i}`)));
  }
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(mean(linked) < mean(apart) * 0.7, `${mean(linked)} is well under ${mean(apart)}`);
});

test('the centre faces the viewer, and things placed last time keep their spots', () => {
  const shape = twoHubs();
  const globe = globeSpots(shape, { centre: 'b3' });
  const pole = GLOBE_FACING.map((c) => c * globe.radius);
  assert.ok(near(gap(globe.spots.get('b3'), pole), 0), 'the centre is at the pole');
  // more things open: the ones shown already stay exactly where they were
  const more = {
    things: [...shape.things, { key: 'new1' }, { key: 'new2' }],
    links: [...shape.links, { from: 'a', to: 'new1' }, { from: 'new1', to: 'new2' }],
  };
  const then = globeSpots(more, { centre: 'b3', previous: globe.spots });
  for (const [k, p] of globe.spots) assert.deepEqual(then.spots.get(k), p, `${k} stays put`);
  // the new ones start beside the neighbour they open from
  assert.ok(gap(then.spots.get('new1'), then.spots.get('a')) < then.radius);
});

test('a link runs as an arc a little above the surface, from one end to the other', () => {
  const r = 200,
    a = [r, 0, 0],
    b = [0, 0, r];
  const arc = globeArc(a, b, r);
  assert.ok(arc.length > 2, 'a quarter turn takes several steps');
  for (const p of arc) assert.ok(near(length(p), r * 1.03, 1e-6), 'each point is just above the surface');
  assert.ok(near(gap(arc[0], [r * 1.03, 0, 0]), 0) && near(gap(arc.at(-1), [0, 0, r * 1.03]), 0));
  // opposite ends still go round, never through the middle
  for (const p of globeArc([r, 0, 0], [-r, 0, 0], r)) assert.ok(near(length(p), r * 1.03, 1e-6));
  assert.equal(globeArc(a, a, r).length, 2, 'a loop to itself is one short step');
});
