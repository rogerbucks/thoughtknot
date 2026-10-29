// The view picker on a drawing's card (editor spec §36, view_types_offered). Diagram type also lists the views drawn as
// marks, each over the same graph. Choosing one writes it into the style graph. The card then draws the graph as that
// view, said by its title.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, settled, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
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
/** The views shown at first, then those under More views (Q-12, option B). */
const FIRST = ['Force', 'Matrix', 'Treemap', 'Ego'];
const MORE = ['Chord', 'Density', 'Block', 'Plan', 'Centroid', 'Containment', 'Arc', 'Hive', 'Grid'];
const VIEWS = [...FIRST, ...MORE];

async function card(note) {
  const env = await load({ files: { [PATH]: note } });
  const { el } = await show(env, note, 0);
  return { env, el };
}

describe('the view picker', () => {
  // proves: view_types_offered
  test('offers each listed view over the same graph, folded with the diagram types', async () => {
    const { env, el } = await card(noteOf(ORG));
    try {
      const views = el.querySelector('.thoughtknot-view-list');
      assert.ok(views, 'offered on the card');
      assert.equal(views.getAttribute('aria-label'), 'Views');
      assert.equal(views.hidden, true, 'folded away until asked');
      labelled(el, 'Diagram type').click();
      assert.equal(views.hidden, false);
      assert.deepEqual(
        views.querySelectorAll('button').map((b) => b.textContent),
        VIEWS,
      );
    } finally {
      env.uninstall();
    }
  });

  // proves: view_types_offered
  test('shows four views at first, beside Timeline and Radial among the types, and folds the rest under More views', async () => {
    const { env, el } = await card(noteOf(ORG));
    try {
      labelled(el, 'Diagram type').click();
      const views = el.querySelector('.thoughtknot-view-list');
      const fold = views.querySelector('.thoughtknot-view-more details');
      assert.ok(fold, 'the rest folded');
      assert.equal(fold.open, false, 'closed while none of them is drawn');
      assert.equal(fold.querySelector('summary').textContent, 'More views');
      assert.deepEqual(
        fold.querySelectorAll('button').map((b) => b.textContent),
        MORE,
      );
      const types = el.querySelectorAll('.thoughtknot-type-list button').map((b) => b.textContent);
      assert.ok(
        ['Timeline', 'Radial'].every((t) => types.includes(t)),
        types.join(', '),
      );
    } finally {
      env.uninstall();
    }
  });

  // proves: view_types_offered
  test('opens More views when the view drawn now is one of them, so it is never hidden', async () => {
    const { env, el } = await card(noteOf(ORG, styled("(d1:Diagram {type: 'thoughtknot.diagrams.chord'})")));
    try {
      await until(() => el.querySelector('svg g.node[data-key]'));
      labelled(el, 'Diagram type').click();
      assert.equal(el.querySelector('.thoughtknot-view-more details').open, true);
    } finally {
      env.uninstall();
    }
  });

  // proves: view_types_offered
  test('a view chosen is written into the style graph, never the data, and the card draws the graph as it', async () => {
    const { env, el } = await card(noteOf(ORG));
    try {
      labelled(el, 'Diagram type').click();
      el.querySelectorAll('.thoughtknot-view-list button')
        .find((b) => b.textContent === 'Matrix')
        .click();
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
      labelled(el, 'Diagram type').click();
      const pressed = el
        .querySelectorAll('.thoughtknot-view-list button')
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
