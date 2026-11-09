// A data set kept as a snapshot, or linked again, from its details while the block is edited (ES§52,
// data_set_linked_or_kept). The copy is a file beside the note; an existing file is never replaced. The table card shows
// the data set's table in the note (format_content_node).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { editing, tapKey } from './host/inspector-steps.js';

before(() => build());

const PATH = 'Some note.md';
const CSV = 'order_id,amount\nA1,10\nA2,2.5\n';
const GRAPH = `// graph: trip
(sales:DataSet {place: 'Data/sales.csv'}),
(report:Note {name: 'Q3'})`;
const FILES = { [PATH]: ['# Trip', '', fence(GRAPH), ''].join('\n'), 'Data/sales.csv': CSV };
const text = (el) => el.querySelector('textarea.thoughtknot-text').value;
const panelOf = (el) => el.querySelector('.thoughtknot-details');
const pressed = (el, label) =>
  panelOf(el)
    .querySelectorAll('button')
    .find((b) => b.textContent === label);

describe('data_set_linked_or_kept: the details keep a snapshot or link again', () => {
  test('the box shows its table, and Keep a snapshot copies the file beside the note and points the thing at it', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const el = await editing(env);
      await until(() => !!el.querySelector('g.node'));
      assert.ok(el.querySelector('svg').textContent.includes('order_id'), 'the box shows its table');
      tapKey(el, 'sales');
      await until(() => !!pressed(el, 'Keep a snapshot'));
      assert.match(panelOf(el).textContent, /Data\/sales\.csv is linked/);
      pressed(el, 'Keep a snapshot').click();
      await until(() => text(el).includes("kept: 'snapshot'"));
      assert.equal(env.state.files.get('Some note.sales.csv'), CSV, 'the copy is beside the note');
      assert.match(text(el), /place: 'Some note\.sales\.csv'/);
      assert.match(text(el), /from: 'Data\/sales\.csv'/);
      assert.equal(env.state.files.get('Data/sales.csv'), CSV, 'the source is as it was');
    } finally {
      env.uninstall();
    }
  });

  test('an existing file beside the note is never replaced: the copy takes the next free name', async () => {
    const env = await load({ files: { ...FILES, 'Some note.sales.csv': 'mine\n' } });
    try {
      const el = await editing(env);
      await until(() => !!el.querySelector('g.node'));
      tapKey(el, 'sales');
      await until(() => !!pressed(el, 'Keep a snapshot'));
      pressed(el, 'Keep a snapshot').click();
      await until(() => text(el).includes("kept: 'snapshot'"));
      assert.equal(env.state.files.get('Some note.sales.csv'), 'mine\n');
      assert.equal(env.state.files.get('Some note.sales-2.csv'), CSV);
      assert.match(text(el), /place: 'Some note\.sales-2\.csv'/);
    } finally {
      env.uninstall();
    }
  });

  test('a snapshot says what it is a copy of, and Link again points the thing back at its place', async () => {
    const snapped = `// graph: trip
(sales:DataSet {place: 'Some note.sales.csv', kept: 'snapshot', from: 'Data/sales.csv', version: 'abc'}),
(report:Note {name: 'Q3'})`;
    const files = { ...FILES, [PATH]: ['# Trip', '', fence(snapped), ''].join('\n'), 'Some note.sales.csv': CSV };
    const env = await load({ files });
    try {
      const el = await editing(env);
      await until(() => !!el.querySelector('g.node'));
      tapKey(el, 'sales');
      await until(() => !!pressed(el, 'Link again'));
      assert.match(panelOf(el).textContent, /snapshot of Data\/sales\.csv/);
      pressed(el, 'Link again').click();
      await until(() => !text(el).includes('kept:'));
      assert.match(text(el), /place: 'Data\/sales\.csv'/);
      assert.ok(!text(el).includes('from:') && !text(el).includes('version:'));
    } finally {
      env.uninstall();
    }
  });
});
