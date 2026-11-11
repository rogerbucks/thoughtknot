// A table of a SQLite database after FROM (editor spec §63 connector_files_to_gql, connector_mapping_written; §67
// format_untrusted_files): `· FROM Data/shop.sqlite#customers`. It is read in plain JavaScript and broken into
// statements by the mapping written beside it, as a CSV file is. The files here are made by sql.js in the test.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { connect } from '../src/connectors.ts';
import { mappingPlace, mappingText } from '../src/csv-mapping.ts';
import { databasePlace, sourceOf } from '../src/sources.ts';

const PLACE = 'Data/shop.sqlite#customers';
let bytes;
before(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`create table customers (id text, name text, region text, spend real, logo blob);
    insert into customers values ('acme', 'Acme Ltd', 'North', 12.5, x'00'), ('bolt', 'Bolt', 'South', null, null);`);
  bytes = db.export();
  db.close();
});

const MAPPING = mappingText({
  place: PLACE,
  row: 'Customer',
  columns: [
    { column: 'id', as: 'key' },
    { column: 'name', as: 'name' },
    { column: 'region', as: 'dimension' },
    { column: 'spend', as: 'measure', unit: 'GBP' },
    { column: 'logo', as: 'skip' },
  ],
});

describe('connector_files_to_gql: a table of a SQLite database', () => {
  test('a block names file#table after FROM; a file with no table, or another ending, is no database place', () => {
    const s = sourceOf(`// graph: shop · FROM ${PLACE}`);
    assert.equal(s.kind, 'database');
    assert.equal(s.target, PLACE);
    assert.deepEqual(databasePlace('a/b.db#t'), { file: 'a/b.db', table: 't' });
    assert.equal(databasePlace('Data/shop.sqlite'), null);
    assert.equal(databasePlace('Data/notes.md#Heading'), null);
    assert.equal(mappingPlace(PLACE), 'Data/shop.customers.mapping.gql', 'each table has its own mapping');
    assert.equal(mappingPlace('Data/sales.csv'), 'Data/sales.mapping.gql', 'a CSV file keeps its own');
  });

  test('with no mapping, it gives nothing and proposes one; with the mapping, each row is a thing citing its row', () => {
    const source = sourceOf(`// graph: shop · FROM ${PLACE}`);
    const bare = connect(source, { found: PLACE, bytes });
    assert.deepEqual(bare.statements, []);
    assert.equal(bare.proposal.place, 'Data/shop.customers.mapping.gql');
    assert.match(bare.proposal.text, /one Customers for each row/);
    assert.match(bare.proposal.text, /name: 'id', as: 'key'/);
    const mapped = connect(source, { found: PLACE, bytes, mapping: MAPPING });
    assert.deepEqual(
      mapped.statements.map((s) => [s.text, s.cite.row]),
      [
        ["(customer_acme:Customer {name: 'Acme Ltd', id: 'acme', region: 'North', spend: 12.5})", 1],
        ["(customer_bolt:Customer {name: 'Bolt', id: 'bolt', region: 'South'})", 2],
      ],
    );
    assert.equal(mapped.version, connect(source, { found: PLACE, bytes, mapping: MAPPING }).version);
  });

  test('a table the file does not hold, or a file that is no database, is refused with why', () => {
    const missing = sourceOf('// graph: shop · FROM Data/shop.sqlite#orders');
    assert.match(connect(missing, { found: 'x', bytes }).refused, /The database has no table orders/);
    const text = new TextEncoder().encode('id,name\n1,a\n');
    assert.match(connect(missing, { found: 'x', bytes: text }).refused, /not a SQLite database/);
  });
});
