// A PDF read as pages of text in plain JavaScript (ES§63 connector_files_to_gql, ES§67 format_untrusted_files).
// The files are made by pdf-fixture.js: real PDFs with deflated streams and, as a modern writer does, object streams.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pdfPages } from '../src/pdf-read.ts';
import { inflateZlib } from '../src/zip-read.ts';
import { pdf } from './pdf-fixture.js';
import { deflateSync } from 'node:zlib';

const PAGES = [['Annual plan', 'Goals (and) costs', ['Grow ', -400, 'steadily', -20, ' now']], ['Second page']];

describe('pdf_read_pages', () => {
  for (const [name, options] of [
    ['deflated', {}],
    ['stored', { flate: false }],
    ['in an object stream', { objstm: true }],
  ]) {
    test(`reads each page's lines in order, ${name}`, () => {
      const got = pdfPages(pdf(PAGES, options));
      assert.deepEqual(
        got.pages.map((p) => p.number),
        [1, 2],
      );
      assert.equal(got.pages[0].text, 'Annual plan\nGoals (and) costs\nGrow steadily now');
      assert.equal(got.pages[1].text, 'Second page');
    });
  }

  test('a two-byte font is decoded by its ToUnicode map', () => {
    const got = pdfPages(pdf([['Hello world']], { twoByte: true }));
    assert.equal(got.pages[0].text, 'Hello world');
  });

  test('a password-protected PDF is named, and a file that is not a PDF is refused', () => {
    const locked = pdfPages(pdf(PAGES, { encrypt: true }));
    assert.equal(locked.why, 'encrypted');
    assert.match(locked.refused, /no password/);
    assert.equal(pdfPages(new Uint8Array([1, 2, 3])).why, 'not-pdf');
  });

  test('pages with no text say so, naming what the reader does', () => {
    const got = pdfPages(pdf(PAGES, { scanned: true }));
    assert.equal(got.why, 'no-text');
    assert.match(got.refused, /scanned/);
  });

  test('too many pages or too many bytes is refused', () => {
    assert.equal(pdfPages(pdf(PAGES), { pages: 1 }).why, 'too-many-pages');
    assert.equal(pdfPages(pdf(PAGES), { bytes: 100 }).why, 'too-large');
  });

  test('a page tree that points back at itself is damage, not a hang', () => {
    const bytes = new TextDecoder('latin1').decode(pdf(PAGES, { flate: false })).replace('/Kids [', '/Kids [2 0 R ');
    const got = pdfPages(new Uint8Array(Buffer.from(bytes, 'latin1')));
    assert.equal(got.why, 'damaged');
  });

  test('a stream named many times is counted each time, and past the total the file is too big', () => {
    const one = new TextDecoder('latin1').decode(pdf([['Again']], { flate: false }));
    const named = /\/Contents (\d+ 0 R)/.exec(one)[1];
    const bytes = new Uint8Array(
      Buffer.from(one.replace(`/Contents ${named}`, `/Contents [${`${named} `.repeat(3)}]`), 'latin1'),
    );
    assert.equal(pdfPages(bytes).pages[0].text, 'Again\n\nAgain\n\nAgain');
    const got = pdfPages(bytes, { total: 100 });
    assert.equal(got.why, 'too-large');
  });

  test('a font map that names more codes than a font can hold is read no further', () => {
    const one = new TextDecoder('latin1').decode(pdf([['Hello world']], { twoByte: true, flate: false }));
    const wide = one.replace('beginbfrange ', `beginbfrange ${'<0000> <FFFF> <0041> '.repeat(5)}`);
    assert.notEqual(wide, one);
    const got = pdfPages(new Uint8Array(Buffer.from(wide, 'latin1')));
    assert.notEqual(got.pages[0].text, 'Hello world');
  });

  test('a long run of spaces inside a line is read in step with its length', () => {
    const got = pdfPages(pdf([[`${' '.repeat(60_000)}x`, 'end  ']]));
    assert.equal(got.pages[0].text, `x\nend`);
  });

  test('a cut-off file is damage', () => {
    const whole = pdf(PAGES);
    assert.ok(pdfPages(whole.subarray(0, Math.floor(whole.length / 2))).why);
  });
});

describe('pdf_read_flate', () => {
  test('inflates a zlib stream of unknown size, and refuses one past its limit or with a bad header', () => {
    const text = Buffer.from('a'.repeat(5000));
    const z = new Uint8Array(deflateSync(text));
    assert.equal(Buffer.from(inflateZlib(z, 0, z.length, 1 << 20)).toString(), text.toString());
    assert.throws(() => inflateZlib(z, 0, z.length, 100));
    assert.throws(() => inflateZlib(new Uint8Array([0, 0, 0, 0]), 0, 4, 100));
  });
});
