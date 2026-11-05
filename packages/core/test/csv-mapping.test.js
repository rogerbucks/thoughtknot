// How a table's columns become things, links and properties (editor spec §63, connector_mapping_written). A mapping is
// proposed on the first read, written as graph data beside the table, and read back exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { kindOf, mappingOf, mappingPlace, mappingText, nameOf, proposeMapping } from '../src/csv-mapping.ts';
import { readCsv } from '../src/csv-read.ts';

const CSV = `order_id,name,region,amount,customer
A1,First,North,12.5,Acme
A2,Second,South,8,Bolt
A3,Third,North,3,Acme
A4,Fourth,South,1,Core
A5,Fifth,North,2,Dune`;

test('names and kinds GQL reads, made from headers and file names', () => {
  assert.equal(nameOf('Order ID'), 'Order_ID');
  assert.equal(nameOf('2025 total'), '_2025_total');
  assert.equal(kindOf('Data/daily sales.csv'), 'DailySales');
  assert.equal(mappingPlace('Data/sales.csv'), 'Data/sales.mapping.gql');
});

test('a first read proposes a key, a name, measures, dimensions and properties, and never a link', () => {
  const m = proposeMapping('Data/sales.csv', readCsv('Data/sales.csv', CSV));
  assert.equal(m.row, 'Sales');
  assert.deepEqual(
    m.columns.map((c) => `${c.column}:${c.as}`),
    ['order_id:key', 'name:name', 'region:dimension', 'amount:measure', 'customer:property'],
  );
});

test('a mapping written as graph data reads back exactly, links and units too', () => {
  const m = {
    place: 'Data/sales.csv',
    row: 'Sale',
    columns: [
      { column: 'order_id', as: 'key' },
      { column: 'amount', as: 'measure', unit: 'GBP' },
      { column: 'customer', as: 'link', type: 'BOUGHT_BY', to: 'Customer' },
    ],
  };
  const text = mappingText(m);
  const graph = readNote([text]).world['mapping'];
  assert.deepEqual(mappingOf(graph, 'Data/sales.csv'), m);
  assert.equal(mappingOf(graph, 'Data/other.csv'), null);
});
