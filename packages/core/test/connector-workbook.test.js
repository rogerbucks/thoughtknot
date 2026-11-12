// A sheet of an Excel workbook after FROM (ES§63 connector_files_to_gql, connector_mapping_written; ES§67
// format_untrusted_files): `· FROM Data/book.xlsx#Sales`. It is read in plain JavaScript and broken into statements by
// the mapping written beside it, as a CSV file is.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../src/connectors.ts';
import { mappingPlace, mappingText } from '../src/csv-mapping.ts';
import { sourceOf, workbookPlace } from '../src/sources.ts';
import { workbook } from './xlsx-fixture.js';

const PLACE = 'Data/book.xlsx#Customers';
const bytes = workbook({
  Customers: [
    ['id', 'Name', 'Region', 'Spend'],
    ['acme', 'Acme Ltd', 'North', 12.5],
    ['bolt', 'Bolt', 'South', null],
  ],
});

const MAPPING = mappingText({
  place: PLACE,
  row: 'Customer',
  columns: [
    { column: 'id', as: 'key' },
    { column: 'Name', as: 'name' },
    { column: 'Region', as: 'dimension' },
    { column: 'Spend', as: 'measure', unit: 'GBP' },
  ],
});

describe('connector_files_to_gql: a sheet of an Excel workbook', () => {
  test('a block names file#sheet after FROM; a file with no sheet, or another ending, is no workbook place', () => {
    const s = sourceOf(`// graph: shop · FROM ${PLACE}`);
    assert.equal(s.kind, 'workbook');
    assert.equal(s.target, PLACE);
    assert.deepEqual(workbookPlace('a/b.XLSX#Q1 Sales'), { file: 'a/b.XLSX', sheet: 'Q1 Sales' });
    assert.equal(workbookPlace('Data/book.xlsx'), null);
    assert.equal(workbookPlace('Data/notes.md#Heading'), null);
    assert.equal(mappingPlace(PLACE), 'Data/book.Customers.mapping.gql', 'each sheet has its own mapping');
    assert.equal(sourceOf('// graph: g · FROM Data/book.xlsx').kind, undefined, 'a workbook with no sheet is a fault');
  });

  test('with no mapping, it gives nothing and proposes one; with the mapping, each row is a thing citing its row', () => {
    const source = sourceOf(`// graph: shop · FROM ${PLACE}`);
    const bare = connect(source, { found: PLACE, bytes });
    assert.deepEqual(bare.statements, []);
    assert.equal(bare.proposal.place, 'Data/book.Customers.mapping.gql');
    assert.match(bare.proposal.text, /one Customers for each row/);
    const mapped = connect(source, { found: PLACE, bytes, mapping: MAPPING });
    assert.deepEqual(
      mapped.statements.map((s) => [s.text, s.cite.row, s.cite.line]),
      [
        ["(customer_acme:Customer {name: 'Acme Ltd', id: 'acme', Region: 'North', Spend: 12.5})", 1, 2],
        ["(customer_bolt:Customer {name: 'Bolt', id: 'bolt', Region: 'South'})", 2, 3],
      ],
    );
    assert.equal(mapped.version, connect(source, { found: PLACE, bytes, mapping: MAPPING }).version);
  });

  test('a sheet the workbook does not hold, or a file that is no workbook, is refused with why', () => {
    const missing = sourceOf('// graph: shop · FROM Data/book.xlsx#Orders');
    assert.match(connect(missing, { found: 'x', bytes }).refused, /The workbook has no sheet Orders/);
    const text = new TextEncoder().encode('id,name\n1,a\n');
    assert.match(connect(missing, { found: 'x', bytes: text }).refused, /not an Excel workbook/);
  });
});
