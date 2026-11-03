// Poles on a graph too large to draw (editor spec §58, intent_poles_massive): pole-groups.ts. Choosing intents as
// poles places each group of the overview by its balance, and each glides there from where it was. No group is laid
// out again, and in reading view the poles are only tried, never saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hugeBlock } from '../../../scripts/scale-benchmark.mjs';
import { readNote } from '../src/drawing.ts';
import { overviewOf } from '../src/overview.ts';
import { groupsOf } from '../src/scale-groups.ts';
import { choosePoles, groupBalances, poleGlide, poledMarks, polesLine } from '../src/pole-groups.ts';

/** The benchmark graph, with two intents some of its things support or contradict. */
function benchmark() {
  const lines = [
    "(early:Intent {says: 'Shortest paths first'})",
    "(calm:Intent {says: 'Keep the proofs short'})",
    '(gt_euler)-[:SUPPORTS]->(early)',
    '(gt_hamilton)-[:SUPPORTS]->(early)',
    '(gt_graph)-[:CONTRADICTS]->(early)',
    '(gt_vertex)-[:CONTRADICTS]->(early)',
    '(gt_handshaking)-[:SUPPORTS]->(calm)',
  ];
  const reading = readNote([`${hugeBlock()},\n${lines.join(',\n')}`]);
  const drawing = reading.graphs.get('huge');
  return { graph: reading.world.huge, grouping: groupsOf(drawing) };
}

/** Each group's middle in the overview, by its id: where it is before the poles are chosen. */
function middles(grouping) {
  const { space, marks } = overviewOf(grouping);
  const was = new Map();
  for (const m of marks) if (m.kind === 'group') was.set(m.id, [m.x + m.width / 2, m.y + m.height / 2]);
  return { space, marks, was };
}

const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// proves: intent_poles_massive
test('choosing poles on the benchmark graph moves groups by their balance with no new layout, and reading view saves nothing', () => {
  const { graph, grouping } = benchmark();
  const groupOf = (key) => grouping.groups.find((g) => g.keys.includes(key)).id;
  const { space, marks, was } = middles(grouping);
  const before = JSON.stringify(grouping);
  const glide = poleGlide(was, grouping, graph, ['early', 'calm'], space);
  // the balance: the group of gt_euler and gt_hamilton supports early twice; gt_graph's contradicts it
  const balances = groupBalances(grouping, graph, ['early', 'calm']);
  const pro = groupOf('gt_euler'),
    con = groupOf('gt_graph');
  assert.notEqual(pro, con, 'the two sides are in different groups');
  assert.deepEqual(balances.get(pro).get('early').for >= 1, true);
  assert.deepEqual(balances.get(con).get('early').against >= 1, true);
  const early = glide.places.at.get('early');
  assert.ok(far(glide.now.get(pro), early) < far(glide.now.get(con), early), 'the group for it sits nearer it');
  assert.ok(glide.places.band.length > 0, 'groups with no link to a pole sit in the band');
  for (const id of glide.places.band) assert.ok(glide.now.get(id)[1] > glide.places.bandTop);
  // each group glides from where it was: its offset takes it back there at the start
  for (const [id, [dx, dy]] of glide.offsets) {
    const [x, y] = glide.now.get(id);
    assert.deepEqual([x + dx, y + dy].map(Math.round), was.get(id).map(Math.round), id);
  }
  assert.ok(glide.offsets.size > 0, 'the groups move');
  // nothing is laid out again: the groups and the overview are as they were
  assert.equal(JSON.stringify(grouping), before, 'the groups are the same groups');
  assert.deepEqual(overviewOf(grouping).marks, marks, 'the overview is not laid out again');
  // reading view tries the poles and saves nothing; where the note is edited they are saved
  const saved = [];
  assert.deepEqual(
    choosePoles('reading', ['early', 'calm'], (l) => saved.push(l)),
    { tried: ['early', 'calm'] },
  );
  assert.deepEqual(saved, [], 'reading view saves nothing');
  assert.deepEqual(
    choosePoles('editing', ['early', 'calm'], (l) => saved.push(l)),
    { saved: 'early, calm' },
  );
  assert.deepEqual(saved, [polesLine(['early', 'calm'])]);
});

test('the overview placed round poles moves each group and its names, never laying it out again', () => {
  const { graph, grouping } = benchmark();
  const laid = overviewOf(grouping);
  const poled = poledMarks(laid, grouping, graph, ['early']);
  assert.equal(poledMarks(laid, grouping, graph, []), laid, 'no pole: the overview as it was');
  assert.deepEqual(poled.space, laid.space);
  const ids = (l) => l.marks.filter((m) => !m.id.startsWith('pole:')).map((m) => m.id);
  assert.deepEqual(ids(poled), ids(laid), 'the same marks, only moved');
  const label = poled.marks.find((m) => m.id === 'pole:early');
  assert.equal(label.text, 'Shortest paths first', 'the pole is named where it stands');
  const box = (l, id) => l.marks.find((m) => m.kind === 'group' && m.id === id);
  const group = grouping.groups.find((g) => g.keys.includes('gt_euler')).id;
  const name = (l) => l.marks.find((m) => m.group === group && m.kind === 'label');
  const was = box(laid, group),
    now = box(poled, group);
  assert.ok(now.width <= was.width, 'shrunk to fit beside the others');
  const mid = (b) => [b.x + b.width / 2, b.y + b.height / 2];
  assert.ok(far(mid(now), [label.x, label.y]) < far(mid(was), [label.x, label.y]), 'it moved towards the pole');
  assert.ok(far([name(poled).x, name(poled).y], mid(now)) < now.width, 'its name moved with it');
});
