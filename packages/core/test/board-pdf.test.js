// A PDF of pictures, one to a page, written by our own code (editor spec ES§45, board_exchange). The test reads the
// file back as a PDF reader does: from the end, through the table of where each object starts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { picturesPdf } from '../src/board-pdf.ts';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const page = (width, height) => ({ jpeg: JPEG, pixels: { width: width * 2, height: height * 2 }, width, height });
const latin1 = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

/** Each object of the PDF by its number, found through the table at its end. */
function objects(pdf) {
  const text = latin1(pdf);
  const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)[1]);
  const table = text.slice(start).split('\n');
  assert.equal(table[0], 'xref');
  const count = Number(table[1].split(' ')[1]);
  const found = new Map();
  for (let n = 1; n < count; n++) {
    const at = Number(table[2 + n].slice(0, 10));
    assert.ok(text.startsWith(`${n} 0 obj\n`, at), `object ${n} starts where the table says`);
    found.set(n, text.slice(at, text.indexOf('endobj', at)));
  }
  return found;
}

describe('board_pdf', () => {
  // proves: board_exchange
  test('writes one page for each picture, at its natural size, with the picture kept as it was', () => {
    const pdf = picturesPdf([page(400, 200), page(100, 100)], 'Trip');
    assert.equal(latin1(pdf.slice(0, 8)), '%PDF-1.4');
    const found = objects(pdf);
    assert.equal(found.size, 9, 'three of its own and three for each page');
    assert.match(found.get(2), /\/Kids \[4 0 R 7 0 R\] \/Count 2/);
    assert.match(found.get(4), /\/MediaBox \[0 0 300 150\]/, '96 pixels to the inch');
    assert.match(found.get(7), /\/MediaBox \[0 0 75 75\]/);
    assert.match(found.get(5), /\/Width 800 \/Height 400 .*\/Filter \/DCTDecode \/Length 9 >>/);
    const at = latin1(pdf).indexOf('stream\n', latin1(pdf).indexOf('5 0 obj')) + 7;
    assert.deepEqual([...pdf.slice(at, at + 9)], [...JPEG], 'the bytes of the picture are kept');
    assert.match(found.get(6), /q 300 0 0 150 0 0 cm \/Im0 Do Q/);
  });

  // proves: board_exchange
  test('keeps a title in any language, and makes a page too large for a PDF smaller to fit', () => {
    const found = objects(picturesPdf([page(40_000, 10_000)], '東京 (plan)'));
    assert.match(found.get(3), /\/Title <FEFF67714EAC002000280070006C0061006E0029>/);
    assert.match(found.get(4), /\/MediaBox \[0 0 14400 3600\]/);
    assert.equal(objects(picturesPdf([], 'Empty')).size, 3);
  });
});
