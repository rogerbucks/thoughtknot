// Import from a database (editor spec §20, db_import_on_request; §21, settings_db_connections; §13,
// offline_and_mobile_apis).
// - The database is a SQLite file in the vault. Import offers each one, with nothing to set up and no password kept.
// - It reads the file when the person picks it, to list its tables, and writes only when Import is pressed, on desktop
//   and mobile alike, on the device: no network is reached.
// - It writes the rows into the note as a graph block of text. It keeps no live link: drawing the note never reads the
//   file again, and the file itself is never written.
// The plugin reads the file in plain JavaScript, with no engine. The files are made by sql.js in the test. The person
// picks the tables and columns: no SQL is written.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { build, load, until } from './host/load-plugin.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Sales.md';
const NOTE = '# Sales\n\nThe customers, as the database had them.\n';
const DB = 'Data/sales.sqlite';

/** A SQLite file's bytes: two customers, one with a logo, and one referral between them. */
async function salesFile() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`create table customers (id text, kind text, name text, logo blob);
    insert into customers values ('acme', 'Customer', 'Acme', x'89504e47'), ('bolt', 'Customer', 'Bolt', null);
    create table referrals ("from" text, type text, "to" text);
    insert into referrals values ('acme', 'REFERRED', 'bolt');`);
  const bytes = db.export();
  db.close();
  return bytes;
}

/** The plugin loaded with the note open in front and the database in the vault. Each binary read and fetch is recorded. */
async function open({ files = {}, ...options } = {}) {
  const bytes = await salesFile();
  const env = await load({ files: { [PATH]: NOTE, [DB]: bytes, ...files }, ...options });
  env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), NOTE, 'source');
  env.bytes = bytes;
  env.reads = [];
  const real = env.app.vault.readBinary.bind(env.app.vault);
  env.app.vault.readBinary = (file) => {
    env.reads.push(file.path);
    return real(file);
  };
  env.fetched = [];
  env.fetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    env.fetched.push(String(args[0]));
    return Promise.reject(new Error('no network in this test'));
  };
  const uninstall = env.uninstall;
  env.uninstall = () => {
    globalThis.fetch = env.fetch;
    uninstall();
  };
  return env;
}

const row = (el, name) =>
  el.querySelectorAll('.setting-item').find((r) => r.querySelector('.setting-item-name')?.textContent === name);
const button = (el, label) => el.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const command = (env) => env.state.commands.find((c) => c.id === 'import-from-database');
const dialog = (env) => env.state.modals.at(-1);
function type(m, name, value) {
  const field = row(m.contentEl, name).querySelector('input, textarea');
  field.value = value;
  field.dispatch('input');
}
function choose(m, name, value) {
  const sel = row(m.contentEl, name).querySelector('select');
  sel.value = value;
  sel.dispatch('change');
}
const offered = (m, name) =>
  row(m.contentEl, name)
    .querySelectorAll('option')
    .map((o) => o.textContent);

/** Opens the dialog and picks the database file; resolves once its tables are listed, or it says why not. */
async function pickFile(env, file = DB) {
  await command(env).callback();
  const m = dialog(env);
  assert.ok(m, `the dialog is open, not: ${env.state.notices.join(' | ')}`);
  const at = offered(m, 'Database file').indexOf(file) - 1;
  choose(m, 'Database file', String(at));
  await until(() => row(m.contentEl, 'Things table') || m.contentEl.querySelector('[role="alert"]'));
  return m;
}

/** Picks the file, the tables and columns, and presses Import; resolves once a notice says how it went. */
async function importWith(env, pick) {
  const m = await pickFile(env);
  type(m, 'Graph name', 'customers');
  for (const [name, value] of pick) {
    if (name === 'Link type') type(m, name, value);
    else choose(m, name, value);
  }
  const said = env.state.notices.length;
  button(m.contentEl, 'Import').click();
  await until(() => env.state.notices.length > said);
  return { m, notice: env.state.notices.at(-1) };
}

const CUSTOMERS = [
  ['Things table', 'customers'],
  ['Id column', 'id'],
  ['Kind column', 'kind'],
];
const REFERRALS = [
  ['Links table', 'referrals'],
  ['From column', 'from'],
  ['To column', 'to'],
  ['Type column', 'type'],
];

describe('Import offers the SQLite files of the vault, with nothing to set up (settings_db_connections)', () => {
  test('each .sqlite, .sqlite3 or .db file is offered by its path; nothing else is', async () => {
    const env = await open({ files: { 'b.db': new Uint8Array(0), 'notes.md': '# n', 'table.csv': 'a,b' } });
    try {
      await command(env).callback();
      const offered = row(dialog(env).contentEl, 'Database file').querySelectorAll('option');
      assert.deepEqual(
        offered.map((o) => o.textContent),
        ['Choose a file', 'b.db', DB],
      );
      assert.deepEqual(env.reads, [], 'opening the dialog reads nothing');
      assert.equal(row(dialog(env).contentEl, 'Things table'), undefined, 'no table is offered before a file');
    } finally {
      env.uninstall();
    }
  });

  test('with no database file in the vault, Import says so and opens nothing', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), NOTE, 'source');
      await command(env).callback();
      assert.equal(env.state.modals.length, 0);
      assert.match(env.state.notices.at(-1), /No database file is in the vault/);
    } finally {
      env.uninstall();
    }
  });

  test('the settings page holds no database connection, password or key', async () => {
    const env = await open();
    try {
      const tab = env.state.settingTabs[0];
      tab.display();
      assert.doesNotMatch(tab.containerEl.textContent, /Database|password/i);
      assert.ok(!('dbConnections' in env.plugin.settings));
    } finally {
      env.uninstall();
    }
  });
});

describe('Import writes only when pressed, on the device, as text, from tables picked (db_import_on_request)', () => {
  for (const mobile of [false, true])
    test(`on ${mobile ? 'a phone or tablet' : 'desktop'}, the tables picked are written as a graph block`, async () => {
      const env = await open({ mobile });
      try {
        const m = await pickFile(env);
        assert.deepEqual(env.reads, [DB], 'picking the file reads it once, to list its tables');
        assert.deepEqual(offered(m, 'Things table'), ['customers', 'referrals']);
        assert.equal(env.state.files.get(PATH), NOTE, 'nothing is written by picking');
        m.close();
        const { notice } = await importWith(env, [...CUSTOMERS, ...REFERRALS]);
        assert.match(notice, /Imported customers from sales into Sales/);
        const note = env.state.files.get(PATH);
        assert.ok(note.startsWith(NOTE.trimEnd()), 'the note as it was, then the import');
        assert.match(
          note,
          /```gql\n\/\/ graph: customers\n\/\/ Imported from sales on .*: 2 things and 1 link, a copy/,
        );
        assert.match(note, /\(acme:Customer \{name: 'Acme'\}\)/, 'the logo, a blob, is left out');
        assert.match(note, /\(acme\)-\[:REFERRED\]->\(bolt\)/);
        assert.deepEqual(env.state.files.get(DB), env.bytes, 'the database file is never written');
        assert.deepEqual(env.fetched, [], 'no network was reached');
      } finally {
        env.uninstall();
      }
    });

  test('with no kind column and one type for every link, nothing is guessed from a column’s name', async () => {
    const env = await open();
    try {
      const pick = [
        ['Things table', 'customers'],
        ['Id column', 'id'],
        ['Kind column', ''],
        ['Links table', 'referrals'],
        ['From column', 'from'],
        ['To column', 'to'],
        ['Type column', ''],
        ['Link type', 'KNOWS'],
      ];
      const { notice } = await importWith(env, pick);
      assert.match(notice, /Imported customers/);
      const note = env.state.files.get(PATH);
      assert.match(note, /\(acme \{name: 'Acme'\}\)/, 'the kind column is not taken for a kind unless picked');
      assert.doesNotMatch(note, /:Customer/);
      assert.match(note, /:KNOWS/);
    } finally {
      env.uninstall();
    }
  });

  test('the block drawn afterwards reads the file no more: it keeps no live link', async () => {
    const env = await open();
    try {
      await importWith(env, CUSTOMERS);
      const { el } = await show(env, env.state.files.get(PATH));
      await until(() => !!el.querySelector('g.node'));
      assert.equal(env.reads.length, 1, 'drawing the note read nothing');
    } finally {
      env.uninstall();
    }
  });

  test('a view is named with why it is not offered, and only tables are', async () => {
    const env = await open();
    try {
      const SQL = await initSqlJs();
      const db = new SQL.Database(env.bytes);
      db.run('create view acme_only as select * from customers where id = "acme"');
      env.state.files.set(DB, db.export());
      db.close();
      const m = await pickFile(env);
      assert.deepEqual(offered(m, 'Things table'), ['customers', 'referrals']);
      assert.match(m.contentEl.textContent, /Not offered: acme_only is a view/);
    } finally {
      env.uninstall();
    }
  });

  test('a file that is not a SQLite database says why, and offers nothing to import', async () => {
    const env = await open({ files: { [DB]: new TextEncoder().encode('not a database at all, only text') } });
    try {
      const m = await pickFile(env);
      assert.match(m.contentEl.querySelector('[role="alert"]').textContent, /not a SQLite database/);
      assert.equal(button(m.contentEl, 'Import'), undefined);
      assert.equal(env.state.files.get(PATH), NOTE);
    } finally {
      env.uninstall();
    }
  });
});
