// A group opened from its box folds back, and is zoomed to (editor spec §53, cluster_fold_back). Opened, its outline
// has a button at its top right that folds it back into its box, and its name zooms the view to it. Both work from the
// keyboard as a box does. With every group open by the View menu, there is no box to fold back to, so no button.
// The built plugin, loaded against the stand-ins for the page, laying out with the real engine.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
/** Four people in two groups. */
const PEOPLE = [
  '// graph: kit',
  "(ann:Person {name: 'Ann'}), (bob:Person {name: 'Bob'}), (cy:Person {name: 'Cy'}), (dee:Person {name: 'Dee'}),",
  '(ann)-[:ASKS]->(cy), (bob)-[:ASKS]->(dee)',
].join('\n');
const GROUPS = `// graph: kit_style · STYLE kit
(n1:Nudge {word: 'group', thing: 'ann', group: 'Makers'}),
(n2:Nudge {word: 'group', thing: 'bob', group: 'Makers'}),
(n3:Nudge {word: 'group', thing: 'cy', group: 'Helpers'}),
(n4:Nudge {word: 'group', thing: 'dee', group: 'Helpers'})`;
const NOTE = ['# Kit', '', fence(PEOPLE), '', fence(GROUPS), ''].join('\n');

const node = (el, id) => el.querySelectorAll('g.node').find((g) => g.getAttribute('id') === id);
const thing = (el, key) => el.querySelector(`g.node[data-key="${key}"]`);
const fold = (el, f) => el.querySelectorAll('[data-fold]').find((g) => g.getAttribute('data-fold') === f);
const turn = (el, name) =>
  el.querySelectorAll('.thoughtknot-view-menu button').find((b) => b.textContent.startsWith(name));

describe('a group opened from its box', () => {
  // proves: cluster_fold_back
  test('has a button that folds it back into its box, and its name zooms to it, from the keyboard too', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const { el } = await show(env, NOTE);
      labelled(el, 'View').click();
      turn(el, 'Fold groups').click();
      await until(() => !!node(el, 'fold_group_1'));
      const vp = el.querySelector('.thoughtknot-viewport');
      const press = (target) => vp.dispatch('keydown', { key: 'Enter', target });
      press(node(el, 'fold_group_1'));
      await until(() => !!thing(el, 'ann'));
      const back = el.querySelector('.thoughtknot-fold-back');
      assert.equal(back?.getAttribute('data-fold'), 'group:Makers');
      assert.equal(back.getAttribute('aria-label'), 'Fold Makers back into one box.');
      assert.equal(back.getAttribute('role'), 'button');
      assert.equal(el.querySelector('g.cluster[data-refold]')?.getAttribute('data-refold'), 'group:Makers');
      assert.ok(!fold(el, 'zoom:Helpers'), 'a group still folded has no name to zoom to');
      // its name zooms the view to it: here, where the page has no layout, every box fills the view, so it zooms out
      labelled(el, 'Zoom in').click();
      const svg = el.querySelector('.thoughtknot-viewport svg'),
        wide = Number(svg.getAttribute('width'));
      assert.equal(fold(el, 'zoom:Makers')?.getAttribute('aria-label'), 'Zoom to Makers.');
      press(fold(el, 'zoom:Makers'));
      await until(() => Number(svg.getAttribute('width')) !== wide);
      assert.ok(thing(el, 'ann'), 'zoomed to, it stays open');
      // the button folds it back
      press(el.querySelector('.thoughtknot-fold-back'));
      await until(() => !!node(el, 'fold_group_1'));
      assert.ok(!thing(el, 'ann') && !el.querySelector('.thoughtknot-fold-back'), 'folded back, with no button');
      assert.ok(node(el, 'fold_group_2'), 'the other group stays folded');
    } finally {
      env.uninstall();
    }
  });

  // proves: cluster_fold_back
  test('with every group open by the View menu, no group has a button to fold it back', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const { el } = await show(env, NOTE);
      await until(() => !!thing(el, 'ann'));
      assert.ok(el.querySelector('g.cluster'), 'the groups are drawn');
      assert.ok(!el.querySelector('.thoughtknot-fold-back') && !el.querySelector('g.cluster[data-refold]'));
    } finally {
      env.uninstall();
    }
  });
});
