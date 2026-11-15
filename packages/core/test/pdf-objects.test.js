// The objects of a PDF read in plain JavaScript (ES§63 connector_files_to_gql, ES§67 format_untrusted_files): values,
// references, strings, scanned objects, and streams. The files are made by pdf-fixture.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseValue, readObjects, resolve, streamText, latin1 } from '../src/pdf-objects.ts';
import { pdf } from './pdf-fixture.js';

const value = (s) => parseValue(s, 0)?.[0];

describe('pdf_objects_values', () => {
  test('reads numbers, names with escapes, booleans, null and keywords', () => {
    assert.equal(value('  -12.5 '), -12.5);
    assert.deepEqual(value('/A#20B'), { n: 'A B' });
    assert.equal(value('true'), true);
    assert.equal(value('null'), null);
    assert.deepEqual(value('Tj'), { op: 'Tj' });
  });

  test('reads literal strings with escapes, octal codes, nesting and a line continuation', () => {
    assert.deepEqual(value('(a\\(b\\) (c) \\101\\n)'), { s: 'a(b) (c) A\n' });
    assert.deepEqual(value('(x\\\ny)'), { s: 'xy' });
    assert.deepEqual(value('<48 65 6C6c 6F>'), { s: 'Hello' });
  });

  test('reads arrays, dictionaries and references, and skips comments', () => {
    const got = value('<< /Kids [1 0 R 2 0 R 3] % note\n /N 2 /Name /X >>');
    assert.deepEqual(got.get('Kids'), [{ r: 1 }, { r: 2 }, 3]);
    assert.equal(got.get('N'), 2);
  });

  test('refuses nesting too deep, an unterminated string and a dictionary key that is no name', () => {
    assert.throws(() => value('['.repeat(40)));
    assert.throws(() => value('(open'));
    assert.throws(() => value('<< 1 2 >>'));
  });
});

describe('pdf_objects_file', () => {
  test('finds every object by scanning, and unpacks an object stream', () => {
    const f = readObjects(pdf([['a']], { objstm: true }));
    const root = [...f.objects.values()].find((v) => v instanceof Map && v.get('Type')?.n === 'Catalog');
    assert.ok(root, 'the catalog was packed in an object stream and is found');
    assert.ok(resolve(f, root.get('Pages')) instanceof Map);
  });

  test('a stream is inflated, stored text is kept, and a form this reader does not read is null', () => {
    for (const flate of [true, false]) {
      const f = readObjects(pdf([['hello']], { flate }));
      const texts = [...f.streams.keys()].map((n) => streamText(f, n));
      assert.ok(
        texts.some((t) => t?.includes('(hello) Tj')),
        `flate ${flate}`,
      );
    }
    const odd = new TextEncoder().encode(
      '%PDF-1.4\n1 0 obj\n<< /Filter /LZWDecode /Length 2 >>\nstream\nxx\nendstream\nendobj\n',
    );
    const f = readObjects(odd);
    assert.equal(streamText(f, 1), null);
  });

  test('a reference that loops resolves to null, not a hang', () => {
    const f = readObjects(new TextEncoder().encode('%PDF-1.4\n1 0 obj\n2 0 R\nendobj\n2 0 obj\n1 0 R\nendobj\n'));
    assert.equal(resolve(f, { r: 1 }), null);
  });

  test('the text of the bytes keeps every byte as one character', () => {
    assert.equal(latin1(new Uint8Array([0, 65, 255])), '\u0000Aÿ');
  });
});
