// Comparing two sets of things (editor spec §60, discover_compare_sets).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSets } from '../src/compare-sets.ts';

test('two lenses compared give the three sets exactly', () => {
  // proves: discover_compare_sets
  assert.deepEqual(compareSets(['a', 'b', 'c', 'c'], ['c', 'd', 'a']), {
    onlyA: ['b'],
    onlyB: ['d'],
    both: ['a', 'c'],
  });
  assert.deepEqual(compareSets([], []), { onlyA: [], onlyB: [], both: [] });
});
