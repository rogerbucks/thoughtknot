// A note read in parts, the same in every host and view (editor spec ES§53, scale_parts_every_view). Every host opens
// it through one core path: storedGraphs, then massiveView given its parts. The Obsidian card does, and so does the
// edit pane that the desktop app, VS Code and the editor page share. The overview from the store is the one a whole
// reading gives, so 2D and 3D show the same groups. A group that opens never moves what is drawn (nodes stay put).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MeshIndex, memoryBackend } from '../src/mesh-index.ts';
import { storedGraphs } from '../src/store-drawing.ts';
import { groupsOf } from '../src/scale-groups.ts';
import { overviewOf } from '../src/overview.ts';
import { openGroup } from '../src/search-fly.ts';
import { spaceOf } from '../src/space-view.ts';
import { PARTS_LIMITS, READ_LIMITS } from '../src/layout-limits.ts';
import { partsRefusal } from '../src/store-drawing.ts';
import { pastPartsWords } from '../src/hosts/refusal-words.ts';
import { formatCount, formatSize, word } from '../src/index.ts';

const now = () => Promise.resolve();
const KINDS = ['Task', 'Person', 'Place', 'Idea', 'Event', 'Book'];
const N = 12_000;
const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/** A note of 12,000 things of six kinds, each linked to the one before of its kind: past the read limit. */
function huge() {
  const lines = ['```gql', '// graph: big'];
  for (let i = 0; i < N; i++) lines.push(`(n${i}:${KINDS[i % KINDS.length]} {name: 'Item ${i}'}),`);
  for (let i = KINDS.length; i < N; i++) lines.push(`(n${i})-[:NEAR]->(n${i - KINDS.length})${i < N - 1 ? ',' : ''}`);
  return [...lines, '```', ''].join('\n');
}

/** The whole graph, as the note above writes it. */
const whole = {
  graph: 'big',
  boxes: Array.from({ length: N }, (_, i) => ({ key: `n${i}`, kind: KINDS[i % KINDS.length], text: `Item ${i}` })),
  links: Array.from({ length: N - KINDS.length }, (_, j) => {
    const i = j + KINDS.length;
    return { from: `n${i}`, type: 'NEAR', reading: 'near', to: `n${i - KINDS.length}` };
  }),
  estimates: [],
};

/** A group's inside as a layout gives it: its things in a row, each a box. */
const insideOf = (part) => ({
  space: { width: part.boxes.length * 100, height: 40 },
  marks: part.boxes.map((b, i) => ({ id: b.key, kind: 'box', style: b.kind, x: i * 100, y: 0, width: 90, height: 40 })),
});

const opened = async () => {
  const text = huge();
  assert.ok(text.split('\n').length > READ_LIMITS.lines);
  return (await storedGraphs(new MeshIndex(memoryBackend()), 'big.md', text, now)).get('big');
};

test('every host opens a note read in parts through storedGraphs, and gives massiveView its parts', () => {
  // the Obsidian card, and the edit pane of the desktop app, VS Code and the editor page
  for (const path of ['obsidian/src/note-store.ts', 'core/src/display/editor/pane-drawing.ts'])
    assert.match(source(path), /storedGraphs\(/, path);
  for (const path of ['obsidian/src/massive-card.ts', 'core/src/display/editor/pane-drawing.ts'])
    assert.match(source(path), /massiveView\([^]*?parts: stored\.parts/, path);
  assert.match(source('claude-code/page/editor-pane.ts'), /display\/editor\/block-editor/, 'the page uses the pane');
});

test('past even what is read in parts, every host says why under the banner, and opens nothing', () => {
  for (const path of ['obsidian/src/note-store.ts', 'core/src/display/editor/pane-drawing.ts'])
    assert.match(source(path), /const past = partsRefusal\(text\);\s+if \(past\) return void pastPartsHint\(/, path);
  const lines = ['```gql', '// graph: big', ...Array.from({ length: PARTS_LIMITS.lines }, (_, i) => `(t${i}),`), '```'];
  const past = partsRefusal(lines.join('\n'));
  assert.equal(
    pastPartsWords(past, { word, formatCount, formatSize }),
    `This note is too large to open even a part at a time: the graph blocks here hold ${formatCount(past.count)} lines, and at most ${formatCount(PARTS_LIMITS.lines)} are read.`,
  );
});

test('the overview from the store is the one a whole reading gives, in 2D and lifted in 3D', async () => {
  const stored = await opened();
  const fromStore = overviewOf(stored.parts.grouping),
    fromWhole = overviewOf(groupsOf(whole));
  const boxes = (laid) => laid.marks.filter((m) => m.kind === 'group');
  assert.ok(boxes(fromStore).length > 1);
  assert.deepEqual(boxes(fromStore), boxes(fromWhole), 'the same groups, in the same places');
  const lifted = (laid) => spaceOf(boxes(laid), { by: 'group' });
  assert.deepEqual(lifted(fromStore), lifted(fromWhole), 'the 3D view lifts the same blocks');
});

test('a group opened from the store moves nothing drawn, and another opened after keeps the first in place', async () => {
  const stored = await opened();
  const overview = overviewOf(stored.parts.grouping);
  const [first, second] = stored.parts.grouping.groups;
  const one = openGroup(overview, first.id, insideOf(await stored.parts.group(first.id)));
  const outside = (laid, id) => laid.marks.filter((m) => !m.id.startsWith(`${id}/`) && !m.id.startsWith(`${id}:`));
  const at = (marks) => new Map(marks.map((m) => [m.id, m]));
  for (const [id, m] of at(outside(one, first.id))) assert.deepEqual(m, at(overview.marks).get(id), `${id} stays put`);
  assert.equal(one.marks.filter((m) => m.id.startsWith(`${first.id}/`)).length, first.size ?? first.keys.length);
  const two = openGroup(one, second.id, insideOf(await stored.parts.group(second.id)));
  for (const [id, m] of at(outside(two, second.id))) assert.deepEqual(m, at(one.marks).get(id), `${id} stays put`);
});
