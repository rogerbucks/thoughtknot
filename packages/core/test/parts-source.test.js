// A note read in parts, drawn from the store a group at a time (editor spec §53, scale_parts_overview): parts-source.ts.
// The overview needs only the group rows. A group's things are read when it opens, and let go when it leaves the
// screen or when more is held than the budget. What a group gives is what a whole reading gives for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshIndex, memoryBackend, sqliteBackend } from '../src/mesh-index.ts';
import { PartsSource, partsOf } from '../src/parts-source.ts';
import { storedGraphs } from '../src/store-drawing.ts';
import { overviewOf } from '../src/overview.ts';
import { READ_LIMITS } from '../src/layout-limits.ts';
import { sqlEngine } from './mesh-test-sql.js';

const now = () => Promise.resolve();
const KINDS = ['Task', 'Person', 'Place', 'Idea', 'Event', 'Book'];
const N = 12_000;

/** A note of 12,000 things of six kinds, each linked to the one before of its kind: past the read limit. */
function huge() {
  const lines = ['# Big', '', '```gql', '// graph: big'];
  for (let i = 0; i < N; i++) lines.push(`(n${i}:${KINDS[i % KINDS.length]} {name: 'Item ${i}'}),`);
  for (let i = KINDS.length; i < N; i++) lines.push(`(n${i})-[:NEAR]->(n${i - KINDS.length})${i < N - 1 ? ',' : ''}`);
  return [...lines, '```', ''].join('\n');
}

const text = huge();
const plain = (d) => ({
  boxes: d.boxes.map((b) => [b.key, b.kind, b.text]).sort(),
  links: d.links.map((l) => [l.from, l.type, l.reading, l.to]).sort(),
});

test('the overview of a note read in parts comes from the group rows alone, and holds no thing', async () => {
  assert.ok(text.split('\n').length > READ_LIMITS.lines);
  const ix = new MeshIndex(memoryBackend());
  const big = (await partsOf(ix, 'big.md', text, now)).get('big');
  assert.ok(big instanceof PartsSource);
  const grouping = big.overview();
  assert.equal(
    grouping.groups.reduce((n, g) => n + g.size, 0),
    N,
  );
  assert.ok(
    grouping.groups.every((g) => g.keys.length === 0),
    'no thing is read for the overview',
  );
  assert.equal(big.holding, 0);
  const marks = overviewOf(grouping).marks.filter((m) => m.kind === 'group');
  assert.equal(marks.length, grouping.groups.length, 'the overview draws a box for each group from its size');
});

test('a group read from the store is what a whole reading gives for it, from either backend', async () => {
  for (const backend of [memoryBackend(), sqliteBackend(await sqlEngine())]) {
    const ix = new MeshIndex(backend);
    const big = (await partsOf(ix, 'big.md', text, now)).get('big');
    const whole = (await storedGraphs(ix, 'big.md', text, now)).get('big').drawing;
    for (const g of big.overview().groups) {
      const part = big.group(g.id);
      assert.equal(part.boxes.length, g.size);
      const keys = new Set(part.boxes.map((b) => b.key));
      assert.deepEqual(
        plain(part),
        plain({
          boxes: whole.boxes.filter((b) => keys.has(b.key)),
          links: whole.links.filter((l) => keys.has(l.from) && keys.has(l.to)),
        }),
        `${backend.kind}: group ${g.id}`,
      );
    }
  }
});

test('the rows held follow the screen, never the size of the graph', async () => {
  const ix = new MeshIndex(memoryBackend());
  const most = 5_000;
  const big = (await partsOf(ix, 'big.md', text, now, most)).get('big');
  const ids = big.overview().groups.map((g) => g.id);
  assert.ok(ids.length >= 3);
  for (const id of ids) {
    big.group(id);
    assert.ok(big.holding <= most, `held ${big.holding} after opening ${id}`);
    assert.equal(big.open.at(-1), id, 'the group just opened is held');
  }
  // a kept group stays however much else opens
  big.group(ids[0], true);
  for (const id of ids.slice(1)) big.group(id);
  assert.ok(big.open.includes(ids[0]));
  // leaving the screen lets go of all but what is shown and kept
  big.group(ids[1]);
  big.group(ids[2]);
  big.onScreen([ids[1]]);
  assert.deepEqual(new Set(big.open), new Set([ids[0], ids[1]]));
  big.letGo(ids[0]);
  big.letGo(ids[1]);
  assert.equal(big.holding, 0);
});

test('rows from other text are never drawn', async () => {
  const ix = new MeshIndex(memoryBackend());
  const big = (await partsOf(ix, 'big.md', text, now)).get('big');
  ix.update('big.md', text.replace("'Item 7'", "'Item seven'"));
  assert.equal(big.fresh, false);
  assert.equal(big.group(big.open[0] ?? 'any'), null);
  assert.deepEqual(big.overview().groups, []);
});
