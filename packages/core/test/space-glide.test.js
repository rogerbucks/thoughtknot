// A drawing laid out again in 2.5D or 3D glides (editor spec §68, layout_glide): space-glide.ts. A layout made afresh
// in space is lined up with the last one, turned only round the upright. Then each thing glides with its name, its
// links and its arrowheads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineUpSpace, linedUpLayout, spaceGlide, spotsOf, turnedSpace } from '../src/space-glide.ts';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} ≈ ${b}`);
const nearAll = (a, b, msg) => a.forEach((v, i) => near(v, b[i], `${msg ?? ''}[${i}]`));

/** A drawing in space of balls at `at`, by key, 20 wide, with a link a → b and its arrowhead and words. */
function spaceOf(at) {
  const blocks = Object.entries(at).map(([k, [x, y, z = 0]]) => ({
    id: `b:${k}`,
    style: 's',
    of: k,
    x: x - 10,
    y: y - 10,
    width: 20,
    depth: 20,
    floor: z,
    tall: 20,
  }));
  const [a, b] = [at.a, at.b].map(([x, y, z = 0]) => [x, y, z]);
  const lines = [
    {
      id: 'e1',
      style: 's',
      points: [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], b],
      from: 'a',
      to: 'b',
    },
  ];
  const arrows = [{ id: 'e1\narrow', style: 's', tip: b, back: [b[0] - 1, b[1], b[2]], size: 8 }];
  const labels = [
    { id: 'l:a', style: 's', at: [a[0], a[1], a[2] + 30], text: 'A', size: 12, of: 'a' },
    { id: 'e1\nwords', style: 's', at: lines[0].points[1], text: 'to', size: 10, link: 'e1' },
  ];
  return { blocks, lines, labels, arrows, round: true, least: [0, 0, 0], most: [1, 1, 1] };
}

const HOUSE = { a: [0, 0], b: [100, 0], c: [100, 60], d: [0, 60], e: [30, 110] };
/** HOUSE turned a quarter round the upright and moved, with heights. */
const TURNED = { a: [200, 0, 5], b: [200, 100, 5], c: [140, 100, 5], d: [140, 0, 5], e: [90, 30, 5] };

// proves: layout_glide
test('a layout made afresh in space is turned round the upright onto the last, so it neither spins nor jumps', () => {
  const was = spaceOf(HOUSE),
    now = spaceOf(TURNED);
  const by = lineUpSpace(was, now);
  assert.ok(by, 'it is lined up');
  const lined = turnedSpace(now, by);
  for (const [k, [x, y, z]] of spotsOf(lined)) {
    near(x, HOUSE[k][0], `${k} across`);
    near(y, HOUSE[k][1], `${k} along`);
    near(z, 5, `${k} keeps its height`);
  }
  // its link, arrowhead and words go round with it
  nearAll(lined.lines[0].points[0], [0, 0, 5]);
  nearAll(lined.arrows[0].tip, [100, 0, 5]);
  nearAll(lined.labels[0].at, [0, 0, 35]);
  assert.ok(lined.least[0] <= -10 && lined.most[0] >= 110, 'and its bounds are its own again');
  // the spots the next layout starts from are turned with it
  const [, spots] = linedUpLayout(was, now, new Map([['a', [200, 0, 5]]]));
  nearAll(spots.get('a'), [0, 0, 5]);
  assert.equal(lineUpSpace(was, spaceOf(HOUSE)), null, 'the same layout again: nothing to line up');
});

// proves: layout_glide
test('each thing glides from its old spot to its new one, its links, arrowhead and names with it', () => {
  const was = spaceOf({ a: [0, 0], b: [100, 0] }),
    now = spaceOf({ a: [0, 0], b: [100, 200, 40] });
  const step = spaceGlide(was, now);
  assert.ok(step);
  const first = step(0);
  assert.deepEqual(spotsOf(first).get('b'), [100, 0, 0], 'b starts where it was');
  assert.deepEqual(spotsOf(first).get('a'), [0, 0, 0], 'a, which stays, does not move');
  nearAll(first.lines[0].points.at(-1), [100, 0, 0], 'the link’s end with b');
  nearAll(first.lines[0].points[0], [0, 0, 0], 'its start with a');
  nearAll(first.arrows[0].tip, [100, 0, 0], 'the arrowhead with b');
  nearAll(first.labels[1].at, [50, 0, 0], 'the link’s words halfway');
  assert.equal(step(1), now, 'it ends as laid out');
  const ys = Array.from({ length: 11 }, (_, i) => spotsOf(step(i / 10)).get('b')[1]);
  assert.ok(
    ys.every((y, i) => i === 0 || y >= ys[i - 1]),
    'always on its way, never back',
  );
  assert.equal(spaceGlide(now, spaceOf({ a: [0, 0], b: [100, 200, 40] })), null, 'nothing moved: no glide');
});
