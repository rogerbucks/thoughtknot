// A table's measures are read by the same code as a graph's (editor spec §57, calc_measures_shared).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proposeMapping } from '../src/csv-mapping.ts';
import { readCsv } from '../src/csv-read.ts';
import { tableMeasures } from '../src/csv-measures.ts';
import { measuresOf } from '../src/measures.ts';
import { FacetIndex } from '../src/facet-counts.ts';
import { facetTotals } from '../src/facet-totals.ts';

const CSV = `order_id,name,region,amount
A1,First,North,12.5
A2,Second,South,8
A3,Third,North,
A4,Fourth,South,n/a`;

// proves: calc_measures_shared
test('a column of a data set and a calculated value are totalled by the same code, gaps said and never zero', async () => {
  const table = readCsv('Data/sales.csv', CSV);
  const mapping = proposeMapping('Data/sales.csv', table);
  // gaps keep the proposal from calling the column a measure, so the person says it is one
  for (const c of mapping.columns) if (c.column === 'amount') c.as = 'measure';
  const [amount] = tableMeasures(table, mapping);
  assert.equal(amount.name, 'amount');
  assert.deepEqual(amount.values, [12.5, 8, null, null]);
  const rows = new FacetIndex(['r0', 'r1', 'r2', 'r3'], [{ name: 'region', values: table.rows.map((r) => r[2]) }]);
  const fromTable = facetTotals(rows, {}, amount);
  assert.deepEqual(fromTable.kept, { total: 20.5, counted: 2, missing: 2 });
  assert.deepEqual(
    fromTable.facets.get('region')?.map((f) => [f.value, f.total, f.missing]),
    [
      ['North', 12.5, 1],
      ['South', 8, 1],
    ],
  );

  // a calculated total over things comes out in the same shape, from the same function
  const gs = (await import('@thoughtknot/graph-spec')).default;
  const node = (id, labels, props) => [id, [new Set(labels), { id, ...props }]];
  const g = new gs.Graph(
    new Map([
      node('c', ['Calculated'], { of: 'Task', name: 'cost', is: 'hours * 10', unit: 'USD' }),
      node('t1', ['Task'], { hours: 2 }),
      node('t2', ['Task'], { hours: 5 }),
      node('t3', ['Task'], {}),
    ]),
    [],
  );
  const [cost] = measuresOf(g, ['t1', 't2', 't3']);
  const things = new FacetIndex(['t1', 't2', 't3'], [{ name: 'Kind', values: ['Task', 'Task', 'Task'] }]);
  const fromThings = facetTotals(things, {}, cost);
  assert.deepEqual(Object.keys(fromThings.kept), Object.keys(fromTable.kept));
  assert.deepEqual(fromThings.kept, { total: 70, counted: 2, missing: 1 });
});

test('a table with no measure column gives none, and a measure keeps its unit', () => {
  const none = readCsv('Data/x.csv', 'a,b\nx,y');
  assert.deepEqual(tableMeasures(none, { place: 'Data/x.csv', row: 'X', columns: [] }), []);
  const table = readCsv('Data/p.csv', 'id,price\n1,3\n2,4');
  const m = tableMeasures(table, {
    place: 'Data/p.csv',
    row: 'P',
    columns: [
      { column: 'id', as: 'key' },
      { column: 'price', as: 'measure', unit: 'GBP' },
    ],
  });
  assert.deepEqual(m, [{ name: 'price', unit: 'GBP', values: [3, 4] }]);
});
