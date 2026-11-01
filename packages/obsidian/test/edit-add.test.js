// Adding and deleting things where they are drawn (editor spec §72, edit_quick_add, edit_delete). The built plugin,
// loaded against the stand-ins for the page.
// - Tab on a selected thing adds a child linked from it; Shift+Enter a sibling linked from its parent. Each is selected
//   in the card drawn next, its name open for typing.
// - Delete takes the thing and its links out of the note, as one edit.
// - The editor's buttons do the same.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, settled, until } from './host/load-plugin.js';
import { NOTE, PATH, READER, showIn } from './host/card-notes.js';

before(() => build());

const thing = (el, key) => el.querySelectorAll('g.node').find((g) => g.getAttribute('data-key') === key);
const tap = (el, g) => {
  const vp = el.querySelector('.thoughtknot-viewport');
  const init = { target: g, pointerId: 3, pointerType: 'mouse', clientX: 20, clientY: 20, button: 0 };
  vp.dispatch('pointerdown', init);
  vp.dispatch('pointerup', { ...init, clientX: 21 });
};
const card = (el) => el.querySelector('.thoughtknot-edit-card');
const nameOf = (el) => card(el)?.querySelector('input.thoughtknot-edit-name');
const press = (el, key, more = {}) =>
  el.querySelector('.thoughtknot-viewport').dispatch('keydown', { key, target: thing(el, 'q') ?? undefined, ...more });
const note = (env) => env.state.files.get(PATH);

/** The note's card in Live Preview, thing `k` tapped once. */
async function tapped(k) {
  const env = await load({ files: { [PATH]: NOTE } });
  const el = await showIn(env, 'live');
  await until(() => !!thing(el, k));
  await settled();
  tap(el, thing(el, k));
  await until(() => !!card(el));
  return { env, el };
}

/** The card drawn again from the note as it now is, as Obsidian draws it after a write. */
const redrawn = (env) => showIn(env, 'live');

describe('adding and deleting where things are drawn', () => {
  // proves: edit_quick_add
  test('Tab adds a child linked from the thing, selected next with its name open for typing', async () => {
    const { env, el } = await tapped('q');
    try {
      const ev = press(el, 'Tab');
      assert.ok(ev.defaultPrevented, 'Tab is taken while a thing is selected');
      await until(() => note(env).includes("(new_thing {name: 'New thing'})"));
      assert.equal(
        note(env),
        NOTE.replace(READER, `${READER},\n(new_thing {name: 'New thing'}),\n(q)-[:ANSWERS]->(new_thing)`),
      );
      const next = await redrawn(env);
      await until(() => nameOf(next)?.value === 'New thing');
      assert.equal(env.doc.activeElement, nameOf(next), 'its name is ready to type');
      nameOf(next).value = 'Small reader';
      nameOf(next).dispatch('keydown', { key: 'Enter' });
      await until(() => note(env).includes("(new_thing {name: 'Small reader'})"));
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_quick_add
  test('Shift+Enter adds a sibling linked from the parent, and does not open the box again', async () => {
    const { env, el } = await tapped('large');
    try {
      press(el, 'Enter', { shiftKey: true, target: thing(el, 'large') });
      await until(() => note(env).includes('(new_thing:Option'));
      assert.ok(note(env).endsWith("(new_thing:Option {name: 'New thing'})\n```\n"), note(env));
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_delete
  test('Delete, or the editor’s button, takes the thing and its links out as one edit', async () => {
    const { env, el } = await tapped('large');
    try {
      const del = card(el)
        .querySelectorAll('button')
        .find((b) => b.getAttribute('aria-label') === 'Delete');
      del.click();
      await until(() => !note(env).includes('large'));
      assert.equal(note(env), NOTE.replace(",\n(large:Option {name: 'Large reader'}),\n(large)-[:ANSWERS]->(q)", ''));
      await until(() => /Large reader deleted/.test(card(el).textContent));
    } finally {
      env.uninstall();
    }
  });
});
