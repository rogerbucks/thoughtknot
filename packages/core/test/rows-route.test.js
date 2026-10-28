// Our own curve router (editor spec §25, links_routed_in_rows; #1232): layouts/rows-route.ts, and drawing with it
// (direct-links.ts, render.ts svgOf). Past 300 things a link passes between the rows of boxes Graphviz laid out, and
// no box moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from '../src/engine.ts';
import { directLinks } from '../src/direct-links.ts';
import { routedSource } from '../src/fold-source.ts';
import { layoutSvg } from '../src/graphviz-svg.ts';
import { readability } from '../src/layouts/readability.ts';
import { inRows, rowsOf, rowsRoute } from '../src/layouts/rows-route.ts';
import { directions, svgOf } from '../src/render.ts';
import { readNote } from '../src/drawing.ts';
import { graphOf } from '../../../scripts/benchmarks/draw-fifty.mjs';

const engine = await loadEngine();

/** A box `key` with its middle at (`x`, `y`), 40 by 20. */
const box = (key, x, y) => ({ key, x, y, hw: 20, hh: 10 });

/** The layout source, laid out straight, and its marks, of the benchmark graph of `count` things, the `way` given. */
function laidOut(count, way = 'LR') {
  const drawing = readNote([graphOf(count, Math.round(count * 1.4))]).graphs.get('g');
  const dot = directions({ ...drawing, direction: way })[0].dot;
  return { dot, laid: engine.marks(routedSource(dot, 'direct')) };
}

/** Each thing's box, by its key, as `[x, y]`. */
const spots = (laid) =>
  Object.fromEntries(laid.marks.filter((m) => m.kind === 'box' && m.role === 'thing').map((m) => [m.of, [m.x, m.y]]));

test('past 300 things no link runs over a box, and every box stays where Graphviz put it', () => {
  for (const way of ['LR', 'TB']) {
    const { dot, laid } = laidOut(500, way);
    const routed = directLinks(laid, undefined, undefined, way, true);
    assert.equal(readability(routed, way).clear, 1, `${way}: every link clear of the boxes`);
    // drawn direct, moving boxes off links no longer clears them at this size
    assert.ok(readability(directLinks(laid), way).clear < 0.9, `${way}: drawn direct, links run over boxes`);
    assert.deepEqual(spots(routed), spots(laid), `${way}: no box moved`);
    assert.equal(svgOf(engine, dot, undefined), layoutSvg(routed), `${way}: what a card draws`);
  }
});

test('up to 300 things links are drawn direct, as before', () => {
  const { dot, laid } = laidOut(60);
  assert.equal(svgOf(engine, dot, undefined), layoutSvg(directLinks(laid, undefined, undefined, 'LR')));
});

test('a link through the rows between its ends passes each through a gap, clear of the boxes', () => {
  // three rows across: the middle one has a box right in the way
  const a = box('a', 0, 0),
    b = box('b', 200, 5),
    wall = box('wall', 100, 0),
    beside = box('beside', 100, 60),
    c = box('c', 0, 60),
    d = box('d', 200, 60);
  const boxes = [a, b, wall, beside, c, d];
  assert.equal(rowsOf(boxes, 0).length, 3);
  assert.ok(inRows(boxes, 0));
  const [bends] = rowsRoute(boxes, [[a, b]], 0);
  // through the middle row straight, at one height, in the gap between the two boxes there
  const inMiddle = bends.filter(([x]) => x === 80 || x === 120);
  assert.equal(inMiddle.length, 2);
  assert.equal(inMiddle[0][1], inMiddle[1][1]);
  const y = inMiddle[0][1];
  assert.ok(y >= 10 + 6 && y <= 50 - 6, `in the gap below the box in the way, clear of both: ${y}`);
});

test('a link inside one row with a box between its ends loops out beside the row', () => {
  const a = box('a', 0, 0),
    mid = box('mid', 0, 40),
    b = box('b', 0, 80),
    next = box('next', 200, 40),
    other = box('other', 200, 80);
  const [loop] = rowsRoute([a, mid, b, next, other], [[a, b]], 0);
  assert.equal(loop.length, 3);
  // out past the row's edge, into the room before the next row, and back
  assert.ok(loop.every(([x]) => x >= 20));
  assert.ok(loop[1][0] > 20 && loop[1][0] < 180);
  const [none] = rowsRoute([a, mid, b, next, other], [[a, mid]], 0);
  assert.deepEqual(none, [], 'with nothing between, no bends');
});

test('links through one gap run side by side, in the order they come from, so they do not cross there', () => {
  const left = [box('l1', 0, 0), box('l2', 0, 30)],
    wall = [box('w1', 100, -100), box('w2', 100, 100)],
    right = [box('r1', 200, 0), box('r2', 200, 30)];
  const boxes = [...left, ...wall, ...right];
  const routes = rowsRoute(
    boxes,
    [
      [left[1], right[1]],
      [left[0], right[0]],
    ],
    0,
  );
  const at = routes.map((r) => r.find(([x]) => x === 80)[1]);
  assert.ok(at[1] < at[0], 'the upper link keeps above the lower one');
  assert.ok(at[0] - at[1] >= 6, 'kept apart');
});

test('a routed link meets its arrowhead running the drawing way', () => {
  const { laid } = laidOut(320);
  const routed = directLinks(laid, undefined, undefined, 'LR', true);
  const lines = new Map(routed.marks.filter((m) => m.kind === 'link' && m.curve).map((m) => [m.of, m]));
  let checked = 0;
  for (const h of routed.marks.filter((m) => m.kind === 'arrowhead')) {
    const line = lines.get(h.of);
    // a routed link has a piece for each bend; one drawn direct, a single piece
    if (!line || line.points.length <= 4) continue;
    const end = line.points[line.points.length - 1];
    assert.ok(Math.abs(end[1] - h.y) < 0.01, `${h.of}: level with its tip`);
    assert.ok(Math.abs(Math.abs(end[0] - h.x) - h.size) < 0.5, `${h.of}: stops where the arrowhead begins`);
    checked++;
  }
  assert.ok(checked > 300);
});
