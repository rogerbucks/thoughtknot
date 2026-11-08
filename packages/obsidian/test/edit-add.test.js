// Adding and deleting things where they are drawn (editor spec §72, edit_quick_add, edit_delete). The built plugin,
// loaded against the stand-ins for the page.
// - Insert on a selected thing adds a child linked from it; Shift+Enter a sibling linked from its parent. Each is selected
//   in the card drawn next, its name open for typing.
// - Delete takes the thing and its links out of the note, as one edit.
// - The editor's buttons do the same.
// - Its quick line writes the things and links a short sentence names, reusing those already there (edit_quick_line).
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
  test('Insert adds a child linked from the thing, selected next with its name open for typing', async () => {
    const { env, el } = await tapped('q');
    try {
      assert.ok(!press(el, 'Tab').defaultPrevented, 'Tab moves the focus on, as ever: it never traps it');
      const ev = press(el, 'Insert');
      assert.ok(ev.defaultPrevented, 'Insert is taken while a thing is selected');
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

  // proves: edit_quick_add
  test('on a Mac with no Insert key, Option+Enter adds a child; the buttons say their keys', async () => {
    const { env, el } = await tapped('q');
    try {
      const child = card(el)
        .querySelectorAll('button')
        .find((b) => b.getAttribute('aria-label') === 'Add a child');
      assert.equal(child.getAttribute('title'), 'Add a child: Insert, or Option+Enter (Alt+Enter)');
      assert.ok(press(el, 'Enter', { altKey: true }).defaultPrevented, 'Option+Enter is taken');
      await until(() => note(env).includes('(q)-[:ANSWERS]->(new_thing)'));
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_delete
  test('Backspace, a Mac’s delete key, deletes too, once the card’s question is answered yes', async () => {
    const { env, el } = await tapped('large');
    try {
      press(el, 'Backspace', { target: thing(el, 'large') });
      await until(() => !!card(el).querySelector('.thoughtknot-edit-ask'));
      press(el, 'Backspace', { target: thing(el, 'large') });
      await until(() => !note(env).includes('large'));
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_delete_asks
  test('Delete asks first, in the card: Keep or Escape leaves the thing, Delete takes it out', async () => {
    const { env, el } = await tapped('large');
    try {
      press(el, 'Delete', { target: thing(el, 'large') });
      const ask = () => card(el)?.querySelector('.thoughtknot-edit-ask');
      await until(() => !!ask());
      assert.equal(ask().getAttribute('role'), 'alertdialog');
      assert.match(ask().textContent, /Delete Large reader and its link\?/);
      assert.equal(env.doc.activeElement?.textContent, 'Delete', 'its yes has the focus, so Enter says it');
      ask().dispatch('keydown', { key: 'Escape' });
      assert.equal(ask(), null, 'Escape keeps the thing');
      await settled();
      assert.equal(note(env), NOTE, 'nothing written');
      press(el, 'Delete', { target: thing(el, 'large') });
      await until(() => !!ask());
      ask()
        .querySelectorAll('button')
        .find((b) => b.textContent === 'Keep')
        .click();
      await settled();
      assert.equal(note(env), NOTE, 'Keep writes nothing');
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
      await until(() => !!card(el).querySelector('.thoughtknot-edit-ask'));
      card(el).querySelector('.thoughtknot-edit-ask button.mod-warning').click();
      await until(() => !note(env).includes('large'));
      assert.equal(note(env), NOTE.replace(",\n(large:Option {name: 'Large reader'}),\n(large)-[:ANSWERS]->(q)", ''));
      await until(() => /Large reader deleted/.test(card(el).textContent));
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_undo
  test('Ctrl+Z puts a deleted thing back in the card drawn again, and Ctrl+Shift+Z deletes it again', async () => {
    const { env, el } = await tapped('large');
    try {
      press(el, 'Delete', { target: thing(el, 'large') });
      await until(() => !!card(el).querySelector('.thoughtknot-edit-ask'));
      card(el).querySelector('.thoughtknot-edit-ask button.mod-warning').click();
      await until(() => !note(env).includes('large'));
      const gone = note(env);
      const next = await redrawn(env);
      const vp = () => next.querySelector('.thoughtknot-viewport');
      const toast = () => vp()?.querySelector('.thoughtknot-undo-toast');
      await until(() => !!toast() && !toast().classList.contains('is-hidden'));
      assert.match(vp().querySelector('.thoughtknot-undo-said').textContent, /Large reader deleted/);
      assert.ok(vp().dispatch('keydown', { key: 'z', ctrlKey: true }).defaultPrevented);
      await until(() => note(env) === NOTE);
      const back = await redrawn(env);
      back.querySelector('.thoughtknot-viewport').dispatch('keydown', { key: 'z', ctrlKey: true, shiftKey: true });
      await until(() => note(env) === gone);
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_undo
  test('each edit undoes in turn, last first: a name typed, then a child added', async () => {
    const { env, el } = await tapped('q');
    try {
      nameOf(el).value = 'Who reads it?';
      nameOf(el).dispatch('keydown', { key: 'Enter' });
      await until(() => note(env).includes('Who reads it?'));
      const named = note(env);
      const next = await redrawn(env);
      await until(() => !!thing(next, 'q'));
      await settled();
      tap(next, thing(next, 'q'));
      await until(() => !!card(next));
      press(next, 'Insert');
      await until(() => note(env).includes('New thing'));
      const vp = (await redrawn(env)).querySelector('.thoughtknot-viewport');
      vp.dispatch('keydown', { key: 'z', metaKey: true });
      await until(() => note(env) === named);
      vp.dispatch('keydown', { key: 'z', metaKey: true });
      await until(() => note(env) === NOTE);
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_quick_line
  test('the quick line, empty, says what it is for in a grey example', async () => {
    const { env, el } = await tapped('large');
    try {
      const line = card(el).querySelector('input.thoughtknot-edit-line-input');
      assert.equal(line.getAttribute('placeholder'), 'Quick line: Idea -> Plan, Risk');
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_quick_line
  test('the quick line writes what it names from the selected thing, reusing those already there', async () => {
    const { env, el } = await tapped('large');
    try {
      const line = card(el).querySelector('input.thoughtknot-edit-line-input');
      assert.equal(line.getAttribute('aria-label'), 'Quick line from Large reader');
      assert.match(line.getAttribute('title'), /Idea -> Plan, Risk/);
      line.value = '-> Which device?, Tablet';
      line.dispatch('keydown', { key: 'Enter' });
      await until(() => note(env).includes('(large)-[:ANSWERS]->(tablet)'));
      const want = `${READER},\n(tablet:Question {title: 'Tablet'}),\n(large)-[:ANSWERS]->(tablet)`;
      assert.ok(note(env) === NOTE.replace(READER, want), note(env));
    } finally {
      env.uninstall();
    }
  });
});
