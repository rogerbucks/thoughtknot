// The arc view (editor spec §68, projection_arc): arc-view.ts. Things sit on one line, a group side by side. Each
// link is an arc: above the line from left to right, below it from right to left. A long link is a tall arc. Every
// mark stays inside the space it is given.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arcMarks } from '../src/view-types/arc-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';

const SPACE = { width: 600, height: 300 };
/** A shape of things `[key, kind]` and links `[from, to]`. */
const shapeOf = (things, links = []) => ({
  things: things.map(([key, kind = 'Thing']) => ({ key, text: key.toUpperCase(), kinds: [kind] })),
  links: links.map(([from, to]) => ({ from, type: 'LINKS', to })),
});
const middleY = (m) => m.y + m.height / 2;

// proves: projection_arc
test('things sit on one line, named, and each link is an arc above or below it, the longer the taller', () => {
  const shape = shapeOf(
    [['a'], ['b'], ['c'], ['d']],
    [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'a'],
    ],
  );
  const marks = drawMarksOf(arcMarks({ shape, space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  const dots = marks.filter((m) => m.kind === 'box');
  assert.equal(dots.length, 4);
  assert.ok(
    dots.every((m) => Math.abs(middleY(m) - middleY(dots[0])) < 1e-6),
    'one line',
  );
  assert.ok(marks.some((m) => m.kind === 'label' && m.text === 'A'));
  const x = new Map(dots.map((m) => [m.of, m.x]));
  const line = middleY(dots[0]);
  const arcs = marks.filter((m) => m.kind === 'link');
  assert.equal(arcs.length, 4);
  for (const l of arcs) {
    assert.equal(l.curve, true);
    const peak = l.points[1][1] - line;
    assert.ok(x.get(l.to) > x.get(l.from) ? peak < 0 : peak > 0, `${l.from}→${l.to} above when left to right`);
  }
  const height = (l) => Math.abs(l.points[1][1] - line),
    span = (l) => Math.abs(l.points[3][0] - l.points[0][0]);
  const [short, long] = [...arcs]
    .sort((p, q) => span(p) - span(q))
    .filter((_, i, all) => i === 0 || i === all.length - 1);
  assert.ok(height(long) > height(short), 'a long link stands out');
});

// proves: projection_arc
test('groups show as runs on the line, and a long arc is lowered to stay in the space', () => {
  const things = [...Array(30).keys()].map((i) => [`t${i}`, i % 2 ? 'Odd' : 'Even']);
  const links = things.slice(1).map(([k], i) => [things[i][0], k]);
  const marks = drawMarksOf(arcMarks({ shape: shapeOf(things, links), space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  for (const l of marks.filter((m) => m.kind === 'link'))
    for (const [px, py] of l.points) assert.ok(px >= 0 && px <= 600 && py >= 0 && py <= 300, `${px},${py}`);
  const many = shapeOf([...Array(70).keys()].map((i) => [`m${i}`]));
  assert.equal(arcMarks({ shape: many, space: SPACE }).filter((m) => m.kind === 'label').length, 0, 'too many to name');
  assert.deepEqual(arcMarks({ shape: shapeOf([]), space: SPACE }), []);
});
