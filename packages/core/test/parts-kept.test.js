// The rows of a note read in parts, kept between sessions (editor spec §53, scale_parts_kept): parts-kept.ts.
// A note seen before opens from its kept rows without a reading. Changed text or broken rows are read again and never
// drawn. A place that fails, or is thrown away, costs only a reading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshIndex, memoryBackend } from '../src/mesh-index.ts';
import { storedGraphs } from '../src/store-drawing.ts';
import { keptName, keptRows } from '../src/parts-kept.ts';
import { sha256 } from '../src/ai-digest.ts';

/** A note of 12,000 things and their links: past the read limit. */
function huge(name = 'Item') {
  const lines = ['```gql', '// graph: big'];
  for (let i = 0; i < 12_000; i++) lines.push(`(n${i}:Thing {name: '${name} ${i}'}),`);
  for (let i = 1; i < 12_000; i++) lines.push(`(n${i})-[:NEAR]->(n${i - 1})${i < 11_999 ? ',' : ''}`);
  return [...lines, '```', ''].join('\n');
}

/** A place in memory that counts its reads and writes, and can be made to fail. */
function memoryPlace() {
  const kept = new Map();
  const place = {
    kept,
    reads: 0,
    writes: 0,
    failing: false,
    read: async (name) => {
      place.reads++;
      if (place.failing) throw new Error('gone');
      return kept.get(name) ?? null;
    },
    write: async (name, text) => {
      place.writes++;
      if (place.failing) throw new Error('gone');
      kept.set(name, text);
    },
    remove: async (name) => void kept.delete(name),
  };
  return place;
}

const text = huge();
/** Opens the note in a fresh session (a new store), counting the turns its reading took. */
async function open(place, body = text) {
  let turns = 0;
  const graphs = await storedGraphs(new MeshIndex(memoryBackend()), 'big.md', body, async () => void turns++, place);
  return { big: graphs.get('big'), turns };
}

test('a note seen before opens from its kept rows, without a reading', async () => {
  const place = memoryPlace();
  const first = await open(place);
  assert.ok(first.turns > 0, 'read the first time');
  assert.equal(place.writes, 1);
  assert.ok(place.kept.has(keptName('big.md')));
  const again = await open(place);
  assert.equal(again.turns, 0, 'not read again');
  assert.deepEqual(again.big.drawing.boxes, first.big.drawing.boxes);
  assert.deepEqual(again.big.parts.grouping, first.big.parts.grouping);
  assert.ok(!keptName('big.md').includes('big'), 'the name never shows the path');
});

test('rows from other text, or broken rows, are read again and never drawn', async () => {
  const place = memoryPlace();
  await open(place);
  const changed = huge('Thing');
  const after = await open(place, changed);
  assert.ok(after.turns > 0, 'changed text is read again');
  assert.equal(after.big.drawing.boxes[5].text, 'Thing 5');
  // broken rows: cut short, or a field of the wrong kind
  const good = place.kept.get(keptName('big.md'));
  for (const broken of [good.slice(0, 1000), good.replace('"props":"{', '"props":{"x":1},"y":"{')]) {
    place.kept.set(keptName('big.md'), broken);
    const read = await open(place, changed);
    assert.ok(read.turns > 0, 'broken rows are read again');
    assert.equal(read.big.drawing.boxes.length, 12_000);
  }
  assert.equal(keptRows(good, 'other.md', sha256(changed)), null, 'rows of another note are never used');
});

test('a place that fails, or is thrown away, costs only a reading', async () => {
  const place = memoryPlace();
  place.failing = true;
  const failed = await open(place);
  assert.ok(failed.turns > 0);
  assert.equal(failed.big.drawing.boxes.length, 12_000);
  place.failing = false;
  await open(place);
  place.kept.clear();
  const thrown = await open(place);
  assert.ok(thrown.turns > 0);
  assert.equal(thrown.big.drawing.boxes.length, 12_000);
});
