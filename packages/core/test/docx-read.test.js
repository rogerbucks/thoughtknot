// A Word document (.docx) read as blocks of text in plain JavaScript (ES§63 connector_files_to_gql, ES§67
// format_untrusted_files). The files are made by docx-fixture.js: a real zip of the XML parts Word writes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { docxBlocks, DOCX_LIMITS } from '../src/docx-read.ts';
import { document } from './docx-fixture.js';
import { workbook } from './xlsx-fixture.js';

const DOC = [
  { style: 'Title', runs: ['Annual plan'] },
  { style: 'Heading1', runs: ['Goals'] },
  { runs: ['Grow ', { tab: 1 }, 'steadily', { br: 1 }, 'and safely. ', { del: 'Gone text.' }] },
  { list: true, runs: ['First <step> & more'] },
  { style: 'Heading2', runs: ['Costs'] },
  {
    table: [
      ['Item', 'Cost'],
      ['Rent', '12'],
    ],
  },
  { runs: [] },
  'The end',
];

describe('docx_read_blocks', () => {
  for (const stored of [false, true]) {
    test(`reads headings, paragraphs, list items and tables in order, ${stored ? 'stored' : 'deflated'}`, () => {
      const got = docxBlocks(document(DOC, { stored }));
      assert.deepEqual(got.blocks, [
        { kind: 'heading', level: 0, text: 'Annual plan' },
        { kind: 'heading', level: 1, text: 'Goals' },
        { kind: 'paragraph', text: 'Grow \tsteadily\nand safely.' },
        { kind: 'list', text: 'First <step> & more' },
        { kind: 'heading', level: 2, text: 'Costs' },
        {
          kind: 'table',
          rows: [
            ['Item', 'Cost'],
            ['Rent', '12'],
          ],
        },
        { kind: 'paragraph', text: 'The end' },
      ]);
    });
  }

  test('text a tracked change deleted is left out, and an empty paragraph is no block', () => {
    const got = docxBlocks(document([{ runs: [{ del: 'old' }] }, 'kept']));
    assert.deepEqual(got.blocks, [{ kind: 'paragraph', text: 'kept' }]);
  });

  test('a file that is not a document is refused with a sentence', () => {
    for (const bytes of [new Uint8Array([1, 2, 3]), workbook({ A: [['x']] })]) {
      const got = docxBlocks(bytes);
      assert.equal(got.why, 'not-docx');
      assert.match(got.refused, /not a Word document/);
    }
  });

  test('an old Word file (.doc) and an encrypted one are named, not called damaged', () => {
    const ole = new Uint8Array(600);
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const got = docxBlocks(ole);
    assert.equal(got.why, 'old-or-encrypted');
    assert.match(got.refused, /Save it as .docx/);
  });

  test('a document type line, a lying size and a part over the limit are refused', () => {
    const doc = document(['x']);
    assert.equal(docxBlocks(doc, { part: 10 }).why, 'too-large');
    assert.equal(docxBlocks(document(['x'], { lie: 5 })).why, 'damaged');
    const bomb = document(['x'], {
      extra: { 'word/document.xml': '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><w:document/>' },
    });
    assert.equal(docxBlocks(bomb).why, 'damaged');
  });

  test('too many blocks or a block too long is refused, naming the limit', () => {
    const many = document(Array.from({ length: DOCX_LIMITS.blocks + 1 }, () => 'a'));
    assert.equal(docxBlocks(many).why, 'too-many-blocks');
    const long = document(['a'.repeat(DOCX_LIMITS.text + 1)]);
    const got = docxBlocks(long);
    assert.equal(got.why, 'block-too-long');
    assert.match(got.refused, new RegExp(String(DOCX_LIMITS.text)));
  });

  test('a long run of spaces inside a paragraph is read in step with its length', () => {
    const got = docxBlocks(document([`a${' \n'.repeat(40_000)}b  `]));
    assert.equal(got.blocks[0].text, `a${' \n'.repeat(40_000)}b`);
  });

  test('a table keeps its shape: a short row stays short and a cell holds its paragraphs', () => {
    const got = docxBlocks(document([{ table: [['a'], ['b', 'c']] }]));
    assert.deepEqual(got.blocks, [{ kind: 'table', rows: [['a'], ['b', 'c']] }]);
  });
});
