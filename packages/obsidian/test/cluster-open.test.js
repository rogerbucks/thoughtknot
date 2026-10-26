// A folded group opened by zooming in on it (editor spec §53, cluster_opens). Zooming in until its box fills the view
// opens it, as a tap on it does. Zooming out, or zooming in elsewhere, leaves it folded.
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
const turn = (el, name) =>
  el.querySelectorAll('.thoughtknot-view-menu button').find((b) => b.textContent.startsWith(name));

describe('a folded group opened by zooming in', () => {
  // proves: cluster_opens
  test('zooming in on a folded box that fills the view opens it; zooming out over it does not', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const { el } = await show(env, NOTE);
      labelled(el, 'View').click();
      turn(el, 'Fold groups').click();
      await until(() => !!node(el, 'fold_group_1'));
      const vp = el.querySelector('.thoughtknot-viewport');
      const wheel = (deltaY) =>
        vp.dispatch('wheel', { target: node(el, 'fold_group_1'), deltaY, ctrlKey: true, clientX: 10, clientY: 10 });
      wheel(100);
      await new Promise((r) => setTimeout(r, 50));
      assert.ok(node(el, 'fold_group_1') && !thing(el, 'ann'), 'zooming out leaves it folded');
      wheel(-100);
      await until(() => !!thing(el, 'ann'));
      assert.ok(node(el, 'fold_group_2'), 'the other group stays folded');
    } finally {
      env.uninstall();
    }
  });

  // proves: cluster_opens
  test('a folded group the 3D view opens, named by its box on screen, opens here as a tap on it does', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const { el } = await show(env, NOTE);
      labelled(el, 'View').click();
      turn(el, 'Fold groups').click();
      await until(() => !!node(el, 'fold_group_1'));
      const box = node(el, 'fold_group_1');
      box.dispatch('thoughtknot-space-unfold', { target: box, detail: 'fold_group_1' });
      await until(() => !!thing(el, 'ann'));
      assert.ok(node(el, 'fold_group_2'), 'only that group opens');
    } finally {
      env.uninstall();
    }
  });
});
