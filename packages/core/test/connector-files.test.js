// Files other than GQL broken into statements (editor spec §63, CN2). A CSV table is read by the mapping written beside
// it. Each statement cites its row, and a link its column. Excel, SQLite and text follow (Roger, D1: CSV first).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { connect, joinPlaces } from '../src/connectors.ts';
import { mappingText, proposeMapping } from '../src/csv-mapping.ts';
import { readCsv } from '../src/csv-read.ts';
import { sourceOf } from '../src/sources.ts';

const PLACE = 'Data/sales.csv';
const CSV = 'order_id,amount,region,customer\r\nA1,12.5,North,Acme Ltd\r\nA2,8,South,Bolt\r\nA3,,North,Acme Ltd\r\n';
const MAPPING = mappingText({
  place: PLACE,
  row: 'Sale',
  columns: [
    { column: 'order_id', as: 'key' },
    { column: 'amount', as: 'measure', unit: 'GBP' },
    { column: 'region', as: 'dimension' },
    { column: 'customer', as: 'link', type: 'BOUGHT_BY', to: 'Customer' },
  ],
});
const source = sourceOf(`// graph: sales · FROM ${PLACE}`);
const fetched = (mapping) => ({ found: PLACE, text: CSV, ...(mapping ? { mapping } : {}) });

describe('connector_files_to_gql', () => {
  test('a block names a .csv table after FROM, and holds nothing of its own', () => {
    assert.equal(source.kind, 'table');
    assert.equal(source.target, PLACE);
    assert.ok('fault' in sourceOf(`// graph: sales · FROM ${PLACE}\n(a:Sale)`));
  });

  test('a CSV breaks into a statement per row and per link, each citing its row, and a link its column', () => {
    const c = connect(source, fetched(MAPPING));
    assert.deepEqual(
      c.statements.map((s) => s.text),
      [
        "(sale_A1:Sale {name: 'A1', order_id: 'A1', amount: 12.5, region: 'North'})",
        "(sale_A1)-[:BOUGHT_BY]->(customer_Acme_Ltd:Customer {name: 'Acme Ltd'})",
        "(sale_A2:Sale {name: 'A2', order_id: 'A2', amount: 8, region: 'South'})",
        "(sale_A2)-[:BOUGHT_BY]->(customer_Bolt:Customer {name: 'Bolt'})",
        "(sale_A3:Sale {name: 'A3', order_id: 'A3', region: 'North'})",
        "(sale_A3)-[:BOUGHT_BY]->(customer_Acme_Ltd:Customer {name: 'Acme Ltd'})",
      ],
    );
    assert.deepEqual(
      c.statements.map((s) => [s.cite.row, s.cite.line, s.cite.column]),
      [
        [1, 2, undefined],
        [1, 2, 'customer'],
        [2, 3, undefined],
        [2, 3, 'customer'],
        [3, 4, undefined],
        [3, 4, 'customer'],
      ],
    );
  });

  test('the joined graph cites each thing by its row, and two rows naming one customer give one thing', () => {
    const r = joinPlaces('sales', [connect(source, fetched(MAPPING))]);
    const keys = r.reading.graphs.get('sales').boxes.map((b) => b.key);
    assert.deepEqual(keys.sort(), ['customer_Acme_Ltd', 'customer_Bolt', 'sale_A1', 'sale_A2', 'sale_A3']);
    assert.match(r.cites.get('sale_A2')[0].place, /sales\.csv/);
    assert.equal(r.cites.get('sale_A2')[0].row, 2);
  });
});

describe('connector_mapping_written', () => {
  test('a first read proposes a mapping and draws nothing until a person saves it', () => {
    const c = connect(source, fetched());
    assert.deepEqual(c.statements, []);
    assert.equal(c.proposal.place, 'Data/sales.mapping.gql');
    assert.equal(c.proposal.text, mappingText(proposeMapping(PLACE, readCsv(PLACE, CSV))));
    assert.match(c.note, /no mapping yet/);
  });

  test('a later read uses the written mapping exactly, never a guess', () => {
    const proposed = connect(source, fetched()).proposal.text;
    const changed = proposed.replace("as: 'measure'", "as: 'skip'");
    const c = connect(source, fetched(changed));
    assert.equal(c.proposal, undefined);
    assert.ok(c.statements.every((s) => !s.text.includes('amount')));
  });
});

describe('connector_derived_kept_apart', () => {
  test('the same file and mapping always give the same statements, and the note holds only the FROM line', () => {
    const a = connect(source, fetched(MAPPING));
    const b = connect(source, fetched(MAPPING));
    assert.deepEqual(a.statements, b.statements);
    assert.equal(a.version, b.version);
    assert.equal(a.read.texts.length, 1);
  });
});
