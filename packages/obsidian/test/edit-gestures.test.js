// What a double click and a drop do where things are drawn (editor spec §72, edit_gestures). The built plugin, loaded
// against the stand-ins for the page. Roger, 5 Nov 2026 (Q-19): one way of editing in every view.
// - A double click on a thing opens its name for typing. The second click's recentre waits for it, and is let go.
// - A double click on empty space adds a thing, its name open in the card drawn next. Ctrl+Z takes it back.
// - In reading view, a double click on empty space zooms, as ever, and writes nothing.
// - A box dropped in the middle of another box links the two, and goes back where it was. Ctrl+Z takes the link back.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, settled, until } from './host/load-plugin.js';
import { NOTE, PATH, showIn } from './host/card-notes.js';
import { PATH as TEAM_PATH, TEAM, card as dragCard, mouse, noteOf } from './host/drag-steps.js';
import { clock } from './host/quick-info-steps.js';

before(() => build());

const thing = (el, key) => el.querySelectorAll('g.node').find((g) => g.getAttribute('data-key') === key);
const vpOf = (el) => el.querySelector('.thoughtknot-viewport');
const click = (el, g, id = 3) => {
  const init = { target: g, pointerId: id, pointerType: 'mouse', clientX: 20, clientY: 20, button: 0 };
  vpOf(el).dispatch('pointerdown', init);
  vpOf(el).dispatch('pointerup', { ...init, clientX: 21 });
};
const nameOf = (el) => el.querySelector('.thoughtknot-edit-card input.thoughtknot-edit-name');
const note = (env) => env.state.files.get(PATH);

/** The note's card in `view`, drawn and settled. */
async function shown(view = 'live') {
  const env = await load({ files: { [PATH]: NOTE } });
  const el = await showIn(env, view);
  await until(() => !!thing(el, 'q'));
  await settled();
  return { env, el };
}

describe('double clicks and drops where things are drawn', () => {
  // proves: edit_gestures, edit_click_rule
  test('a double click on a thing opens its name, and its second click does not recentre', async () => {
    const { env, el } = await shown();
    try {
      const q = thing(el, 'q');
      click(el, q);
      await until(() => !!nameOf(el));
      assert.ok(env.doc.activeElement !== nameOf(el), 'one click selects, and starts no typing');
      const before = vpOf(el).cssProps['--thoughtknot-x'];
      const timers = clock(env); // the second click's recentre waits on a timer, which the double click clears
      click(el, q, 4);
      vpOf(el).dispatch('dblclick', { target: q, clientX: 20, clientY: 20 });
      assert.ok(env.doc.activeElement === nameOf(el), 'the name is open for typing');
      timers.fire();
      assert.equal(vpOf(el).cssProps['--thoughtknot-x'], before, 'the view stayed where it was');
      assert.equal(note(env), NOTE, 'nothing written until Enter');
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_gestures, edit_undo
  test('a double click on empty space adds a thing there, its name open next; Ctrl+Z takes it back', async () => {
    const { env, el } = await shown();
    try {
      const ev = vpOf(el).dispatch('dblclick', { target: vpOf(el), clientX: 2, clientY: 2 });
      assert.ok(ev.defaultPrevented, 'taken, not zoomed');
      await until(() => note(env).includes("(new_thing:Question {title: 'New thing'})"));
      const next = await showIn(env, 'live');
      await until(() => nameOf(next)?.value === 'New thing');
      assert.ok(env.doc.activeElement === nameOf(next), 'its name is ready to type');
      vpOf(next).dispatch('keydown', { key: 'z', ctrlKey: true });
      await until(() => note(env) === NOTE);
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_gestures, edit_read_only
  test('in reading view, a double click on empty space zooms and writes nothing', async () => {
    const { env, el } = await shown('reading');
    try {
      const ev = vpOf(el).dispatch('dblclick', { target: vpOf(el), clientX: 2, clientY: 2 });
      assert.ok(ev.defaultPrevented, 'the zoom takes it');
      await settled();
      assert.equal(note(env), NOTE);
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_gestures, edit_every_view
  test('what the view in space asks for is written as in 2D, and nothing is taken in reading view', async () => {
    const { env, el } = await shown();
    try {
      const ask = (detail) => vpOf(el).dispatch('thoughtknot-space-edit', { detail });
      click(el, thing(el, 'q'));
      await until(() => !!nameOf(el));
      assert.ok(ask({ rename: 'q' }).defaultPrevented, 'taken');
      assert.ok(env.doc.activeElement === nameOf(el), 'the name is open for typing');
      assert.ok(ask({ add: true }).defaultPrevented);
      await until(() => note(env).includes("{title: 'New thing'}"));
      const read = await showIn(env, 'reading');
      await until(() => !!thing(read, 'q'));
      await settled();
      assert.ok(
        !read.querySelector('.thoughtknot-viewport').dispatch('thoughtknot-space-edit', { detail: { add: true } })
          .defaultPrevented,
        'not taken where nothing is written',
      );
    } finally {
      env.uninstall();
    }
  });

  // proves: edit_gestures, edit_undo
  test('a box dropped in the middle of another links the two, and goes back; Ctrl+Z takes the link back', async () => {
    const before = noteOf(TEAM);
    const { env, el, vp, boxOf, placeOf, at } = await dragCard(before);
    try {
      const ann = boxOf('ann'),
        onCy = at(placeOf('cy').x, placeOf('cy').y);
      vp.dispatch('pointerdown', mouse(1, ann, at(placeOf('ann').x, placeOf('ann').y)));
      vp.dispatch('pointermove', mouse(1, vp, onCy));
      assert.equal(el.querySelector('.thoughtknot-move-hint').textContent, 'Let go to link Ann to Cy');
      assert.ok(boxOf('cy').classList.contains('is-landing'));
      vp.dispatch('pointerup', mouse(1, vp, onCy));
      assert.equal(ann.getAttribute('transform'), null, 'the box is back where it was');
      await until(() => env.state.files.get(TEAM_PATH).includes('(ann)-[:ASKS]->(cy)'));
      assert.ok(!/:Nudge /.test(env.state.files.get(TEAM_PATH)), 'linked, not moved');
      const toast = el.querySelectorAll('.thoughtknot-undo-toast').find((t) => !t.classList.contains('is-hidden'));
      assert.equal(toast?.querySelector('.thoughtknot-undo-said').textContent, 'Linked to Cy');
      toast.parentElement.dispatch('keydown', { key: 'z', ctrlKey: true });
      await until(() => env.state.files.get(TEAM_PATH) === before);
    } finally {
      env.uninstall();
    }
  });
});
