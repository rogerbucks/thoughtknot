// A table drawn from a CSV file in the plug-in (editor spec §63, connector_files_to_gql, connector_mapping_written).
// With no mapping yet, the card says so and shows the mapping proposed. Nothing is drawn until a person saves it. Then
// each row is a thing, read through the vault where the file is, and nothing is written into the note.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const CSV = 'order_id,amount,region\nA1,12.5,North\nA2,8,South\n';
const note = ['# Sales', '', fence('// graph: sales · FROM Data/sales.csv'), ''].join('\n');
const keys = (el) =>
  el
    .querySelectorAll('g.node')
    .map((g) => g.getAttribute('data-key'))
    .sort();

describe('a block drawn from a CSV table', () => {
  test('with no mapping, says so and draws nothing until a person saves the one proposed', async () => {
    const env = await load({ files: { 'Sales.md': note, 'Data/sales.csv': CSV } });
    try {
      const { el } = await show(env, note, 0);
      await until(() => el.querySelector('[role="alert"]'));
      assert.match(el.querySelector('[role="alert"]').textContent, /no mapping yet/);
      assert.match(el.querySelector('pre').textContent, /\/\/ graph: mapping/);
      assert.deepEqual(keys(el), []);
      assert.equal(env.state.files.get('Data/sales.mapping.gql'), undefined);
      const save = el.querySelectorAll('button').find((b) => /Save this mapping/.test(b.textContent));
      save.click();
      await until(() => env.state.files.get('Data/sales.mapping.gql'));
      assert.match(env.state.files.get('Data/sales.mapping.gql'), /as: 'key'/);
      // the card is drawn again from the mapping just saved
      await until(() => keys(el).length > 0);
      assert.deepEqual(keys(el), ['sales_A1', 'sales_A2']);
      assert.equal(env.state.files.get('Sales.md'), note);
    } finally {
      env.uninstall();
    }
  });

  test('with a mapping written, draws a thing for each row, citing the table', async () => {
    const env = await load({ files: { 'Sales.md': note, 'Data/sales.csv': CSV } });
    try {
      const { el } = await show(env, note, 0);
      await until(() => el.querySelector('pre'));
      const proposed = el.querySelector('pre').textContent;
      await env.app.vault.create('Data/sales.mapping.gql', proposed);
      const again = await show(env, note, 0);
      await until(() => keys(again.el).length > 0);
      assert.deepEqual(keys(again.el), ['sales_A1', 'sales_A2']);
      assert.match(again.el.querySelector('.thoughtknot-source').textContent, /table Data\/sales\.csv/);
    } finally {
      env.uninstall();
    }
  });
});
