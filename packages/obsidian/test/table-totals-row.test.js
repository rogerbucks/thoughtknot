// A graph drawn as a table, with calculated columns, filters and totals (editor spec §57, table_view).
// - A calculated value is a column, and a Total row under the last row adds up each number column.
// - A box for each column keeps the rows that pass it. The Total row follows the rows kept.
// - A row with no number is said, never counted as zero.
// - Rows hidden by a filter stay in the table, so sorting and the keys go on as they were.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const WORK = `// graph: work
(dig:Task {name: 'Dig', hours: 2, rate: 10}),
(lay:Task {name: 'Lay', hours: 3, rate: 20}),
(wait:Task {name: 'Wait', hours: 4}),
(cost:Calculated {of: 'Task', name: 'cost', is: 'hours * rate', unit: 'USD'})`;
const TABLE = "// graph: work_style · STYLE work\n(d1:Diagram {type: 'table'})";
const note = ['# Work', '', fence(WORK), '', fence(TABLE), ''].join('\n');

async function card() {
  const env = await load({ files: { [PATH]: note } });
  const { el } = await show(env, note, 0);
  return { env, el };
}
const heads = (el) => el.querySelectorAll('thead th[data-col]').map((th) => th.textContent);
const total = (el) =>
  el
    .querySelector('.thoughtknot-total-row')
    .querySelectorAll('td')
    .map((td) => td.textContent);
const shown = (el) => el.querySelectorAll('tbody tr[data-key]').filter((tr) => !tr.hidden);
const box = (el, name) =>
  el.querySelectorAll('.thoughtknot-table-filter').find((b) => b.getAttribute('placeholder') === name);

describe('the table view with calculated columns and totals', () => {
  // proves: table_view
  test('a calculated value is a column, and a Total row adds up each number column', async () => {
    const { env, el } = await card();
    try {
      const at = heads(el).indexOf('cost');
      assert.ok(at > heads(el).indexOf('rate'), 'cost is a column after the properties');
      assert.equal(total(el)[at], '80 USD, 1 has none');
      assert.equal(total(el)[heads(el).indexOf('hours')], '9');
      assert.equal(total(el)[0], '', 'text is not totalled');
    } finally {
      env.uninstall();
    }
  });

  // proves: table_view
  test('a filter keeps the rows that pass, hides the rest without removing them, and the total follows', async () => {
    const { env, el } = await card();
    try {
      const all = el.querySelectorAll('tbody tr[data-key]').length;
      const hours = heads(el).indexOf('hours');
      const typed = box(el, 'hours');
      typed.value = '>2';
      typed.dispatch('input', {});
      assert.deepEqual(
        shown(el).map((tr) => tr.querySelectorAll('td')[0].textContent),
        ['Lay', 'Wait'],
      );
      assert.equal(el.querySelectorAll('tbody tr[data-key]').length, all, 'hidden, not removed');
      assert.equal(total(el)[hours], '7');
      typed.value = '';
      typed.dispatch('input', {});
      assert.equal(total(el)[hours], '9', 'cleared, the total is of every row again');
    } finally {
      env.uninstall();
    }
  });
});
