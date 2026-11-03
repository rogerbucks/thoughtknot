// A bulk edit (editor spec §60, discover_bulk_edit): shown first, written as one change, rolled back in one step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { applyBulk, bulkPlan } from '../src/bulk-edit.ts';

const node = (props) => [new Set(['Task']), props];
const G = new gs.Graph(
  new Map([
    ['a', node({ s: 'open' })],
    ['b', node({ s: 'done' })],
    ['c', node({})],
  ]),
  [],
);

test('a bulk edit shows every change first, writes them as one change, and rolls back in one step', () => {
  // proves: discover_bulk_edit
  const plan = bulkPlan(G, ['a', 'b', 'c', 'gone', 'b'], 's', 'done');
  assert.deepEqual(
    plan.changes.map((c) => [c.thing, c.before, c.after]),
    [
      ['a', 'open', 'done'],
      ['c', undefined, 'done'],
    ],
  );
  assert.match(plan.label, /2 things/);
  assert.equal(G.p('a').s, 'open', 'planning writes nothing');
  const { graph, undo } = applyBulk(G, plan);
  assert.deepEqual(
    ['a', 'b', 'c'].map((k) => graph.p(k).s),
    ['done', 'done', 'done'],
  );
  assert.equal(G.p('c').s, undefined, 'the graph given is untouched');
  const back = applyBulk(graph, undo).graph;
  assert.deepEqual(
    ['a', 'b', 'c'].map((k) => back.p(k).s),
    ['open', 'done', undefined],
  );
  assert.ok(!('s' in back.p('c')), 'a property that was not there is removed again');
});
