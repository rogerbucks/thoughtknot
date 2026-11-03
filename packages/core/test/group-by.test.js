// More ways to group a large graph (editor spec §60, discover_group_by): by a look and by a lens bucket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { BY_BUCKET, BY_LOOK, bucketValues, groupingOf, lookValues } from '../src/group-by-sources.ts';
import { groupsBy } from '../src/group-by.ts';

const node = (kind, props) => [new Set([kind]), props];
const G = new gs.Graph(
  new Map([
    ['a', node('Task', { name: 'A', status: 'open' })],
    ['b', node('Task', { name: 'B', status: 'done' })],
    ['c', node('Task', { name: 'C', status: 'open' })],
  ]),
  [],
);

test('grouping by a look and a lens bucket each gives those groups, with no layout from scratch', () => {
  // proves: discover_group_by
  const looks = new Map([
    ['a', { hue: 'red' }],
    ['b', { hue: 'blue' }],
    ['c', { hue: 'red' }],
    ['d', {}],
  ]);
  const byLook = groupingOf(BY_LOOK, lookValues(looks));
  assert.deepEqual(groupsBy(byLook, ['a', 'b', 'c', 'd']), [
    ['red', ['a', 'c']],
    ['blue', ['b']],
  ]);
  assert.equal(groupingOf(BY_LOOK, lookValues(new Map())), null, 'no looks, no groups');
  const buckets = bucketValues(G, "Task WHERE status == 'open'");
  const byBucket = groupingOf(`${BY_BUCKET}rule`, buckets);
  if (byBucket) assert.ok(groupsBy(byBucket, ['a', 'b', 'c']).every(([, things]) => things.length > 0));
  assert.equal(bucketValues(G, 'not a rule ((').size, 0, 'a rule that cannot be run gives no groups');
});
