// Queries merged (editor spec ES§75, ai_query_merge). Two or more are joined so a thing shows when it matches all of
// them or any of them, the person choosing which. The merged query is shown and editable like any other. Each part can
// be taken out again, and each highlight has its own mark, named in a legend.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  queryEdited,
  queryJoined,
  queryKeeps,
  queryLegend,
  queryOf,
  queryPart,
  queryPartOut,
  queryShown,
  queryView,
  queriesMerged,
  querySaid,
} from '../src/filter-query.ts';
import { BOXES, CHOICES, DEAR, EDGES, G, LATE, NONE } from './filter-query-fixtures.js';

const late = queryOf('q1', 'late tasks', LATE);
const dear = queryOf('q2', 'dear tasks', DEAR);
const keeps = (q) => [...queryKeeps(G, q, CHOICES)].sort();

test('ai_query_merge: merged as all-of or any-of, each keeps the right things', () => {
  const all = queriesMerged('m1', [late, dear], 'all');
  assert.deepEqual(keeps(all), ['roof']);
  const any = queriesMerged('m1', [late, dear], 'any');
  assert.deepEqual(keeps(any), ['floor', 'roof', 'walls']);
  assert.deepEqual(keeps(queryJoined(all, 'any')), keeps(any), 'the person changes which');
  assert.ok('refused' in queriesMerged('m1', [late], 'all'), 'one query is not a merge');
});

test('ai_query_merge: the merged query is shown and editable like any other', () => {
  const all = queriesMerged('m1', [late, dear], 'all');
  assert.match(querySaid(all), /late tasks/);
  assert.match(querySaid(all), /dear tasks/);
  assert.deepEqual([...queryView(BOXES, EDGES, NONE, all, G, CHOICES).forward.things], ['roof']);
  const changed = queryPart(all, 'q2', (p) => queryEdited(p, { ...DEAR, tests: [{ ...DEAR.tests[0], value: '10' }] }));
  assert.deepEqual(keeps(changed), ['floor', 'roof'], 'a part edited in place');
  assert.ok('refused' in queryPart(all, 'nope', (p) => p));
});

test('ai_query_merge: a part taken out leaves the rest', () => {
  const three = queriesMerged('m1', [late, dear, queryOf('q3', 'tasks', { ...LATE, tests: [] })], 'all');
  const two = queryPartOut(three, 'q3');
  assert.deepEqual(
    two.parts.map((p) => p.id),
    ['q1', 'q2'],
  );
  const one = queryPartOut(two, 'q2');
  assert.equal(one.id, 'q1', 'with one part left, it is that query again');
  assert.deepEqual(one.draft, LATE);
});

test('ai_query_merge: each highlight has its own mark, named in a legend', () => {
  const lit = queryShown(queriesMerged('m1', [late, dear], 'any'), 'highlight');
  const legend = queryLegend(lit);
  assert.deepEqual(
    legend.map((l) => l.said),
    ['late tasks', 'dear tasks'],
  );
  assert.notEqual(legend[0].mark.badge, legend[1].mark.badge, 'each its own badge');
  const view = queryView(BOXES, EDGES, NONE, lit, G, CHOICES);
  assert.deepEqual(
    view.marks.get('roof').map((m) => m.badge),
    legend.map((l) => l.mark.badge),
    'a thing both find has both marks',
  );
  assert.deepEqual(
    view.marks.get('walls').map((m) => m.badge),
    [legend[1].mark.badge],
  );
});
