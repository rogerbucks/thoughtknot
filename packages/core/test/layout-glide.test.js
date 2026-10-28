// A change of layout glides each thing from where it was to where it goes (editor spec §68, layout_glide). It is lined
// up first, so the drawing does not spin or jump. This tests layout-glide.ts, the pure part. The card's part is tested in
// layout-glide-svg.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AS_IS, MOVED_PX, easeGlide, lineUp, linedUp, offsetAt, offsetsOf, placeKept } from '../src/layout-glide.ts';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} ≈ ${b}`);
const spots = (o) => new Map(Object.entries(o));
/** A small house of five things, not the same any way it is turned or mirrored. */
const HOUSE = spots({ a: [0, 0], b: [100, 0], c: [100, 60], d: [0, 60], e: [30, 110] });
/** `at` turned by `turn` radians about the start, mirrored across first with `flip`, then moved by `by`. */
const moved = (at, turn, flip = false, by = [0, 0]) =>
  new Map(
    [...at].map(([k, [x0, y]]) => {
      const x = flip ? -x0 : x0;
      return [k, [Math.cos(turn) * x - Math.sin(turn) * y + by[0], Math.sin(turn) * x + Math.cos(turn) * y + by[1]]];
    }),
  );
const fitsBack = (was, now, by) => {
  for (const [k, p] of now) {
    const [x, y] = linedUp(p, by);
    near(x, was.get(k)[0], `${k} x`);
    near(y, was.get(k)[1], `${k} y`);
  }
};

// proves: layout_glide
test('a new layout turned, moved or mirrored is lined up with the old exactly, so it neither spins nor jumps', () => {
  for (const turn of [0, 0.4, Math.PI / 2, Math.PI, -2.5]) {
    const now = moved(HOUSE, turn, false, [300, -40]);
    const by = lineUp(HOUSE, now);
    assert.equal(by.flip, false, `turned ${turn}: not mirrored`);
    fitsBack(HOUSE, now, by);
  }
  const mirrored = moved(HOUSE, 1.1, true, [5, 5]);
  const by = lineUp(HOUSE, mirrored);
  assert.equal(by.flip, true, 'a mirrored layout is flipped back');
  fitsBack(HOUSE, mirrored, by);
});

// proves: layout_glide
test('lined up by the things in both: a thing new or gone changes nothing; nothing shared, nothing changes', () => {
  const now = moved(HOUSE, 0.7, false, [20, 20]);
  now.set('new', [999, 999]);
  const was = new Map(HOUSE);
  was.set('gone', [-500, 0]);
  const by = lineUp(was, now);
  fitsBack(HOUSE, new Map([...now].filter(([k]) => k !== 'new')), by);
  assert.equal(lineUp(HOUSE, spots({ z: [1, 1] })), AS_IS);
});

// proves: layout_glide
test('a layout whose rows run one way is only moved, never turned', () => {
  const now = moved(HOUSE, Math.PI / 2, false, [50, 0]);
  const by = lineUp(HOUSE, now, false);
  assert.equal(by.turn, 0);
  assert.equal(by.flip, false);
  // the middles meet: the drawing as a whole stays where it was
  const middle = (m) => [...m.values()].reduce((s, [x, y]) => [s[0] + x / m.size, s[1] + y / m.size], [0, 0]);
  const after = new Map([...now].map(([k, p]) => [k, linedUp(p, by)]));
  near(middle(after)[0], middle(HOUSE)[0]);
  near(middle(after)[1], middle(HOUSE)[1]);
});

// proves: layout_glide
test('each thing that moved starts at its old spot and eases to its new one; a new one or a still one has none', () => {
  const was = spots({ a: [10, 10], b: [50, 50], still: [5, 5] });
  const now = spots({ a: [110, 10], b: [50, 20], still: [5, 5 + MOVED_PX / 2], fresh: [0, 0] });
  const offsets = offsetsOf(was, now);
  assert.deepEqual([...offsets.keys()].sort(), ['a', 'b']);
  assert.deepEqual(offsets.get('a'), [-100, 0], 'it starts where it was');
  assert.deepEqual(offsetAt(offsets.get('a'), 0), [-100, 0]);
  assert.deepEqual(offsetAt(offsets.get('a'), 1), [0, 0], 'and ends exactly where it goes');
  const path = Array.from({ length: 11 }, (_, i) => offsetAt(offsets.get('a'), i / 10)[0]);
  assert.ok(
    path.every((x, i) => i === 0 || x >= path[i - 1]),
    'always on its way, never back',
  );
  // eased: it sets off and arrives slowly, quickest in the middle
  assert.ok(easeGlide(0.1) < 0.1 && easeGlide(0.9) > 0.9);
  near(easeGlide(0.5), 0.5);
});

// proves: layout_glide
test('the person’s place is kept: what is selected stays on screen where it was, else the things in both', () => {
  const was = spots({ a: [100, 100], b: [200, 100] });
  const now = spots({ a: [300, 400], b: [250, 400] });
  assert.deepEqual(placeKept(was, now, 'a'), [-200, -300], 'the selected thing goes back where it was');
  assert.deepEqual(placeKept(was, now, 'b'), [-50, -300]);
  assert.deepEqual(placeKept(was, now, null), [-125, -300], 'else their middle does');
  assert.deepEqual(placeKept(was, now, 'gone'), [-125, -300]);
  assert.equal(placeKept(was, spots({ z: [0, 0] })), null, 'nothing in both: the view is left alone');
});
