// The ready-made gap lenses (editor spec §60, discover_gap_lenses): each finds its planted cases in a test graph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { missingNeeds, nearDuplicates, stale, unlinked, unusualNumbers } from '../src/gap-lenses.ts';

const node = (labels, props) => [new Set(labels), props];
const G = new gs.Graph(
  new Map([
    ['a', node(['Task'], { name: 'Write report', owner: 'Ann', cost: 10, updated: '2026-10-01' })],
    ['b', node(['Task'], { name: 'Write  Report!', owner: 'Bob', cost: 11, updated: '2025-01-01' })],
    ['c', node(['Task'], { name: 'Ship it', owner: 'Cy', cost: 12 })],
    ['d', node(['Task'], { name: 'Test it', owner: 'Di', cost: 9 })],
    ['e', node(['Task'], { name: 'Plan', cost: 900 })],
    ['f', node(['Note'], { name: 'Lone note' })],
  ]),
  [
    ['a', 'NEXT', 'b', {}],
    ['b', 'NEXT', 'c', {}],
    ['c', 'NEXT', 'd', {}],
    ['d', 'NEXT', 'e', {}],
  ],
);
const things = (gaps) => gaps.map((g) => g.thing).sort();

test('each ready-made gap lens finds its planted cases and nothing else', () => {
  // proves: discover_gap_lenses
  assert.deepEqual(things(unlinked(G)), ['f']);
  assert.deepEqual(things(missingNeeds(G)), ['e']);
  assert.deepEqual(things(missingNeeds(G, { Note: ['owner'] })), ['e', 'f']);
  assert.deepEqual(things(unusualNumbers(G)), ['e']);
  assert.deepEqual(things(stale(G, '2026-11-03')), ['b']);
  assert.deepEqual(things(nearDuplicates(G)), ['a']);
});
