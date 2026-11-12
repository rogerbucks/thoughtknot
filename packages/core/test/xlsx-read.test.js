// An Excel workbook read as tables in plain JavaScript (ES§63 connector_files_to_gql, ES§67
// format_untrusted_files). The files are made by xlsx-fixture.js: a real zip of the XML parts Excel writes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { workbookSheets, workbookTable, WORKBOOK_LIMITS } from '../src/xlsx-read.ts';
import { workbook, zip } from './xlsx-fixture.js';

const SHOP = {
  Customers: [
    ['id', 'Name', 'Spend', 'Since'],
    ['acme', 'Acme & Sons <Ltd>', 12.5, { date: 45000 }],
    ['bolt', { inline: 'Bolt' }, 0.1 + 0.2, { date: 45000.5 }],
    [],
    ['cog', 'Cog', null, null, 'extra'],
  ],
  'Q1 Sales': [[], ['order', null, 'order', 'paid'], ['1', null, 'x', { bool: true }, { error: true }]],
  Empty: [[], []],
};

describe('xlsx_read_tables', () => {
  for (const stored of [false, true]) {
    test(`lists the sheets in order and reads one, ${stored ? 'stored' : 'deflated'}`, () => {
      const bytes = workbook(SHOP, { stored });
      assert.deepEqual(workbookSheets(bytes), ['Customers', 'Q1 Sales', 'Empty']);
      const t = workbookTable(bytes, 'Customers');
      assert.deepEqual(t.header, ['id', 'Name', 'Spend', 'Since']);
      assert.deepEqual(t.rows, [
        ['acme', 'Acme & Sons <Ltd>', '12.5', '2023-03-15'],
        ['bolt', 'Bolt', '0.3', '2023-03-15 12:00:00'],
        ['cog', 'Cog', '', '', 'extra'],
      ]);
      assert.deepEqual(t.lines, [2, 3, 5], 'each row cites the number it has in the sheet, empty rows skipped');
      assert.deepEqual(t.uneven, [{ row: 2, extra: 1 }], 'a cell past the header is kept and listed');
    });
  }

  test('a header with no name or a repeated one is named, the first row holding anything is the header', () => {
    const t = workbookTable(workbook(SHOP), 'Q1 Sales');
    assert.deepEqual(t.header, ['order', 'Column B', 'order 2', 'paid']);
    assert.deepEqual(t.rows, [['1', '', 'x', 'TRUE']], 'an error cell is nothing, and no extra cell');
    assert.deepEqual(t.lines, [3]);
  });

  test('the 1904 date system is read as such', () => {
    const t = workbookTable(workbook({ A: [['d'], [{ date: 1 }]] }, { date1904: true }), 'A');
    assert.deepEqual(t.rows, [['1904-01-02']]);
  });

  test('a sheet that is not there, or holds nothing, is said by name', () => {
    const bytes = workbook(SHOP);
    assert.match(workbookTable(bytes, 'Nope').refused, /no sheet Nope/);
    assert.match(workbookTable(bytes, 'Empty').refused, /sheet Empty holds nothing/);
  });
});

describe('xlsx_read_untrusted: a file that is no workbook, or is made to harm, is refused with why', () => {
  const text = new TextEncoder().encode('id,name\n1,a\n');
  test('not a zip, a zip with no workbook, and a cut file', () => {
    assert.match(workbookSheets(text).refused, /not an Excel workbook/);
    assert.match(workbookSheets(zip({ 'a.txt': 'hi' })).refused, /not an Excel workbook/);
    const good = workbook(SHOP);
    assert.match(workbookSheets(good.subarray(0, good.length - 40)).refused, /damaged/);
    assert.match(workbookSheets(new Uint8Array(0)).refused, /not an Excel workbook/);
  });

  test('a part that lies about its size is damaged, never read in part or past the size it declares', () => {
    const lied = zip({ 'xl/workbook.xml': '<workbook/>'.repeat(50) }, { lie: -5 });
    assert.match(workbookSheets(lied).refused, /damaged/);
    const bomb = zip({ 'xl/workbook.xml': 'x'.repeat(1000) }, { lie: -990 });
    assert.match(workbookSheets(bomb).refused, /damaged/);
  });

  test('a part declared over the limit is not inflated', () => {
    const huge = zip({ 'xl/workbook.xml': '<workbook/>' }, { lie: WORKBOOK_LIMITS.part });
    assert.match(workbookSheets(huge).refused, /larger than/);
  });

  test('a document type, which could expand into more than the file holds, is refused', () => {
    const parts = { 'xl/workbook.xml': '<!DOCTYPE x [<!ENTITY a "aaaa">]><workbook><sheets/></workbook>' };
    assert.match(workbookSheets(zip(parts)).refused, /damaged/);
  });

  test('more rows than the limit is refused whole, not read in part', () => {
    const rows = [['n'], ...Array.from({ length: WORKBOOK_LIMITS.rows + 1 }, (_, i) => [i])];
    assert.match(workbookTable(workbook({ Big: rows }), 'Big').refused, /more than 20000 rows/);
  });

  test('a cell longer than the limit is refused', () => {
    const rows = [['n'], ['x'.repeat(WORKBOOK_LIMITS.cell + 1)]];
    assert.match(workbookTable(workbook({ Wide: rows }), 'Wide').refused, /more than 10000 characters/);
  });
});
