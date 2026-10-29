// A filtered view for each corporate setting (editor spec §40, corporate_filtered_views). Behind a switch, off by
// default. On, a view is built from the explicit base grants with the setting's redactions applied, and an override
// applies only once a person confirms it. A view is always a part of what the grants give, never more.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { Permissions } from '@thoughtknot/core';
import { FILTERED_VIEWS_DEFAULT, filteredView } from '../src/index.ts';
import { setting } from './helpers.js';

const graphOf = (text) => Object.values(gs.worldFromStore(gs.read([text])))[0];

// Ann holds an asserted grant to the plan and the budget; her grant to the notes is only inferred, so gives nothing
const PERMISSIONS = graphOf(`// graph: permissions
(roger:Person {name: 'Roger', owner: TRUE}),
(ann:Person {name: 'Ann'}),
(editor:Role {name: 'Editor'}),
(rule:GrantRule {access: 'read', path: 'projects/'}),
(editor)-[:HAS_RULE]->(rule),
(ann)-[:HAS_ROLE]->(editor),
(g1:Grant {access: 'read', path: 'projects/plan.md', status: 'asserted'}),
(g2:Grant {access: 'read', path: 'projects/budget.md', status: 'asserted'}),
(g3:Grant {access: 'read', path: 'projects/notes.md', status: 'inferred'}),
(ann)-[:HOLDS]->(g1), (ann)-[:HOLDS]->(g2), (ann)-[:HOLDS]->(g3),
(g1)-[:FROM_RULE]->(rule), (g2)-[:FROM_RULE]->(rule), (g3)-[:FROM_RULE]->(rule)`);

const BASE = graphOf(`// graph: work
(plan:Doc {name: 'Plan'}),
(budget:Doc {name: 'Budget', tags: 'secret'}),
(notes:Doc {name: 'Notes'}),
(people:Doc {name: 'People', salary: 'band 4'}),
(plan)-[:CITES]->(budget),
(plan)-[:CITES]->(notes)`);

const GRANTS = {
  permissions: new Permissions(PERMISSIONS),
  person: 'ann',
  things: [
    { path: 'projects/plan.md', id: 'plan' },
    { path: 'projects/budget.md', id: 'budget' },
    { path: 'projects/notes.md', id: 'notes' },
    { path: 'hr/people.md', id: 'people' },
  ],
};
const ids = (g) => [...g.nodes.keys()].sort();

describe('corporate_filtered_views', () => {
  // proves: corporate_filtered_views
  test('with the switch off, nothing changes', () => {
    assert.equal(FILTERED_VIEWS_DEFAULT, false);
    assert.equal(filteredView(BASE, GRANTS, setting()), BASE);
    assert.equal(
      filteredView(BASE, GRANTS, setting(), { on: false, overrides: [{ id: 'x', redact: { label: 'Doc' } }] }),
      BASE,
    );
  });

  // proves: corporate_filtered_views
  test('with it on, a view is a subset of the base grants, narrowed by the setting', () => {
    const view = filteredView(BASE, GRANTS, setting(), { on: true });
    assert.deepEqual(ids(view), ['plan'], 'the inferred grant and the ungranted file give nothing; budget is redacted');
    assert.deepEqual(view.edges, []);
    for (const id of ids(view)) assert.ok(BASE.nodes.has(id));
  });

  // proves: corporate_filtered_views
  test('an override applies only after a person confirms it, and only ever narrows', () => {
    const wide = setting('label', { redact: [] });
    const overrides = [{ id: 'hide-plan', redact: { label: 'Doc' } }];
    assert.deepEqual(
      ids(filteredView(BASE, GRANTS, wide, { on: true, overrides })),
      ['budget', 'plan'],
      'not yet confirmed',
    );
    const confirmed = new Set(['hide-plan']);
    assert.deepEqual(ids(filteredView(BASE, GRANTS, wide, { on: true, overrides, confirmed })), []);
    assert.equal(BASE.nodes.size, 4, 'the base is never changed');
  });
});
