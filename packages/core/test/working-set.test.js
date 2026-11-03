// A working set (editor spec §60, discover_working_set): pinned things show together and export alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { pin, unpin, workingGraph } from '../src/working-set.ts';

const node = (kind) => [new Set([kind]), { name: kind }];
const G = new gs.Graph(
  new Map([
    ['a', node('X')],
    ['b', node('Y')],
    ['c', node('Z')],
    ['d', node('Z')],
  ]),
  [
    ['a', 'R', 'b', {}],
    ['b', 'R', 'd', {}],
    ['c', 'R', 'd', {}],
  ],
);

test('pinned things from three groups show together and export alone', () => {
  // proves: discover_working_set
  let set = pin([], ['a']);
  set = pin(set, ['c', 'a', 'b', 'gone']);
  assert.deepEqual(set, ['a', 'c', 'b', 'gone']);
  const sub = workingGraph(G, set);
  assert.deepEqual([...sub.nodes.keys()], ['a', 'b', 'c'], 'only pinned things the graph has, in its order');
  assert.deepEqual(
    sub.edges.map((e) => `${e[0]}>${e[2]}`),
    ['a>b'],
  );
  assert.equal(G.nodes.size, 4, 'the source graph is untouched');
  assert.deepEqual(unpin(set, ['c', 'gone']), ['a', 'b']);
});
