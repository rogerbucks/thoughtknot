// The table view with calculated columns and totals (editor spec §57, table_view, calc_measures_shared).
// - A calculated value is a column of the table, beside the properties, worked out for each thing.
// - A number column is totalled under itself, over the rows kept; a thing with no number is said, never counted as zero.
// - The totals are read by the same code as a filter's (facet-totals.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { tableOf } from '../../src/types-table.ts';
import { tableTotals, totalSaid } from '../../src/table-totals.ts';

const node = (id, labels, props) => [id, [new Set(labels), { id, ...props }]];
const graph = (nodes, edges = []) => new gs.Graph(new Map(nodes), edges);
const TASKS = [
  node('a', ['Task'], { name: 'Dig', hours: 2, rate: 10 }),
  node('b', ['Task'], { name: 'Lay', hours: 3, rate: 20 }),
  node('c', ['Task'], { name: 'Wait', hours: 4 }),
  node('d', ['Calculated'], { of: 'Task', name: 'cost', is: 'hours * rate', unit: 'USD' }),
];
const drawing = (g) => ({
  boxes: ['a', 'b', 'c'].map((key) => ({ key, kind: 'Task', text: g.p(key).name })),
  links: [],
});
const column = (t, name) => t.columns.indexOf(name);

test('a calculated value is a column, worked out for each thing, with its unit', () => {
  const g = graph(TASKS);
  const t = tableOf(drawing(g), g);
  assert.ok(column(t, 'cost') > column(t, 'rate'), 'after the properties');
  assert.deepEqual(t.calculated, ['cost']);
  assert.equal(t.rows[0].cells[column(t, 'cost')], '20 USD');
  assert.equal(t.rows[1].cells[column(t, 'cost')], '60 USD');
  assert.equal(t.rows[2].cells[column(t, 'cost')], '', 'no rate, so no cost: a gap, not zero');
});

test('a table with no calculated value is as it was', () => {
  const g = graph(TASKS.slice(0, 3));
  const t = tableOf(drawing(g), g);
  assert.deepEqual(t.calculated, []);
  assert.deepEqual(t.columns, ['Thing', 'Kind', 'hours', 'rate']);
});

test('each number column is totalled over the rows kept, and the things with none are counted', () => {
  const g = graph(TASKS);
  const t = tableOf(drawing(g), g);
  const all = tableTotals(t);
  assert.equal(all[column(t, 'Thing')], null, 'text is not totalled');
  assert.deepEqual(all[column(t, 'hours')], { total: 9, counted: 3, missing: 0 });
  assert.deepEqual(all[column(t, 'rate')], { total: 30, counted: 2, missing: 1 });
  assert.deepEqual(all[column(t, 'cost')], { total: 80, counted: 2, missing: 1 });
  const kept = tableTotals(t, (row) => row.key !== 'b');
  assert.deepEqual(kept[column(t, 'hours')], { total: 6, counted: 2, missing: 0 });
  assert.deepEqual(kept[column(t, 'cost')], { total: 20, counted: 1, missing: 1 });
});

test('a thing of a kind that carries no number in a column is not said to have none', () => {
  const g = graph(TASKS);
  const t = tableOf({ ...drawing(g), boxes: [...drawing(g).boxes, { key: 'd', kind: 'Calculated', text: 'cost' }] }, g);
  assert.deepEqual(tableTotals(t)[column(t, 'hours')], { total: 9, counted: 3, missing: 0 });
  assert.deepEqual(tableTotals(t)[column(t, 'cost')], { total: 80, counted: 2, missing: 1 });
});

test('a total is said with its unit, and says how many had none', () => {
  const g = graph(TASKS);
  const t = tableOf(drawing(g), g);
  const all = tableTotals(t);
  assert.equal(totalSaid(all[column(t, 'cost')], 'USD'), '80 USD, 1 has none');
  assert.equal(totalSaid(all[column(t, 'hours')], ''), '9');
  assert.equal(totalSaid({ total: null, counted: 0, missing: 2 }, ''), 'no numbers, 2 have none');
});

test('10,000 rows are totalled in one pass', () => {
  const rows = Array.from({ length: 10_000 }, (_, i) => ({ key: `t${i}`, cells: [''], numbers: [i % 5 ? i : null] }));
  const t = { columns: ['n'], numeric: [true], calculated: [], units: [''], rows, links: [] };
  const [total] = tableTotals(t);
  assert.equal(total.counted + total.missing, 10_000);
  assert.equal(total.missing, 2000);
});
