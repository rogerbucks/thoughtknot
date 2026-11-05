// The editor beside a selected thing (editor spec §72). Roger, 1 Nov 2026: the views were only for looking, and he
// wants to edit right where a thing is shown. The built plugin, loaded against the stand-ins for the page.
// Requirements: edit_card, edit_rename, edit_click_rule, edit_read_only and edit_every_view.
// - A first tap on a thing shows the small editor beside it, with its name and kind, and starts no typing.
// - F2 opens the name for typing. Enter writes it as the thing's text, under the key it uses; Escape writes nothing.
// - In reading view, nothing is offered.
// - In space, the editor sits beside the thing as the view shows it, and follows it. On a phone, it sits at the top of
//   the sheet's Details tab.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, settled, until } from './host/load-plugin.js';
import { NOTE, PATH, showIn } from './host/card-notes.js';

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
const key = (el, k) => el.querySelector('.thoughtknot-viewport').dispatch('keydown', { key: k });

/** The note's card where the note is edited, its thing `key` tapped once. */
async function tapped(view = 'live', k = 'q', mobile = false) {
  const env = await load({ files: { [PATH]: NOTE }, mobile });
  const el = await showIn(env, view);
  await until(() => !!thing(el, k));
  await settled();
  tap(el, thing(el, k));
  return { env, el };
}

describe('the editor beside a selected thing', () => {
  // proves: edit_card, edit_click_rule
  test('shows on the first tap, with the name and kind, over the drawing, and starts no typing', async () => {
    const { env, el } = await tapped();
    try {
      await until(() => !!card(el));
      assert.equal(card(el).getAttribute('role'), 'group');
      assert.equal(card(el).getAttribute('aria-label'), 'Edit Which device?');
      assert.equal(nameOf(el).value, 'Which device?');
      assert.equal(nameOf(el).getAttribute('aria-label'), 'Name of Which device?');
      assert.match(card(el).textContent, /Kind: Question/);
      assert.ok(card(el).parentElement.classList.contains('thoughtknot-over'), 'it floats over the drawing');
      assert.notEqual(env.doc.activeElement, nameOf(el), 'a tap selects; it starts no typing');
      tap(el, thing(el, 'large'));
      await until(() => nameOf(el)?.value === 'Large reader');
      assert.equal(el.querySelectorAll('.thoughtknot-edit-card').length, 1, 'one thing at a time');
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_rename
  test('F2 opens the name; Enter writes it under the key the thing uses', async () => {
    const { env, el } = await tapped();
    try {
      await until(() => !!card(el));
      key(el, 'F2');
      assert.equal(env.doc.activeElement, nameOf(el), 'F2 puts the typing in the name');
      nameOf(el).value = 'Which reader?';
      nameOf(el).dispatch('keydown', { key: 'Enter' });
      await until(() => env.state.files.get(PATH).includes("(q:Question {title: 'Which reader?'})"));
      assert.equal(env.state.files.get(PATH), NOTE.replace('Which device?', 'Which reader?'), 'nothing else changed');
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_rename
  test('Escape puts the name back and writes nothing; an empty name says why', async () => {
    const { env, el } = await tapped();
    try {
      await until(() => !!card(el));
      key(el, 'F2');
      nameOf(el).value = 'Something else';
      nameOf(el).dispatch('keydown', { key: 'Escape' });
      assert.equal(nameOf(el).value, 'Which device?');
      nameOf(el).value = '  ';
      nameOf(el).dispatch('keydown', { key: 'Enter' });
      await until(() => card(el).querySelector('[role="status"]').textContent !== '');
      assert.equal(card(el).querySelector('[role="status"]').textContent, 'A name cannot be empty');
      await settled();
      assert.equal(env.state.files.get(PATH), NOTE, 'nothing written');
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_read_only
  test('is not offered in reading view', async () => {
    const { env, el } = await tapped('reading');
    try {
      await until(() => !el.querySelector('.thoughtknot-details')?.hidden);
      await settled();
      assert.equal(card(el), null);
      key(el, 'F2');
      assert.equal(env.state.files.get(PATH), NOTE);
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_every_view
  test('in space, it sits beside the thing as the view shows it, and follows it as the view turns', async () => {
    const { env, el } = await tapped();
    try {
      await until(() => !!card(el));
      card(el).getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 60, right: 100, bottom: 60 });
      const vp = el.querySelector('.thoughtknot-viewport');
      vp.createDiv({ cls: 'thoughtknot-space-view' }); // the view in space, open over the drawing
      const pickedAt = (detail) => vp.dispatch('thoughtknot-space-picked-at', { detail });
      const at = () => [card(el).cssProps['--thoughtknot-edit-x'], card(el).cssProps['--thoughtknot-edit-y']];
      pickedAt({ key: 'q', x: 100, y: 50 });
      assert.deepEqual(at(), ['132px', '26px'], 'after the thing, level with its top');
      pickedAt({ key: 'q', x: 300, y: 200 });
      assert.deepEqual(at(), ['332px', '176px'], 'turned, it follows');
      pickedAt({ key: 'large', x: 10, y: 10 });
      assert.deepEqual(
        at(),
        ['8px', '8px'],
        'another thing picked there moves it to the corner, never beside that one',
      );
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_every_view
  test("on a phone, it sits at the top of the sheet's Details tab, and its keys work as ever", async () => {
    const { env, el } = await tapped('live', 'q', true);
    try {
      await until(() => !!card(el));
      const details = el.querySelector('.thoughtknot-phone-sheet .thoughtknot-details');
      assert.ok(details, 'the details are in the sheet');
      const pane = details.parentElement.children;
      assert.ok(card(el).parentElement === details.parentElement, 'in the Details tab');
      assert.ok(pane.indexOf(card(el)) === pane.indexOf(details) - 1, 'just above the details');
      assert.ok(card(el).classList.contains('is-in-sheet'));
      key(el, 'F2');
      assert.ok(env.doc.activeElement === nameOf(el), 'F2 opens its name');
    } finally {
      env.uninstall();
    }
  });
});
