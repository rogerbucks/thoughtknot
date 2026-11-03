// Totals beside the counts of a filter (editor spec §57, calc_set_totals): facet-totals.ts.
// - Each filter value shows what its things add up to, beside how many there are.
// - Choosing a value in one filter updates the totals of the others, never its own.
// - Things with no number are counted as missing, never as zero.
// - 10,000 kept things total in one pass, each counted once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { FacetIndex } from '../src/facet-counts.ts';
import { facetTotals } from '../src/facet-totals.ts';

const KEYS = ['ada', 'bob', 'cy', 'oslo', 'rome', 'lima'];
const FACETS = [
  { name: 'Kind', values: ['Person', 'Person', 'Person', 'Place', 'Place', 'Place'] },
  { name: 'status', values: ['done', 'open', 'open', 'done', undefined, 'open'] },
];
const index = () => new FacetIndex(KEYS, FACETS);
/** cost: bob has none, rome has none. */
const COST = { name: 'cost', unit: 'USD', values: [10, undefined, 30, 40, null, 60] };
const row = (t, facet, value) => t.facets.get(facet).find((r) => r.value === value);

test('with nothing chosen, each value shows its total beside its count, and all things kept show theirs', () => {
  const t = facetTotals(index(), {}, COST);
  assert.deepEqual(t.kept, { total: 140, counted: 4, missing: 2 });
  assert.deepEqual(row(t, 'Kind', 'Person'), { value: 'Person', count: 3, total: 40, counted: 2, missing: 1 });
  assert.deepEqual(row(t, 'Kind', 'Place'), { value: 'Place', count: 3, total: 100, counted: 2, missing: 1 });
  assert.equal(row(t, 'status', 'open').total, 90, 'bob has none, cy 30 and lima 60');
});

test('choosing a value updates the totals of the other filters, never its own', () => {
  const t = facetTotals(index(), { Kind: new Set(['Place']) }, COST);
  assert.equal(row(t, 'Kind', 'Person').total, 40, 'its own totals show what choosing more would add');
  assert.equal(row(t, 'status', 'done').total, 40);
  assert.equal(row(t, 'status', 'open').total, 60);
  assert.deepEqual(t.kept, { total: 100, counted: 2, missing: 1 });
});

test('a value whose things all lack the number has no total, and is not zero', () => {
  const t = facetTotals(
    index(),
    {},
    { name: 'cost', unit: '', values: [undefined, null, undefined, 5, undefined, undefined] },
  );
  assert.equal(row(t, 'Kind', 'Person').total, null);
  assert.deepEqual(row(t, 'Kind', 'Person'), { value: 'Person', count: 3, total: null, counted: 0, missing: 3 });
});

test('10,000 kept things total in one pass, each counted once', () => {
  const n = 10_000;
  const keys = Array.from({ length: n }, (_, i) => `t${i}`);
  const facets = [
    { name: 'Kind', values: keys.map((_, i) => (i % 2 ? 'A' : 'B')) },
    { name: 'status', values: keys.map((_, i) => ['open', 'done', 'late'][i % 3]) },
  ];
  const measure = { name: 'cost', unit: '', values: keys.map((_, i) => (i % 7 ? i : undefined)) };
  const big = new FacetIndex(keys, facets);
  facetTotals(big, { status: new Set(['open']) }, measure);
  const t = facetTotals(big, { status: new Set(['open']) }, measure);
  assert.equal(t.kept.counted + t.kept.missing, 3334);
});

test('calculated values and number properties are measures read by the same code', async () => {
  const gs = (await import('@thoughtknot/graph-spec')).default;
  const { measuresOf } = await import('../src/measures.ts');
  const node = (id, labels, props) => [id, [new Set(labels), { id, ...props }]];
  const g = new gs.Graph(
    new Map([
      node('c', ['Calculated'], { of: 'Task', name: 'cost', is: 'hours * 10', unit: 'USD' }),
      node('t1', ['Task'], { hours: 2, size: 3 }),
      node('t2', ['Task'], { hours: 5, size: 4 }),
      node('t3', ['Task'], { size: 1 }),
    ]),
    [],
  );
  const ms = measuresOf(g, ['t1', 't2', 't3']);
  assert.deepEqual(
    ms.map((m) => [m.name, m.unit, m.values]),
    [
      ['cost', 'USD', [20, 50, null]],
      ['hours', '', [2, 5, null]],
      ['size', '', [3, 4, 1]],
    ],
  );
  const idx = new FacetIndex(['t1', 't2', 't3'], [{ name: 'Kind', values: ['Task', 'Task', 'Task'] }]);
  assert.deepEqual(facetTotals(idx, {}, ms[0]).kept, { total: 70, counted: 2, missing: 1 });
});
