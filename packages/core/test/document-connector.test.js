// A Word document or a PDF after FROM (ES§63 connector_text_proposed, connector_files_to_gql; ES§67
// format_untrusted_files): read as prose, never as fact, for a person to turn into a proposal.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../src/connectors.ts';
import { sourceOf } from '../src/sources.ts';
import { document } from './docx-fixture.js';
import { pdf } from './pdf-fixture.js';

describe('connector_text_proposed: a Word document or a PDF', () => {
  test('a block naming a .docx or .pdf after FROM is a document place; another ending is still refused', () => {
    for (const place of ['Data/plan.docx', 'Data/plan.PDF'])
      assert.equal(sourceOf(`// graph: plan · FROM ${place}`).kind, 'document');
    assert.equal(sourceOf('// graph: plan · FROM Data/plan.doc').kind, undefined, 'an old .doc is a fault');
  });

  test('it gives no statements, only the text as prose, with a note and a version that follows the text', () => {
    const source = sourceOf('// graph: plan · FROM Data/plan.docx');
    const a = connect(source, { found: 'Data/plan.docx', bytes: document(['Grow steadily.']) });
    assert.deepEqual(a.statements, []);
    assert.equal(a.prose, 'Grow steadily.');
    assert.match(a.note, /only its text is read/);
    const same = connect(source, { found: 'Data/plan.docx', bytes: document(['Grow steadily.'], { stored: true }) });
    assert.equal(same.version, a.version, 'the version is of the text, not of how the file is packed');
    const other = connect(source, { found: 'Data/plan.docx', bytes: document(['Shrink.']) });
    assert.notEqual(other.version, a.version);
  });

  test('a PDF is read the same way, and each place is named by its sentence', () => {
    const source = sourceOf('// graph: plan · FROM Data/plan.pdf');
    const got = connect(source, { found: 'Data/plan.pdf', bytes: pdf([['Alpha', 'Beta']]) });
    assert.equal(got.prose, '[page 1]\nAlpha\nBeta');
  });

  test('a file that is not what its ending says, or a file the host could not read, is refused with why', () => {
    const source = sourceOf('// graph: plan · FROM Data/plan.docx');
    assert.match(connect(source, { found: 'x', bytes: pdf([['x']]) }).refused, /not a Word document/);
    assert.match(connect(source, { found: 'x', unreadable: 'denied' }).refused, /denied|could not/);
    assert.match(connect(source, { missing: true, elsewhere: [] }).refused, /plan/);
  });
});
