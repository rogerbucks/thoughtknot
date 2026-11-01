// Linking things where they are drawn (editor spec §72, edit_link_drag). The built plugin, loaded against the stand-ins
// for the page.
// - L, or the Link button, opens a search in the editor. Enter links to the first thing found, or makes a new thing of
//   the name typed, linked from the selected one.
// - The handle dragged to another box links to it; let go on an empty place, it makes a new thing, its name open.
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
const search = (el) => card(el)?.querySelector('input.thoughtknot-edit-find-input');
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

/** Types `text` into the search and presses Enter. */
function typeIn(el, text) {
  search(el).value = text;
  search(el).dispatch('input');
  search(el).dispatch('keydown', { key: 'Enter' });
}

/** Drags the editor's handle and lets go on `target`, at a point inside the drawing. */
function dragTo(env, el, target) {
  const handle = card(el).querySelector('.thoughtknot-edit-handle');
  handle.dispatch('pointerdown', { button: 0, clientX: 10, clientY: 10, pointerId: 4 });
  const tell = (type, init) => [...(env.doc.listeners.get(type) ?? [])].forEach((fn) => fn({ type, ...init }));
  tell('pointermove', { clientX: 60, clientY: 50, pointerId: 4 });
  assert.ok(el.querySelector('.thoughtknot-edit-line'), 'a line follows the pointer');
  tell('pointerup', { clientX: 60, clientY: 50, pointerId: 4, target });
  assert.equal(el.querySelector('.thoughtknot-edit-line'), null, 'the line goes once let go');
}

describe('linking where things are drawn', () => {
  // proves: edit_link_drag
  test('L opens a search; Enter links to the first thing found, of the type the graph uses most', async () => {
    const { env, el } = await tapped('q');
    try {
      el.querySelector('.thoughtknot-viewport').dispatch('keydown', { key: 'l', target: thing(el, 'q') });
      await until(() => !!search(el));
      assert.equal(env.doc.activeElement, search(el), 'the search has the focus');
      typeIn(el, 'large');
      await until(() => note(env).includes('(q)-[:ANSWERS]->(large)'));
      assert.equal(note(env), NOTE.replace(READER, `${READER},\n(q)-[:ANSWERS]->(large)`));
      await until(() => /Linked to Large reader/.test(card(el).textContent));
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_link_drag
  test('a name nothing matches makes a new thing, linked from the selected one', async () => {
    const { env, el } = await tapped('q');
    try {
      card(el)
        .querySelectorAll('button')
        .find((b) => b.getAttribute('aria-label') === 'Link to…')
        .click();
      await until(() => !!search(el));
      typeIn(el, 'Tablet');
      await until(() => note(env).includes("{name: 'Tablet'}"));
      assert.match(note(env), /\(q\)-\[:ANSWERS\]->\(tablet\)/);
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_link_drag
  test('the handle dragged to another box links to it, and to an empty place makes a new thing', async () => {
    const { env, el } = await tapped('q');
    try {
      dragTo(env, el, thing(el, 'large'));
      await until(() => note(env).includes('(q)-[:ANSWERS]->(large)'));
    } finally {
      env.uninstall();
    }
    const again = await tapped('large');
    try {
      dragTo(again.env, again.el, again.el.querySelector('.thoughtknot-viewport'));
      await until(() => note(again.env).includes("(new_thing:Question {title: 'New thing'})"));
      assert.match(note(again.env), /\(large\)-\[:ANSWERS\]->\(new_thing\)/, 'of the kind its other children are');
    } finally {
      again.env.uninstall();
    }
  });
});
