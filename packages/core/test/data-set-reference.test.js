// A short named reference to a data set, and pointers inside it (editor spec §52, data_set_reference). The note holds
// the reference, never the data.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readCsv } from '../src/csv-read.ts';
import { changedSince, dataSetsOf, pointedAt, pointerOf, pointerText } from '../src/data-set-reference.ts';
import { readNote } from '../src/drawing.ts';

const SALES = 'order_id,customer,amount\nA1,Ann,10\nA2,Bob,2.5\nA3,Ann,\n';
const table = readCsv('Data/sales.csv', SALES);
const MAPPING = {
  place: 'Data/sales.csv',
  row: 'Sale',
  columns: [
    { column: 'order_id', as: 'key' },
    { column: 'customer', as: 'dimension' },
    { column: 'amount', as: 'measure' },
  ],
};
const at = (text) => pointedAt(table, MAPPING, pointerOf(text));

describe('data_set_reference', () => {
  test('a graph names a data set by a DataSet thing: its place and its version, and the note holds no rows', () => {
    const note = `// graph: g
(sales:DataSet {place: 'Data/sales.csv', version: 'v1'})
(report:Note {name: 'Q3'})
(report)-[:USES]->(sales)`;
    const graph = readNote([note]).world['g'];
    assert.deepEqual(dataSetsOf(graph), [{ id: 'sales', place: 'Data/sales.csv', version: 'v1' }]);
    assert.ok(!note.includes('Ann'), 'the note holds the reference, not the data');
  });

  test('a pointer names a row, a key, a column, a cell or a measure, and reads back to its text', () => {
    for (const text of [
      'Data/sales.csv#row=2',
      'Data/sales.csv#key=A2',
      'Data/sales.csv#col=amount',
      'Data/sales.csv#row=2&col=amount',
      'Data/sales.csv#key=A1&col=customer',
      'Data/sales.csv#measure=amount',
      'Data/daily sales.csv#col=unit%20price',
    ])
      assert.equal(pointerText(pointerOf(text)), text, text);
    for (const bad of ['Data/sales.csv', '#row=1', 'Data/sales.csv#row=0', 'Data/sales.csv#row=1&key=A1', 'x.csv#y=1'])
      assert.equal(pointerOf(bad), null, bad);
  });

  test('a pointer reaches its cell, row, column or measure in the table', () => {
    assert.deepEqual(at('Data/sales.csv#row=2&col=amount'), { kind: 'cell', value: '2.5', row: 2, col: 'amount' });
    assert.deepEqual(at('Data/sales.csv#key=A1&col=customer'), { kind: 'cell', value: 'Ann', row: 1, col: 'customer' });
    assert.deepEqual(at('Data/sales.csv#key=A3'), {
      kind: 'row',
      value: { order_id: 'A3', customer: 'Ann', amount: '' },
      row: 3,
    });
    assert.deepEqual(at('Data/sales.csv#col=customer'), {
      kind: 'column',
      value: ['Ann', 'Bob', 'Ann'],
      col: 'customer',
    });
    assert.deepEqual(at('Data/sales.csv#measure=amount'), { kind: 'measure', value: 12.5, col: 'amount' });
  });

  test('a pointer that reaches nothing says why, never a blank', () => {
    assert.match(at('Data/sales.csv#row=9'), /has no row 9/);
    assert.match(at('Data/sales.csv#key=Z9'), /has no row Z9/);
    assert.match(at('Data/sales.csv#col=price'), /has no column price/);
    assert.match(at('Data/sales.csv#measure=customer'), /has no measure customer.*as: measure/);
  });

  test('a data set changed since the version its reference names says so', () => {
    assert.equal(changedSince({ id: 'sales', place: 'Data/sales.csv', version: 'v1' }, 'v1'), null);
    assert.equal(changedSince({ id: 'sales', place: 'Data/sales.csv' }, 'v2'), null);
    assert.match(changedSince({ id: 'sales', place: 'Data/sales.csv', version: 'v1' }, 'v2'), /changed since sales/);
  });
});
