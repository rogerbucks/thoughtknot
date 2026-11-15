// A block drawn from a Word document or a PDF in the plug-in (editor spec §63, connector_text_proposed, ES§67
// format_untrusted_files): `· FROM Notes/plan.docx`. The card says only the text is read and it is drawn only as a
// proposal. Its button is the one a .txt file has. The file is read on the device and never written.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { document } from '../../core/test/docx-fixture.js';
import { pdf } from '../../core/test/pdf-fixture.js';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const NOTE_PATH = 'Some note.md';
const noteFor = (place) =>
  ['---', 'classification: Public', '---', '# Plan', '', fence(`// graph: plan · FROM ${place}`), ''].join('\n');
const named = (el, text) => el.querySelectorAll('button').find((b) => b.textContent.includes(text));

describe('a block drawn from a Word document or a PDF', () => {
  for (const [place, bytes] of [
    ['Notes/plan.docx', document(['Acme Ltd hired Alice Smith.'])],
    ['Notes/plan.pdf', pdf([['Acme Ltd hired Alice Smith.']])],
  ]) {
    test(`${place}: the card says only its text is read, offers the proposal, and writes nothing`, async () => {
      const note = noteFor(place);
      const env = await load({ files: { [NOTE_PATH]: note, [place]: bytes } });
      try {
        const { el } = await show(env, note, 0);
        await until(() => el.querySelector('[role="alert"]'));
        assert.match(el.querySelector('[role="alert"]').textContent, /only its text is read/);
        assert.ok(named(el, `Propose a graph from ${place}`), 'the same button a .txt file has');
        assert.deepEqual(env.state.files.get(place), bytes, 'the file is never written');
        assert.equal(env.state.files.get(NOTE_PATH), note);
      } finally {
        env.uninstall();
      }
    });
  }

  test('a file that is not a document, and a missing one, are said with their reason', async () => {
    const note = noteFor('Notes/plan.docx');
    const env = await load({ files: { [NOTE_PATH]: note, 'Notes/plan.docx': new Uint8Array([1, 2, 3]) } });
    try {
      const { el } = await show(env, note, 0);
      await until(() => el.querySelector('[role="alert"]'));
      assert.match(el.textContent, /not a Word document/);
    } finally {
      env.uninstall();
    }
    const gone = await load({ files: { [NOTE_PATH]: note } });
    try {
      const { el } = await show(gone, note, 0);
      await until(() => el.querySelector('[role="alert"]'));
      assert.match(el.textContent, /plan\.docx/);
    } finally {
      gone.uninstall();
    }
  });
});
