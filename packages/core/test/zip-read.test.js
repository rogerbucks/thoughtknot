// A zip file read in plain JavaScript (ES§63 connector_files_to_gql, ES§67 format_untrusted_files): the way into an
// .xlsx workbook. The zips are made by xlsx-fixture.js with node:zlib, so each is a real deflate stream.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Damaged, partText, TooBig, zipEntries } from '../src/zip-read.ts';
import { zip } from './xlsx-fixture.js';

const TEXT = 'The quick brown fox jumps over the lazy dog. '.repeat(200);

describe('zip_read: parts of a zip, stored or deflated', () => {
  for (const stored of [true, false])
    test(`a part is read back whole, ${stored ? 'stored' : 'deflated'}`, () => {
      const bytes = zip({ 'a/One.txt': TEXT, 'b.txt': 'é ü' }, { stored });
      const entries = zipEntries(bytes);
      assert.deepEqual([...entries.keys()], ['a/one.txt', 'b.txt'], 'names are looked up without case');
      assert.equal(partText(bytes, entries, 'A/ONE.txt', 1e6), TEXT);
      assert.equal(partText(bytes, entries, '/b.txt', 1e6), 'é ü');
      assert.equal(partText(bytes, entries, 'none.txt', 1e6), null);
    });

  test('a part declared over the most is not inflated, and a size that lies is damage', () => {
    const bytes = zip({ 'a.txt': TEXT });
    assert.throws(() => partText(bytes, zipEntries(bytes), 'a.txt', 100), TooBig);
    const lied = zip({ 'a.txt': TEXT }, { lie: -3 });
    assert.throws(() => partText(lied, zipEntries(lied), 'a.txt', 1e6), Damaged);
  });

  test('a file with no end record, or a cut one, is damage', () => {
    assert.throws(() => zipEntries(new Uint8Array(10)), Damaged);
    const bytes = zip({ 'a.txt': TEXT });
    assert.throws(() => zipEntries(bytes.subarray(0, bytes.length - 5)), Damaged);
  });
});

describe('zip_read: a big part is decoded in pieces without splitting a character', () => {
  test('text of two-, three- and four-byte characters across the piece edges reads back whole', () => {
    const text = 'é€😀x'.repeat(400_000);
    const bytes = zip({ 'a.txt': text }, { stored: true });
    assert.equal(partText(bytes, zipEntries(bytes), 'a.txt', 1e8), text);
  });
});
