// Grouping a drawing by what its things say (editor spec §25, untangle_group_by): group-by.ts, and the View menu's
// state of it (view-switches.ts). Roger, 24 Oct 2026: "Group by" a property, or none, in 2D and 3D alike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';
import { BY_KIND, groupChoices, groupValues } from '../src/group-by.ts';
import { ViewState } from '../src/view-switches.ts';

const TEAM = `// graph: g
(ann:Person {name: 'Ann', team: 'Red', id_code: 'a1'}),
(bob:Person {name: 'Bob', team: 'Red', id_code: 'b2'}),
(cy:Person {name: 'Cy', team: 'Blue', id_code: 'c3'}),
(dee:Robot {name: 'Dee', team: 'Blue', id_code: 'd4'}),
(eve:Robot {name: 'Eve', id_code: 'e5'}),
(ann)-[:KNOWS]->(bob), (bob)-[:KNOWS]->(cy), (cy)-[:KNOWS]->(dee), (dee)-[:KNOWS]->(eve)`;
const WRITTEN = `// graph: g_style · STYLE g
(n1:Nudge {word: 'group', thing: 'ann', group: 'Friends'}),
(n2:Nudge {word: 'group', thing: 'eve', group: 'Friends'})`;

/** The drawing of graph g as its style draws it, and the note as read. */
function styledOf(...texts) {
  const reading = readNote(texts);
  const { style } = readStyle(texts, 'g', reading);
  return { drawing: styledDrawing(reading.graphs.get('g'), style, reading.world.g), reading };
}

const off = { labels: true, hubs: false, groups: false, merge: false, engine: false };
const groupNudges = (d) => (d.nudges ?? []).filter((n) => n.word === 'group').map((n) => `${n.group}:${n.thing}`);

// proves: untangle_group_by
test('offers kind and each property that sorts the things, never one whose every value differs', () => {
  const { drawing, reading } = styledOf(TEAM);
  assert.deepEqual(groupChoices(reading, drawing), [BY_KIND, 'team']);
  assert.deepEqual(
    [...groupValues(reading, drawing, 'team')],
    [
      ['ann', 'Red'],
      ['bob', 'Red'],
      ['cy', 'Blue'],
      ['dee', 'Blue'],
    ],
  );
  assert.equal(groupValues(reading, drawing, BY_KIND).get('dee'), 'Robot');
});

// proves: untangle_group_by
test('grouped by a property, each value is a group in place of the written ones; grouped by none, there are none', () => {
  const { drawing, reading } = styledOf(TEAM, WRITTEN);
  const state = new ViewState(off);
  assert.deepEqual(groupNudges(state.folded(drawing)), ['Friends:ann', 'Friends:eve'], 'as written, to start');
  state.groupBy = { by: 'team', values: groupValues(reading, drawing, 'team') };
  const byTeam = state.folded(drawing);
  assert.deepEqual(groupNudges(byTeam), ['Red:ann', 'Red:bob', 'Blue:cy', 'Blue:dee'], 'eve has no team: in none');
  assert.deepEqual(
    state.plan.groups.map(([label, things]) => [label, things]),
    [
      ['Red', ['ann', 'bob']],
      ['Blue', ['cy', 'dee']],
    ],
  );
  state.groupBy = null;
  assert.deepEqual(groupNudges(state.folded(drawing)), [], 'no groups at all, the written ones too');
  state.groupBy = undefined;
  assert.deepEqual(groupNudges(state.folded(drawing)), ['Friends:ann', 'Friends:eve'], 'back as written');
});
