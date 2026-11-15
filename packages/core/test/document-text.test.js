// A Word document or a PDF read as plain text (ES§63 connector_text_proposed, ES§67 format_untrusted_files). The files
// are made by docx-fixture.js and pdf-fixture.js: real zips and real PDFs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { documentText, isDocumentPlace } from '../src/document-text.ts';
import { document } from './docx-fixture.js';
import { pdf } from './pdf-fixture.js';

describe('document_text', () => {
  test('a Word document keeps its headings as marks, its list items and its table rows', () => {
    const bytes = document([
      { style: 'Heading1', runs: ['Goals'] },
      'Grow steadily.',
      { list: true, runs: ['Hire'] },
      {
        table: [
          ['Item', 'Cost'],
          ['Rent', '12'],
        ],
      },
    ]);
    assert.equal(
      documentText(bytes, 'Data/plan.docx').text,
      '# Goals\n\nGrow steadily.\n\n- Hire\n\nItem | Cost\nRent | 12',
    );
  });

  test('a PDF tells its pages apart by a line naming the page', () => {
    const got = documentText(pdf([['One'], ['Two', 'Three']]), 'Data/plan.PDF');
    assert.equal(got.text, '[page 1]\nOne\n\n[page 2]\nTwo\nThree');
  });

  test('a file that cannot be read gives its reason as a sentence, not text', () => {
    assert.match(documentText(new Uint8Array([1, 2, 3]), 'a.docx').refused, /not a Word document/);
    assert.match(documentText(pdf([['x']], { scanned: true }), 'a.pdf').refused, /scanned/);
  });

  test('only a .docx or .pdf place is a document, in any case', () => {
    for (const p of ['a.docx', 'b/C.PDF']) assert.equal(isDocumentPlace(p), true);
    for (const p of ['a.doc', 'a.docx.txt', 'a.md']) assert.equal(isDocumentPlace(p), false);
  });
});
