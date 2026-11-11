// A block drawn from a table of a SQLite database in the plug-in (editor spec §63, connector_files_to_gql,
// connector_mapping_written): `· FROM Data/shop.sqlite#customers`. With no mapping yet, the card says so and shows
// the one proposed. Once it is saved, each row is a thing. The file is read on the device and never written.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const DB = 'Data/shop.sqlite';
const MAPPING = 'Data/shop.customers.mapping.gql';
const note = ['# Shop', '', fence(`// graph: shop · FROM ${DB}#customers`), ''].join('\n');
const keys = (el) =>
  el
    .querySelectorAll('g.node')
    .map((g) => g.getAttribute('data-key'))
    .sort();

async function shopFile() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`create table customers (id text, name text);
    insert into customers values ('acme', 'Acme Ltd'), ('bolt', 'Bolt');`);
  const bytes = db.export();
  db.close();
  return bytes;
}

describe('a block drawn from a table of a SQLite database', () => {
  test('with no mapping, proposes one; saved, draws a thing for each row, the database never written', async () => {
    const bytes = await shopFile();
    const env = await load({ files: { 'Shop.md': note, [DB]: bytes } });
    try {
      const { el } = await show(env, note, 0);
      await until(() => el.querySelector('[role="alert"]'));
      assert.match(el.querySelector('[role="alert"]').textContent, /no mapping yet/);
      assert.deepEqual(keys(el), []);
      const save = el.querySelectorAll('button').find((b) => /Save this mapping/.test(b.textContent));
      assert.match(save.textContent, /shop\.customers\.mapping\.gql/);
      save.click();
      await until(() => env.state.files.get(MAPPING));
      await until(() => keys(el).length > 0);
      // each thing is drawn by its id column, as a CSV table's is
      assert.deepEqual(keys(el), ['acme', 'bolt']);
      assert.match(el.querySelector('.thoughtknot-source').textContent, /database Data\/shop\.sqlite#customers/);
      assert.deepEqual(env.state.files.get(DB), bytes, 'the database is never written');
      assert.equal(env.state.files.get('Shop.md'), note);
    } finally {
      env.uninstall();
    }
  });

  test('a table the database does not hold is said, naming it', async () => {
    const other = note.replace('#customers', '#orders');
    const env = await load({ files: { 'Shop.md': other, [DB]: await shopFile() } });
    try {
      const { el } = await show(env, other, 0);
      await until(() => el.querySelector('[role="alert"]'));
      assert.match(el.textContent, /The database has no table orders/);
    } finally {
      env.uninstall();
    }
  });
});
