// Names for groups (editor spec §60, discover_group_names): suggestions wait and change nothing until applied.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { applyGroupName, proposeGroupNames } from '../src/group-names.ts';

const G = new gs.Graph(
  new Map([
    ['a', [new Set(['T']), {}]],
    ['b', [new Set(['T']), {}]],
    ['c', [new Set(['T']), {}]],
  ]),
  [],
);
const groups = [
  { id: 'g1', things: ['a', 'b'] },
  { id: 'g2', things: ['c'] },
  { id: 'g3', things: [] },
];

test('group names suggested by an AI wait in the review lens and change nothing until applied', () => {
  // proves: discover_group_names
  const waiting = proposeGroupNames(groups, (g) =>
    g.id === 'g1'
      ? { name: ' Pair ', summary: 'Two linked things' }
      : g.id === 'g2'
        ? { name: 42, summary: 'x' }
        : { name: '', summary: 'y' },
  );
  assert.deepEqual(waiting, [{ group: 'g1', name: 'Pair', summary: 'Two linked things', status: 'waiting' }]);
  assert.equal(G.p('a').group_name, undefined, 'a waiting suggestion changes nothing');
  const applied = applyGroupName(G, groups[0], waiting[0]);
  assert.equal(applied.p('a').group_name, 'Pair');
  assert.equal(applied.p('c').group_name, undefined);
  assert.equal(G.p('a').group_name, undefined, 'the graph given is untouched');
});
