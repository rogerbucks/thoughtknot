// The order an arc or a matrix puts things in (editor spec §68, projection_arc, projection_matrix): block-order.ts.
// A group's things sit side by side. Linked groups sit next to each other, and linked things close. The same graph
// gives the same order. The matrix outlines each group's block on its diagonal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockName, blockOrder } from '../src/view-types/block-order.ts';
import { matrixMarks } from '../src/view-types/matrix-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';

/** A shape of things `[key, kind]`, links `[from, to]` and groups. */
const shapeOf = (things, links = [], groups) => ({
  things: things.map(([key, kind = 'Thing']) => ({ key, text: key.toUpperCase(), kinds: [kind] })),
  links: links.map(([from, to]) => ({ from, type: 'LINKS', to })),
  ...(groups ? { groups } : {}),
});
/** Two tight knots of four, a1..a4 and b1..b4, the things written mixed, one link between the knots. */
const knots = (groups) =>
  shapeOf(
    ['a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'a4', 'b4'].map((k) => [k]),
    [
      ...['a', 'b'].flatMap((g) => [
        [`${g}1`, `${g}2`],
        [`${g}2`, `${g}3`],
        [`${g}3`, `${g}4`],
        [`${g}4`, `${g}1`],
        [`${g}1`, `${g}3`],
      ]),
      ['a1', 'b1'],
    ],
    groups,
  );
/** Whether each of `sets` is one run, side by side, in `order`. */
const runs = (order, sets) =>
  sets.every((set) => {
    const at = set.map((k) => order.indexOf(k)).sort((x, y) => x - y);
    return at.at(-1) - at[0] === set.length - 1;
  });

// proves: projection_matrix
test('with no groups written, the groups the links make sit side by side, each thing once', () => {
  const { order, blocks } = blockOrder(knots());
  assert.deepEqual([...order].sort(), ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4']);
  assert.ok(
    runs(order, [
      ['a1', 'a2', 'a3', 'a4'],
      ['b1', 'b2', 'b3', 'b4'],
    ]),
    order.join(),
  );
  assert.deepEqual(
    blocks.map((b) => [b.from, b.to]),
    [
      [0, 4],
      [4, 8],
    ],
  );
  assert.deepEqual(blockOrder(knots()), { order, blocks }, 'the same graph, the same order');
});

// proves: projection_matrix
test('a thing written in two groups sits once, in the first', () => {
  const { order, blocks } = blockOrder(
    knots([
      ['A', ['a1', 'a2', 'a3', 'a4', 'b1']],
      ['B', ['b1', 'b2', 'b3', 'b4']],
    ]),
  );
  assert.equal(order.length, 8, order.join());
  assert.deepEqual(
    blocks.map((b) => [b.label, b.to - b.from]),
    [
      ['A', 5],
      ['B', 3],
    ],
  );
});

// proves: projection_arc
test('groups written win, the rest a block of their own; with no links, the kinds', () => {
  const { order, blocks } = blockOrder(knots([['Odd', ['a1', 'a3', 'b1', 'b3']]]));
  assert.ok(runs(order, [['a1', 'a3', 'b1', 'b3']]));
  assert.deepEqual(
    blocks.map((b) => b.label),
    ['Odd', ''],
  );
  const kinds = blockOrder(
    shapeOf([
      ['x', 'Person'],
      ['p', 'Place'],
      ['y', 'Person'],
    ]),
  );
  assert.deepEqual(kinds.order.slice(0, 2).sort(), ['x', 'y'], 'the larger kind first, side by side');
  assert.deepEqual(
    kinds.blocks.map((b) => b.label),
    ['Person', 'Place'],
  );
  assert.equal(
    blockName({ label: '', from: 0, to: 3 }, ['a', 'b', 'c'], (k) => k.toUpperCase()),
    'A +2',
  );
});

// proves: projection_arc
test('within a group, things linked in a chain sit in the chain’s order', () => {
  const chain = shapeOf(
    ['c', 'e', 'a', 'd', 'b'].map((k) => [k]),
    [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'e'],
    ],
  );
  const { order } = blockOrder(chain);
  const at = (k) => order.indexOf(k);
  assert.ok(
    [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'e'],
    ].every(([x, y]) => Math.abs(at(x) - at(y)) === 1),
    order.join(),
  );
});

// proves: projection_matrix
test('a matrix outlines each group as a block on its diagonal, the links inside it filling it', () => {
  const space = { width: 500, height: 500 };
  const marks = drawMarksOf(matrixMarks({ shape: knots(), space }), space);
  assert.ok(Array.isArray(marks), marks);
  const groups = marks.filter((m) => m.kind === 'group');
  assert.equal(groups.length, 2);
  for (const g of groups) assert.equal(g.x, g.y, 'on the diagonal');
  const inside = (c, g) => c.x >= g.x - 1e-6 && c.y >= g.y - 1e-6 && c.x + c.width <= g.x + g.width + 1e-6;
  const cells = marks.filter((m) => m.kind === 'box');
  assert.equal(
    cells.filter((c) => groups.some((g) => inside(c, g) && c.y + c.height <= g.y + g.height + 1e-6)).length,
    10,
  );
});
