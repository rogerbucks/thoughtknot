// The grid view (editor spec §68, projection_grid): grid-view.ts. Things are cards in columns by the property most
// carry, such as status, and in rows by kind. A property no two things share never makes columns. With none, the
// columns are the kinds. Every mark stays inside the space.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridMarks, gridProperty, gridSplit } from '../src/view-types/grid-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';
import { VIEW_DRAWERS, VIEW_TYPES } from '../src/view-types/view-types.ts';
import { readNote } from '../src/drawing.ts';
import { shapeOf as shapeOfDrawing } from '../src/types-shape.ts';

const SPACE = { width: 600, height: 400 };
/** A shape of things `[key, kind, {property: word}]`. */
const shapeOf = (things) => ({
  things: things.map(([key, kind, words]) => ({
    key,
    text: key.toUpperCase(),
    kinds: [kind],
    ...(words ? { texts: new Map(Object.entries(words)) } : {}),
  })),
  links: [],
});
const board = shapeOf([
  ['d', 'Task', { status: 'Done', note: 'fourth' }],
  ['a', 'Task', { status: 'todo', note: 'first' }],
  ['c', 'Task', { status: 'todo', note: 'third' }],
  ['b', 'Bug', { status: 'doing', note: 'second' }],
  ['e', 'Bug'],
]);

// proves: projection_grid
test('things are cards in a column per status, todo to done, and a row per kind, unsorted things last', () => {
  assert.equal(gridProperty(board), 'status', 'a note no two share never makes columns');
  const { by, columns, rows, cell } = gridSplit(board);
  assert.equal(by, 'status');
  assert.deepEqual(columns, ['todo', 'doing', 'Done', '(none)'], 'the steps of work in order, whatever was first');
  assert.deepEqual(rows, ['Task', 'Bug']);
  assert.deepEqual(cell.get('c'), [0, 0]);
  assert.deepEqual(cell.get('e'), [3, 1]);
  const marks = gridMarks({ shape: board, space: SPACE });
  const box = (k) => marks.find((m) => m.id === k);
  assert.equal(box('a').x, box('c').x, 'one column');
  assert.ok(box('c').y > box('a').y, 'stacked in the order written');
  assert.ok(box('b').y > box('a').y, 'a later row lower');
  assert.ok(box('b').x > box('a').x && box('d').x > box('b').x, 'todo, doing, done from left to right');
  const columnMarks = marks.filter((m) => m.kind === 'group');
  assert.deepEqual(
    columnMarks.map((m) => m.name),
    ['status: todo', 'status: doing', 'status: Done', 'status: (none)'],
  );
  assert.ok(Array.isArray(drawMarksOf(marks, SPACE)));
});

// proves: projection_grid
test('with no shared property the columns are the kinds, and a full column shrinks its cards to fit', () => {
  const plain = shapeOf([...Array(40).keys()].map((i) => [`t${i}`, i % 4 ? 'Task' : 'Bug']));
  const { by, columns, rows } = gridSplit(plain);
  assert.equal(by, null);
  assert.deepEqual(columns, ['Bug', 'Task']);
  assert.deepEqual(rows, ['']);
  const marks = gridMarks({ shape: plain, space: SPACE });
  assert.ok(Array.isArray(drawMarksOf(marks, SPACE)), 'inside the space');
  assert.ok(marks.every((m) => m.kind !== 'box' || m.y + m.height <= SPACE.height));
  assert.deepEqual(gridMarks({ shape: shapeOf([]), space: SPACE }), []);
});

// proves: projections_all_on
test('the hive and the grid are offered among the views, and the View menu draws each', () => {
  for (const view of ['hive', 'grid']) {
    assert.ok(VIEW_TYPES.includes(view), view);
    assert.ok(
      VIEW_DRAWERS[view]({ shape: board, space: SPACE }).some((m) => m.id === 'a'),
      view,
    );
  }
});

// proves: projection_grid
test('read from a note, the status each thing carries makes the columns, never its name', () => {
  const r = readNote([
    `// graph: work
(a:Task {name: 'Write', status: 'doing'}),
(b:Task {name: 'Test', status: 'todo'}),
(c:Task {name: 'Ship', status: 'todo'})`,
  ]);
  const [name, drawing] = [...r.graphs][0];
  const shape = shapeOfDrawing(drawing, r.world[name]);
  assert.equal(shape.things[0].texts?.get('status'), 'doing');
  assert.equal(shape.things[0].texts?.get('name'), 'Write');
  assert.deepEqual(gridSplit(shape).columns, ['todo', 'doing']);
});
