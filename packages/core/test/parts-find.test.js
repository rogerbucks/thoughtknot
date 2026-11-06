// Search, facet counts and the filter of a note read in parts (editor spec §53, scale_parts_find_filter):
// store-drawing.ts. The answers are the same as the note read whole. Things' properties stay in the store. The filters
// read them a group at a time, each group once. A thing chosen reads only its own group.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshIndex, memoryBackend, sqliteBackend } from '../src/mesh-index.ts';
import { storedGraphs } from '../src/store-drawing.ts';
import { FacetIndex, facetsOf } from '../src/facet-counts.ts';
import { ThingSearch } from '../src/search-fly.ts';
import { READ_LIMITS } from '../src/layout-limits.ts';
import { sqlEngine } from './mesh-test-sql.js';

const now = () => Promise.resolve();
const KINDS = ['Task', 'Person', 'Place', 'Idea', 'Event', 'Book'];
const STATUS = ['open', 'done', 'held'];
const N = 12_000;

/** Thing `i` of the note: its kind, name and properties. */
const thing = (i) => ({
  key: `n${i}`,
  kind: KINDS[i % KINDS.length],
  text: `Item ${i}`,
  props: {
    id: `n${i}`,
    name: `Item ${i}`,
    status: STATUS[i % STATUS.length],
    ...(i % 5 ? {} : { tier: i % 2 ? 'a' : 'b' }),
  },
});

/** A note of 12,000 things with a status, a fifth with a tier, each linked to the one before of its kind. */
function huge() {
  const lines = ['```gql', '// graph: big'];
  for (let i = 0; i < N; i++) {
    const t = thing(i);
    const tier = t.props.tier ? `, tier: '${t.props.tier}'` : '';
    lines.push(`(${t.key}:${t.kind} {name: '${t.text}', status: '${t.props.status}'${tier}}),`);
  }
  for (let i = KINDS.length; i < N; i++) lines.push(`(n${i})-[:NEAR]->(n${i - KINDS.length})${i < N - 1 ? ',' : ''}`);
  return [...lines, '```', ''].join('\n');
}

const text = huge();

/** A backend that counts how many groups each read of things asks for. */
function counted(backend) {
  const asks = [];
  return {
    asks,
    backend: {
      ...backend,
      things: (note, groups) => (asks.push(groups.length), backend.things(note, groups)),
    },
  };
}

test('the filters of a note read in parts are those of the note read whole, read a group at a time', async () => {
  assert.ok(text.split('\n').length > READ_LIMITS.lines);
  for (const make of [memoryBackend, async () => sqliteBackend(await sqlEngine())]) {
    const { asks, backend } = counted(await make());
    const big = (await storedGraphs(new MeshIndex(backend), 'big.md', text, now)).get('big');
    const boxes = big.drawing.boxes;
    const whole = new Map(Array.from({ length: N }, (_, i) => [`n${i}`, thing(i).props]));
    asks.length = 0;
    const facets = big.parts.facets();
    assert.deepEqual(
      facets,
      facetsOf(boxes, (k) => whole.get(k)),
      backend.kind,
    );
    assert.deepEqual(
      facets.map((f) => f.name),
      ['Kind', 'status', 'tier'],
    );
    const groups = big.parts.grouping.groups.length;
    assert.ok(
      asks.every((n) => n === 1),
      'each read asks for one group',
    );
    assert.equal(asks.length, groups, 'each group is read once');
    // the counts follow the filter, as for a note read whole
    const counts = (fs) =>
      new FacetIndex(
        boxes.map((b) => b.key),
        fs,
      ).counts({ status: new Set(['done']) });
    assert.deepEqual(counts(facets), counts(facetsOf(boxes, (k) => whole.get(k))));
  }
});

test('a thing chosen in a note read in parts reads only its own group, and search finds what a whole reading finds', async () => {
  const { asks, backend } = counted(memoryBackend());
  const big = (await storedGraphs(new MeshIndex(backend), 'big.md', text, now)).get('big');
  asks.length = 0;
  assert.deepEqual(big.props('n7001'), thing(7001).props);
  assert.deepEqual(asks, [1]);
  const search = new ThingSearch(big.drawing.boxes, big.parts.grouping);
  const hits = search.find('Item 700', 20).map((m) => m.key);
  assert.ok(hits.includes('n700') && hits.includes('n7001'));
  assert.ok(hits.every((k) => thing(Number(k.slice(1))).text.includes('Item 700')));
});
