// A graph drawn as a table is edited cell by cell, as a spreadsheet is (editor spec §72, edit_cells). F2 opens a
// cell for typing; Enter writes it, Escape leaves it. Delete takes a property away. A value its type cannot read is
// refused, and the cell says why.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const TRIP = `// graph: trip
(home:Place {name: 'Home', open: 'always'}),
(park:Place {name: 'The park', since: DATE '1901-05-01'}),
(home)-[:NEAR {miles: 2}]->(park)`;
const TABLE = "// graph: trip_style · STYLE trip\n(d1:Diagram {type: 'table'})";
const NOTE = ['# Trip', '', fence(TRIP), '', fence(TABLE), ''].join('\n');

async function card() {
  const env = await load({ files: { [PATH]: NOTE } });
  const { el } = await show(env, NOTE, 0);
  await until(() => el.querySelectorAll('tr[data-key]').length > 0);
  return { env, el };
}
const cellOf = (el, key, col) =>
  el
    .querySelectorAll('tr[data-key]')
    .find((r) => r.getAttribute('data-key') === key)
    .querySelectorAll('td')[col];
const note = (env) => env.state.files.get(PATH);
const press = (target, key) => target.dispatch('keydown', { key });

/** Opens the cell by F2, types `text` and presses Enter. */
function typeIn(td, text) {
  td.focus();
  press(td, 'F2');
  const input = td.querySelector('input');
  assert.ok(input, 'F2 opens the cell for typing');
  input.value = text;
  press(input, 'Enter');
  return input;
}

describe('a table edited cell by cell', () => {
  // proves: edit_cells
  test('F2 then Enter writes a property, and the Thing column the name', async () => {
    const { env, el } = await card();
    try {
      typeIn(cellOf(el, 'home', 2), 'weekdays');
      await until(() => note(env).includes("open: 'weekdays'"));
      // drawn again from the note as it now is, as Obsidian draws it after a write
      const again = (await show(env, note(env), 0)).el;
      await until(() => again.querySelectorAll('tr[data-key]').length > 0);
      typeIn(cellOf(again, 'park', 0), 'Big park');
      await until(() => note(env).includes("name: 'Big park'"));
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_cells
  test('Escape writes nothing, and Delete takes the property away', async () => {
    const { env, el } = await card();
    try {
      const td = cellOf(el, 'home', 2);
      td.focus();
      press(td, 'F2');
      td.querySelector('input').value = 'never';
      press(td.querySelector('input'), 'Escape');
      assert.equal(td.textContent, 'always', 'the cell is as it was');
      assert.equal(note(env), NOTE);
      press(td, 'Delete');
      await until(() => !note(env).includes('always'));
      assert.ok(note(env).includes("(home:Place {name: 'Home'})"), note(env));
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_cells
  test('a value its type cannot read is refused, and the cell says why', async () => {
    const { env, el } = await card();
    try {
      const td = cellOf(el, 'park', 3);
      typeIn(td, 'soon');
      await until(() => !!td.querySelector('.thoughtknot-cell-said'));
      assert.equal(td.querySelector('input').getAttribute('aria-invalid'), 'true');
      assert.equal(note(env), NOTE, 'nothing is written');
    } finally {
      env.uninstall();
    }
  });
});
