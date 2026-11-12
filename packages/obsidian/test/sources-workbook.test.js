// A block drawn from a sheet of an Excel workbook in the plug-in (ES§63, connector_files_to_gql,
// connector_mapping_written): `· FROM Data/book.xlsx#Customers`. With no mapping yet, the card says so and shows the
// one proposed. Once it is saved, each row is a thing. The file is read on the device and never written.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { workbook } from '../../core/test/xlsx-fixture.js';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const BOOK = 'Data/book.xlsx';
const MAPPING = 'Data/book.Customers.mapping.gql';
const note = ['# Shop', '', fence(`// graph: shop · FROM ${BOOK}#Customers`), ''].join('\n');
const keys = (el) =>
  el
    .querySelectorAll('g.node')
    .map((g) => g.getAttribute('data-key'))
    .sort();
const file = () =>
  workbook({
    Customers: [
      ['id', 'Name'],
      ['acme', 'Acme Ltd'],
      ['bolt', 'Bolt'],
    ],
  });

describe('a block drawn from a sheet of an Excel workbook', () => {
  test('with no mapping, proposes one; saved, draws a thing for each row, the workbook never written', async () => {
    const bytes = file();
    const env = await load({ files: { 'Shop.md': note, [BOOK]: bytes } });
    try {
      const { el } = await show(env, note, 0);
      await until(() => el.querySelector('[role="alert"]'));
      assert.match(el.querySelector('[role="alert"]').textContent, /no mapping yet/);
      assert.deepEqual(keys(el), []);
      const save = el.querySelectorAll('button').find((b) => /Save this mapping/.test(b.textContent));
      assert.match(save.textContent, /book\.Customers\.mapping\.gql/);
      save.click();
      await until(() => env.state.files.get(MAPPING));
      await until(() => keys(el).length > 0);
      assert.deepEqual(keys(el), ['acme', 'bolt']);
      assert.match(el.querySelector('.thoughtknot-source').textContent, /workbook Data\/book\.xlsx#Customers/);
      assert.deepEqual(env.state.files.get(BOOK), bytes, 'the workbook is never written');
      assert.equal(env.state.files.get('Shop.md'), note);
    } finally {
      env.uninstall();
    }
  });

  test('a sheet the workbook does not hold is said, naming it', async () => {
    const other = note.replace('#Customers', '#Orders');
    const env = await load({ files: { 'Shop.md': other, [BOOK]: file() } });
    try {
      const { el } = await show(env, other, 0);
      await until(() => el.querySelector('[role="alert"]'));
      assert.match(el.textContent, /The workbook has no sheet Orders/);
    } finally {
      env.uninstall();
    }
  });
});
