// Text packed the LZ-String way is unpacked by our own code (editor spec ES§45, board_exchange). The packed texts
// here were made by the LZ-String library itself, so the reader is checked against the real thing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { unpackedLz } from '../src/board-lz.ts';

// a small drawing, with letters beyond ASCII, packed by lz-string's compressToBase64
const PACKED =
  'N4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcmTGAWxkbBoQBtUHgQh8ZcNDiJ8MVGHSMA5p0nIEABnIQt5InjAALBAEZN2kEZjZlRsAgCslgEb0Aro1wBRTjz4C8MJSsGJgKA7koogOAL4AurGkIrhhkpChMRHqTjq5IAa4xk6W1rb2rI7k4cgOiADC6ABmAJcABIBJhG2AjuaANXKSqEyK2IzUAJKpsiAJsUA===';

describe('board_lz', () => {
  // proves: board_exchange
  test('unpacks what the library packed, with letters beyond ASCII, and passes over line breaks', () => {
    const drawing = JSON.parse(unpackedLz(PACKED, 10_000));
    assert.equal(drawing.type, 'excalidraw');
    assert.equal(drawing.elements[1].text, 'Café → 東京');
    const broken = PACKED.replace(/(.{40})/g, '$1\n\n');
    assert.equal(unpackedLz(broken, 10_000), unpackedLz(PACKED, 10_000));
    assert.equal(unpackedLz('Q===', 10), '', 'nothing packed is nothing');
    assert.equal(unpackedLz('IZA=', 10), 'a');
  });

  // proves: board_exchange
  test('unpacks a long run of the same letters, where a word is used while it is being made', () => {
    // 'ab' five thousand times, packed by the library
    const packed =
      'IYI17SOrZ+6IcpqXrZj2u5/vQg4o0k8syi6q2m+uxh5p1l9tzj7r3n/voIHChokeLGSJ0qbJny5ihcqWqV6tZo3atunfr2GDxo6ZPmzli9au2b9u44fOnrl+7eeP3r75/+/QIDgoNCQ8LDIiOio2Jj4uMSE5KTUlPS0zIzsrNyc/LzCguKi0pLyssqK6qramvq6xobmptaW9rbOju6u3p7+vsGB4aHRkfGxyYmgA';
    assert.equal(unpackedLz(packed, 10_000), 'ab'.repeat(5000));
    assert.equal(unpackedLz(packed.slice(0, 60), 10_000), null, 'cut short, so refused');
  });

  // proves: board_exchange
  test('gives null for text that is not packed so, and for text that unpacks to more than is allowed', () => {
    assert.equal(unpackedLz('', 10), null);
    assert.equal(unpackedLz('not packed!', 10), null);
    assert.equal(unpackedLz(PACKED.slice(0, 50), 10_000), null, 'cut short');
    assert.equal(unpackedLz(PACKED, 100), null, 'over the most allowed');
  });
});
