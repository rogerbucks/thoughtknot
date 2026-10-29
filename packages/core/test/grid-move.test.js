// A card moved to another column of the grid view (editor spec §68, projection_grid): grid-move.ts. It lands in the
// column of the card nearest it across. Its property is written where the thing is written, or taken out in the
// column of things with no value. A grid by kinds, or a drop in its own column, moves nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridDrop, gridMoved } from '../src/view-types/grid-move.ts';

/** Things `[key, status]`, as a grid's shape; a status of null is none. */
const shapeOf = (things) => ({
  things: things.map(([key, status]) => ({
    key,
    text: key.toUpperCase(),
    kinds: ['Task'],
    ...(status ? { texts: new Map([['status', status]]) } : {}),
  })),
  links: [],
});
const board = shapeOf([
  ['a', 'todo'],
  ['b', 'todo'],
  ['c', 'doing'],
  ['d', null],
]);
/** Cards placed as the grid draws them: a column, 100 wide, for each of todo, doing and none. */
const at = { a: 0, b: 0, c: 1, d: 2 };
const boxes = Object.entries(at).map(([key, c], i) => ({
  key,
  left: c * 100 + 10,
  right: c * 100 + 90,
  top: i * 20,
  bottom: i * 20 + 15,
}));

// proves: projection_grid
test('a card let go lands in the column of the card nearest it across, or nowhere in its own column', () => {
  assert.deepEqual(gridDrop(board, 'a', { x: 140, y: 300 }, boxes), {
    by: 'status',
    value: 'doing',
    column: 'doing',
  });
  assert.deepEqual(gridDrop(board, 'c', { x: 260, y: 0 }, boxes), { by: 'status', value: null, column: '(none)' });
  assert.equal(gridDrop(board, 'a', { x: 60, y: 300 }, boxes), null, 'its own column moves nothing');
  const kinds = { things: board.things.map((t) => ({ ...t, texts: undefined })), links: [] };
  assert.equal(gridDrop(kinds, 'a', { x: 140, y: 0 }, boxes), null, 'a grid by kinds is not changed by a drag');
});

const DATA = `// graph: work
(a:Task {name: 'A', status: 'todo'}),
(c:Task {name: 'C', status: 'doing'}),
(d:Task {name: 'D'}),
(a)-[:BEFORE]->(c)`;
const STYLE = "// graph: work_style · STYLE work\n(d1:Diagram {type: 'thoughtknot.diagrams.grid'})";

// proves: projection_grid
test('the column is written as the property where the thing is written, and none takes it out', () => {
  const texts = [STYLE, DATA];
  const moved = gridMoved(texts, 'work', 'a', { by: 'status', value: 'doing' });
  assert.equal(moved.block, 1, 'the data block, not the style');
  assert.equal(moved.was, DATA);
  assert.equal(moved.now, DATA.replace("status: 'todo'", "status: 'doing'"));
  const added = gridMoved(texts, 'work', 'd', { by: 'status', value: 'done' });
  assert.match(added.now, /\(d:Task \{name: 'D', status: 'done'\}\)/);
  const out = gridMoved(texts, 'work', 'c', { by: 'status', value: null });
  assert.match(out.now, /\(c:Task \{name: 'C'\}\)/);
  assert.ok('reason' in gridMoved(texts, 'other', 'a', { by: 'status', value: 'doing' }), 'another graph: why not');
});
