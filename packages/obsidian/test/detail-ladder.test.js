// The ladder of detail in the View menu (editor spec §53, cluster_detail_ladder). One control has three steps.
// - Overview folds each group into one box and bundles the links between groups.
// - Groups shows each thing in its group. All shows every link.
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
const rungs = (el) =>
  el.querySelectorAll('.thoughtknot-detail button').map((b) => [b.textContent, b.getAttribute('aria-checked')]);

describe('the ladder of detail', () => {
  // proves: cluster_detail_ladder
  test('the View menu opens on a ladder of Overview, Groups and All; a rung folds the three switches as one', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const { el } = await show(env, NOTE);
      labelled(el, 'View').click();
      const ladder = el.querySelector('.thoughtknot-detail');
      assert.equal(ladder.getAttribute('role'), 'radiogroup');
      assert.equal(ladder.getAttribute('aria-label'), 'Detail');
      assert.deepEqual(rungs(el), [
        ['Overview', 'false'],
        ['Groups', 'false'],
        ['All', 'true'],
      ]);
      turn(el, 'Overview').click();
      await until(() => !!node(el, 'fold_group_1'));
      assert.deepEqual(
        rungs(el).map(([, on]) => on),
        ['true', 'false', 'false'],
      );
      assert.equal(turn(el, 'Fold groups').getAttribute('aria-checked'), 'true', 'the switch under it follows');
      assert.equal(turn(el, 'Bundle links between groups').getAttribute('aria-checked'), 'true');
      turn(el, 'Groups').click();
      await until(() => !!thing(el, 'ann'));
      assert.deepEqual(
        rungs(el).map(([, on]) => on),
        ['false', 'true', 'false'],
      );
    } finally {
      env.uninstall();
    }
  });

  // proves: cluster_menu_plain
  test('the menu shows the ladder first, then every switch and the layout sliders in sight, none under More', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const { el } = await show(env, NOTE);
      labelled(el, 'View').click();
      const menu = el.querySelector('.thoughtknot-view-menu');
      assert.ok(!menu.querySelector('details'), 'nothing folded away under More');
      const kids = menu.children;
      const at = (cls) => kids.findIndex((k) => k.classList.contains(cls));
      assert.ok(at('thoughtknot-detail') < at('thoughtknot-switch'), 'the ladder comes first');
      const inSight = (name) =>
        kids.some((b) => b.classList.contains('thoughtknot-switch') && b.textContent.startsWith(name));
      assert.ok(['Fold busy things', 'Fold groups', 'Bundle links between groups'].every(inSight));
      assert.ok(inSight('Hide labels too small to read'));
      assert.ok(
        kids.some((k) => k.classList.contains('thoughtknot-layout-option')),
        'and the layout sliders',
      );
      turn(el, 'Overview').click();
      await until(() => !!node(el, 'fold_group_1'));
      assert.equal(turn(el, 'Fold groups').getAttribute('aria-checked'), 'true', 'a switch follows the ladder');
    } finally {
      env.uninstall();
    }
  });
});
