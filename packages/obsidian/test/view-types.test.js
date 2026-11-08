// The view picker on a drawing's card (editor spec §36, view_types_offered). The side rail lists the views drawn as
// marks among the diagram types, in groups, each over the same graph (type_rail). Choosing one writes it into the
// style graph. The card then draws the graph as that view, said by its title.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, settled, until } from './host/load-plugin.js';
import { fence, groupOf, pickType, typeButton } from './host/notes.js';
import { show } from './host/view-notes.js';
import { tapKey } from './host/inspector-steps.js';

before(() => build());

const PATH = 'Some note.md';
const ORG = `// graph: org
(ada:Person {name: 'Ada'}),
(bea:Person {name: 'Bea'}),
(cy:Person {name: 'Cy'}),
(ada)-[:MANAGES]->(bea),
(ada)-[:MANAGES]->(cy)`;
const styled = (...lines) => ['// graph: org_style · STYLE org', ...lines].join('\n');
const noteOf = (...blocks) => ['# Org', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');
/** Each group of the rail, as its list shows it: the core's types and the views among them (type_rail). */
const GROUPS = {
  links: ['Network', 'Force', 'Radial', 'Tree', 'Flow', 'Lanes', 'Hive', 'Arc', 'Chord', 'Centroid', 'Pole', 'Ego'],
  areas: ['Treemap', 'Containment', 'Block', 'Plan', 'Grid', 'Density'],
  data: ['Matrix', 'Timeline', 'Map', 'Table'],
};
/** The words of the rows of the list of `group` in the card `el`. */
const rows = (el, group) =>
  el
    .querySelectorAll('.thoughtknot-rail-list')
    .find((l) => l.getAttribute('data-group') === group)
    .querySelectorAll('button')
    .map((b) => b.textContent);

async function card(note) {
  const env = await load({ files: { [PATH]: note } });
  const { el } = await show(env, note, 0);
  return { env, el };
}

describe('the view picker', () => {
  // proves: view_types_offered, type_rail
  test('offers each listed view over the same graph, among the diagram types, in three groups', async () => {
    const { env, el } = await card(noteOf(ORG));
    try {
      for (const [group, names] of Object.entries(GROUPS)) assert.deepEqual(rows(el, group), names, group);
      const list = typeButton(el, 'Hive').parentElement.parentElement;
      assert.equal(list.hidden, true, 'folded away until asked');
      groupOf(el, 'Hive').click();
      assert.equal(list.hidden, false);
    } finally {
      env.uninstall();
    }
  });

  // proves: view_types_offered, type_rail
  test('the view drawn now is never hidden: its group says it, with its picture', async () => {
    const { env, el } = await card(noteOf(ORG, styled("(d1:Diagram {type: 'thoughtknot.diagrams.chord'})")));
    try {
      await until(() => el.querySelector('svg g.node[data-key]'));
      assert.equal(groupOf(el, 'Chord').getAttribute('aria-label'), 'Links: Chord drawn now');
      assert.ok(groupOf(el, 'Chord').hasClass('is-now'));
    } finally {
      env.uninstall();
    }
  });

  // proves: view_types_offered
  test('a view chosen is written into the style graph, never the data, and the card draws the graph as it', async () => {
    const { env, el } = await card(noteOf(ORG));
    try {
      pickType(el, 'Matrix');
      await until(() => /:Diagram /.test(env.state.files.get(PATH)));
      await settled();
      const now = env.state.files.get(PATH);
      assert.ok(now.includes(fence(ORG)), 'the data block untouched');
      assert.match(now, /STYLE org[\s\S]*\(diagram_1:Diagram \{type: 'thoughtknot\.diagrams\.matrix'\}\)/);
      assert.match(env.state.notices.at(-1), /drawn as Matrix/);
    } finally {
      env.uninstall();
    }
  });

  // proves: view_types_offered
  test('a view saved is drawn as the card’s own drawing of its marks, said by its title and marked as drawn now', async () => {
    const { env, el } = await card(noteOf(ORG, styled("(d1:Diagram {type: 'thoughtknot.diagrams.treemap'})")));
    try {
      await until(() => el.querySelector('svg g.node[data-key]'));
      assert.equal(el.querySelector('.thoughtknot-plugin-picture'), null, 'not a picture to look at');
      assert.match(el.querySelector('.thoughtknot-type-drawn').textContent, /Drawn as Treemap/);
      const pressed = el
        .querySelectorAll('.thoughtknot-rail-list button')
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.textContent);
      assert.deepEqual(pressed, ['Treemap']);
    } finally {
      env.uninstall();
    }
  });

  // proves: projections_all_on
  test('in a view, a thing is chosen and its details opened as in a network', async () => {
    const { env, el } = await card(noteOf(ORG, styled("(d1:Diagram {type: 'thoughtknot.diagrams.hive'})")));
    try {
      await until(() => el.querySelector('svg g.node[data-key]'));
      const keys = el.querySelectorAll('svg g.node[data-key]').map((g) => g.getAttribute('data-key'));
      assert.deepEqual([...keys].sort(), ['ada', 'bea', 'cy']);
      tapKey(el, 'bea');
      const bea = el.querySelectorAll('g.node').find((g) => g.getAttribute('data-key') === 'bea');
      assert.ok(bea.hasClass('is-selected'));
      assert.equal(bea.getAttribute('aria-pressed'), 'true');
      assert.ok(el.querySelectorAll('svg g.edge[data-link]').length >= 2, 'its links too');
    } finally {
      env.uninstall();
    }
  });
});
