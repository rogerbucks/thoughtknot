// Import offers the Word documents and PDFs of the vault (ES§20 db_import_on_request, ES§63 connector_text_proposed). The
// file is read on the device when picked, so one that cannot be read is said at once. Adding writes one linked block into
// the note, and the document itself is never written. Nothing is written until the button is pressed.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { document } from '../../core/test/docx-fixture.js';
import { pdf } from '../../core/test/pdf-fixture.js';
import { build, load, until } from './host/load-plugin.js';

before(() => build());

const PATH = 'Plan.md';
const NOTE = '# Plan\n\nWhat we agreed.\n';
const row = (el, name) =>
  el.querySelectorAll('.setting-item').find((r) => r.querySelector('.setting-item-name')?.textContent === name);
const button = (m, text) => m.contentEl.querySelectorAll('button').find((b) => b.textContent.includes(text));
async function open(env) {
  env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), NOTE, 'source');
  await env.state.commands.find((c) => c.id === 'import-from-database').callback();
  return env.state.modals.at(-1);
}
function choose(m, value) {
  const sel = row(m.contentEl, 'Database file').querySelector('select');
  sel.value = value;
  sel.dispatch('change');
}

describe('Import offers the .docx and .pdf files of the vault', () => {
  for (const [file, bytes] of [
    ['Data/Q1 plan.docx', document(['We agreed to grow.'])],
    ['Data/Q1 plan.pdf', pdf([['We agreed to grow.']])],
  ]) {
    test(`${file}: it is listed, picking writes nothing, and adding writes one linked block`, async () => {
      const env = await load({ files: { [PATH]: NOTE, [file]: bytes } });
      try {
        const m = await open(env);
        const listed = row(m.contentEl, 'Database file')
          .querySelectorAll('option')
          .map((o) => o.textContent);
        assert.deepEqual(listed, ['Choose a file', file]);
        choose(m, '0');
        await until(() => button(m, 'Add to note'));
        assert.equal(env.state.files.get(PATH), NOTE, 'nothing is written by picking');
        assert.equal(row(m.contentEl, 'Things table'), undefined, 'a document has no tables to pick');
        assert.equal(row(m.contentEl, 'Graph name').querySelector('input').value, 'Q1_plan', 'a name is offered');
        assert.match(m.contentEl.textContent, /stays linked/);
        const said = env.state.notices.length;
        button(m, 'Add to note').click();
        await until(() => env.state.notices.length > said);
        assert.match(env.state.notices.at(-1), /Added Q1_plan, drawn from .*Q1 plan\.(docx|pdf), to Plan/);
        assert.equal(
          env.state.files.get(PATH),
          `${NOTE.trimEnd()}\n\n\`\`\`gql\n// graph: Q1_plan · FROM ${file}\n\`\`\`\n`,
        );
        assert.deepEqual(env.state.files.get(file), bytes, 'the document is never written');
      } finally {
        env.uninstall();
      }
    });
  }

  test('a file that is not a document, and a name that is no name, are said and write nothing', async () => {
    const bad = 'Data/bad.docx';
    const env = await load({ files: { [PATH]: NOTE, [bad]: new Uint8Array([1, 2, 3]) } });
    try {
      const m = await open(env);
      choose(m, '0');
      await until(() => m.contentEl.querySelector('[role="alert"]'));
      assert.match(m.contentEl.querySelector('[role="alert"]').textContent, /not a Word document/);
      assert.equal(button(m, 'Add to note'), undefined);
    } finally {
      env.uninstall();
    }
    const good = 'Data/ok.pdf';
    const env2 = await load({ files: { [PATH]: NOTE, [good]: pdf([['Text']]) } });
    try {
      const m = await open(env2);
      choose(m, '0');
      await until(() => button(m, 'Add to note'));
      const name = row(m.contentEl, 'Graph name').querySelector('input');
      name.value = 'two words';
      name.dispatch('input');
      const said = env2.state.notices.length;
      button(m, 'Add to note').click();
      await until(() => env2.state.notices.length > said);
      assert.match(env2.state.notices.at(-1), /two words/);
      assert.equal(env2.state.files.get(PATH), NOTE);
    } finally {
      env2.uninstall();
    }
  });
});
