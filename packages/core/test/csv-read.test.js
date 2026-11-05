// A CSV file read as a table (editor spec §63 connector_files_to_gql, §67 format_untrusted_files): RFC 4180 cells,
// the line each row starts on, and a file over the limits refused with its reason, never read in part.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_LIMITS, readCsv } from '../src/csv-read.ts';

test('reads quoted cells holding commas, quotes and line breaks, and keeps the line each row starts on', () => {
  const t = readCsv('a.csv', '﻿id,note\r\n1,"one, two"\r\n2,"say ""hi"""\r\n3,"two\nlines"\r\n4,last\r\n');
  assert.deepEqual(t.header, ['id', 'note']);
  assert.deepEqual(t.rows, [
    ['1', 'one, two'],
    ['2', 'say "hi"'],
    ['3', 'two\nlines'],
    ['4', 'last'],
  ]);
  assert.deepEqual(t.lines, [2, 3, 4, 6]);
  assert.equal(t.delimiter, ',');
});

test('takes a semicolon or a tab between cells, and skips blank lines', () => {
  assert.deepEqual(readCsv('a.csv', 'a;b\n1;2,5\n\n3;4').rows, [
    ['1', '2,5'],
    ['3', '4'],
  ]);
  assert.equal(readCsv('a.csv', 'a\tb\n1\t2').delimiter, '\t');
});

test('lists rows with more cells than the header, so what is left out is said', () => {
  assert.deepEqual(readCsv('a.csv', 'a,b\n1,2,3\n4,5').uneven, [{ row: 0, extra: 1 }]);
});

test('refuses a file over a limit, naming it and the reason, never read in part', () => {
  const limits = { ...CSV_LIMITS, rows: 2, columns: 3, cell: 5, bytes: 100 };
  const cases = [
    ['x'.repeat(101), 'too-large'],
    ['a\n1\n2\n3', 'too-many-rows'],
    ['a,b,c,d\n1,2,3,4', 'too-many-columns'],
    ['a\n123456', 'cell-too-long'],
    ['a\n"open', 'unclosed-quote'],
    ['\n\n', 'no-header'],
    ['a\n\u0000', 'not-text'],
  ];
  for (const [text, why] of cases) {
    const r = readCsv('Data/x.csv', text, limits);
    assert.equal(r.why, why, why);
    assert.match(r.refused, /Data\/x\.csv/, why);
  }
});

test('a formula in a cell is only text: nothing is run', () => {
  assert.deepEqual(readCsv('a.csv', 'a\n=HYPERLINK("http://x")').rows, [['=HYPERLINK("http://x")']]);
});
