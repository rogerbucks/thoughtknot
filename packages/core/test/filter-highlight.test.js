// A query shown as a filter or as a highlight (editor spec ES§75, ai_query_highlight). The person picks which and
// switches at any time. A filter fades or hides what it does not keep. A highlight keeps every thing in sight and marks
// what it finds with a badge as well as colour. Neither moves a thing or writes to the note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryOf, queryShown, queryView } from '../src/filter-query.ts';
import { BOXES, CHOICES, EDGES, G, LATE, NONE, NOTE } from './filter-query-fixtures.js';

const late = queryOf('q1', 'late tasks', LATE);

test('ai_query_highlight: a query starts as a filter and switches to a highlight and back at any time', () => {
  assert.equal(late.show, 'filter');
  const lit = queryShown(late, 'highlight');
  assert.equal(lit.show, 'highlight');
  assert.equal(queryShown(lit, 'filter').show, 'filter');
  assert.deepEqual(queryShown(lit, 'filter').draft, LATE, 'switching changes only how it is shown');
  const locked = { ...late, locked: true };
  assert.equal(queryShown(locked, 'highlight').show, 'highlight', 'a locked query is still switched');
});

test('ai_query_highlight: a filter fades what it does not keep, or hides it if asked', () => {
  const faded = queryView(BOXES, EDGES, NONE, late, G, CHOICES);
  assert.deepEqual([...faded.forward.things].sort(), ['floor', 'roof']);
  assert.deepEqual([...faded.hidden.things], [], 'faded, nothing is hidden');
  assert.equal(faded.marks.size, 0, 'a filter marks nothing');
  const hidden = queryView(BOXES, EDGES, NONE, queryShown(late, 'filter', true), G, CHOICES);
  assert.deepEqual([...hidden.hidden.things].sort(), ['sam', 'walls']);
});

test('ai_query_highlight: a highlight hides and fades nothing, and marks what it finds by a badge, not colour alone', () => {
  const lit = queryView(BOXES, EDGES, NONE, queryShown(late, 'highlight', true), G, CHOICES);
  assert.equal(lit.forward, null, 'nothing comes forward, so nothing fades');
  assert.deepEqual([...lit.hidden.things], [], 'a highlight hides nothing, even with hide asked');
  assert.deepEqual([...lit.hidden.edges], []);
  assert.deepEqual([...lit.marks.keys()].sort(), ['floor', 'roof']);
  const mark = lit.marks.get('roof')[0];
  assert.ok(mark.badge, 'each mark has a badge');
  assert.ok(mark.colour, 'and a colour');
  // what the legend hides stays hidden either way
  const legend = { forward: null, hidden: { things: new Set(['walls']), edges: new Set([1]) } };
  const both = queryView(BOXES, EDGES, legend, queryShown(late, 'highlight'), G, CHOICES);
  assert.deepEqual([...both.hidden.things], ['walls']);
});

test('ai_query_highlight: neither moves a thing nor writes to the note', () => {
  const before = structuredClone(BOXES);
  const note = NOTE;
  for (const q of [late, queryShown(late, 'highlight'), queryShown(late, 'filter', true)]) {
    const view = queryView(BOXES, EDGES, NONE, q, G, CHOICES);
    assert.deepEqual(Object.keys(view).sort(), ['forward', 'hidden', 'marks'], 'it gives what is shown, never a place');
  }
  assert.deepEqual(BOXES, before, 'no box has moved');
  assert.equal(NOTE, note, 'the note is as it was');
});
