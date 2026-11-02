// Links that touch their things' edges (editor spec §36, links_touch_edges): link-ends.ts. Each end of a link stops
// where the line, aimed at its thing's middle, meets the thing's outline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkEnds, linkHues } from '../src/view-types/link-ends.ts';

const box = (of, x, y, shape) => ({ kind: 'box', id: of, of, x: x - 10, y: y - 10, width: 20, height: 20, shape });
const link = (points) => ({ kind: 'link', id: 'l', from: 'a', to: 'b', points });
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9;

// proves: links_touch_edges
test('a link between two round things starts and ends on their outlines, aimed at their middles', () => {
  const [, , l] = linkEnds([
    box('a', 0, 0, 'ellipse'),
    box('b', 100, 0, 'ellipse'),
    link([
      [0, 0],
      [100, 0],
    ]),
  ]);
  assert.ok(near(l.points[0], [10, 0]) && near(l.points[1], [90, 0]));
  const [, , slant] = linkEnds([
    box('a', 0, 0, 'ellipse'),
    box('b', 100, 100, 'ellipse'),
    link([
      [0, 0],
      [100, 100],
    ]),
  ]);
  const r = Math.hypot(...slant.points[0]);
  assert.ok(Math.abs(r - 10) < 1e-9, 'on the circle, not the corner of its box');
});

// proves: links_touch_edges
test('a square thing is met on its side; a link that starts outside, or a thing with no box, is left as drawn', () => {
  const [, , l] = linkEnds([
    box('a', 0, 0, 'rect'),
    box('b', 100, 50, 'rect'),
    link([
      [0, 0],
      [100, 50],
    ]),
  ]);
  assert.ok(near(l.points[0], [10, 5]) && near(l.points[1], [90, 45]));
  const out = link([
    [50, 0],
    [60, 0],
  ]);
  assert.deepEqual(linkEnds([box('a', 0, 0), out])[1].points, out.points);
  assert.deepEqual(linkEnds([out])[0], out);
});

// proves: links_touch_edges
test("each plain link takes its type's colour, numbered as the theme numbers the types", () => {
  const links = [
    { from: 'a', to: 'b', type: 'uses' },
    { from: 'b', to: 'c', type: 'owns' },
    { from: 'a', to: 'b', type: 'owns' },
  ];
  const mark = (id, from, to, style = 'link') => ({
    kind: 'link',
    id,
    from,
    to,
    style,
    points: [
      [0, 0],
      [1, 1],
    ],
  });
  const out = linkHues(
    [mark('link\n0', 'a', 'b'), mark('link\n2', 'a', 'b'), mark('x', 'b', 'c'), mark('m', 'a', 'b', 'link.many')],
    links,
  );
  assert.deepEqual(
    out.map((m) => m.style),
    ['reading.0', 'reading.1', 'reading.1', 'link.many'],
    "by its number, else by its ends; a view's own style is kept",
  );
});
