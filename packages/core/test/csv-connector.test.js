// The connector for tables (editor spec §63, connector_files_to_gql; csv-connector.ts). It checks the ids a table's rows are given, the
// columns it skips or links, and a file it refuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tableConnector, tableStatements } from '../src/csv-connector.ts';
import { readCsv } from '../src/csv-read.ts';

const mapping = (columns) => ({ place: 'Data/t.csv', row: 'Row', columns });

test('a row is named by its key, and a row with no key, or one repeating a key, by its row', () => {
  const table = readCsv('Data/t.csv', 'k,v\nA b,1\n,2\nA b,3');
  const ids = tableStatements(table, mapping([{ column: 'k', as: 'key' }]), 'v1').map((s) => s.text.split(/[:\s]/)[0]);
  assert.deepEqual(ids, ['(row_A_b', '(row_row_2', '(row_A_b_row_3']);
});

test('a skipped column gives nothing, and a link with no type or kind is named by its column', () => {
  const table = readCsv('Data/t.csv', 'k,secret,owner\nA,x,Ann');
  const s = tableStatements(
    table,
    mapping([
      { column: 'k', as: 'key' },
      { column: 'secret', as: 'skip' },
      { column: 'owner', as: 'link' },
    ]),
    'v1',
  ).map((x) => x.text);
  assert.deepEqual(s, ["(row_A:Row {name: 'A', k: 'A'})", "(row_A)-[:OWNER]->(owner_Ann:Owner {name: 'Ann'})"]);
});

test('reads only tables, and a file over its limits is refused with the reason', () => {
  assert.deepEqual(tableConnector.kinds, ['table']);
  const source = { graph: 't', kind: 'table', target: 'Data/t.csv', block: 0 };
  const r = tableConnector.connect(source, { found: 'Data/t.csv', text: 'a\n"open' });
  assert.equal(r.why, 'unreadable');
  assert.match(r.refused, /never closed/);
});
