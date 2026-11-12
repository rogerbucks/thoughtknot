// Import from an Excel workbook (ES§20, db_import_on_request; ES§63 connector_files_to_gql). The workbook is
// a .xlsx file in the vault, read on the device when picked. Each sheet is offered as a table, with its first row as
// the columns. Nothing is written until Import is pressed, and the workbook itself is never written.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { workbook } from '../../core/test/xlsx-fixture.js';
import { build, load, until } from './host/load-plugin.js';

before(() => build());

const PATH = 'Sales.md';
const NOTE = '# Sales\n\nThe customers, as the workbook had them.\n';
const BOOK = 'Data/sales.xlsx';
const bytes = workbook({
  customers: [
    ['id', 'kind', 'name'],
    ['acme', 'Customer', 'Acme'],
    ['bolt', 'Customer', 'Bolt'],
  ],
  referrals: [
    ['from', 'type', 'to'],
    ['acme', 'REFERRED', 'bolt'],
  ],
});

const row = (el, name) =>
  el.querySelectorAll('.setting-item').find((r) => r.querySelector('.setting-item-name')?.textContent === name);
const offered = (m, name) =>
  row(m.contentEl, name)
    .querySelectorAll('option')
    .map((o) => o.textContent);
function choose(m, name, value) {
  const sel = row(m.contentEl, name).querySelector('select');
  sel.value = value;
  sel.dispatch('change');
}

describe('Import offers the .xlsx files of the vault, each sheet as a table (db_import_on_request)', () => {
  test('the sheets picked are written as a graph block, and the workbook is never written', async () => {
    const env = await load({ files: { [PATH]: NOTE, [BOOK]: bytes } });
    try {
      env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), NOTE, 'source');
      await env.state.commands.find((c) => c.id === 'import-from-database').callback();
      const m = env.state.modals.at(-1);
      assert.deepEqual(offered(m, 'Database file'), ['Choose a file', BOOK]);
      choose(m, 'Database file', '0');
      await until(() => row(m.contentEl, 'Things table') || m.contentEl.querySelector('[role="alert"]'));
      assert.deepEqual(offered(m, 'Things table'), ['customers', 'referrals']);
      assert.deepEqual(offered(m, 'Id column'), ['id', 'kind', 'name'], 'the first row of the sheet is its columns');
      assert.equal(env.state.files.get(PATH), NOTE, 'nothing is written by picking');
      const type = row(m.contentEl, 'Graph name').querySelector('input');
      type.value = 'customers';
      type.dispatch('input');
      choose(m, 'Kind column', 'kind');
      choose(m, 'Links table', 'referrals');
      choose(m, 'From column', 'from');
      choose(m, 'To column', 'to');
      choose(m, 'Type column', 'type');
      const said = env.state.notices.length;
      m.contentEl
        .querySelectorAll('button')
        .find((b) => b.getAttribute('aria-label') === 'Import')
        .click();
      await until(() => env.state.notices.length > said);
      assert.match(env.state.notices.at(-1), /Imported customers from sales into Sales/);
      const note = env.state.files.get(PATH);
      assert.match(note, /\(acme:Customer \{name: 'Acme'\}\)/);
      assert.match(note, /\(acme\)-\[:REFERRED\]->\(bolt\)/);
      assert.deepEqual(env.state.files.get(BOOK), bytes, 'the workbook is never written');
    } finally {
      env.uninstall();
    }
  });

  test('a file that is no workbook is refused with why, and nothing is offered from it', async () => {
    const env = await load({ files: { [PATH]: NOTE, [BOOK]: new TextEncoder().encode('id,name\n1,a\n') } });
    try {
      env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), NOTE, 'source');
      await env.state.commands.find((c) => c.id === 'import-from-database').callback();
      const m = env.state.modals.at(-1);
      choose(m, 'Database file', '0');
      await until(() => m.contentEl.querySelector('[role="alert"]'));
      assert.match(m.contentEl.querySelector('[role="alert"]').textContent, /not an Excel workbook/);
      assert.equal(row(m.contentEl, 'Things table'), undefined);
    } finally {
      env.uninstall();
    }
  });
});
