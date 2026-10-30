// Rules and looks on a graph too large to draw (editor spec §56, rule_look_massive). Each group box of the overview
// says how many of its things each look holds. The filters offer the looks as a facet, "By look", whose counts follow
// the other filters (scale_facet_counts). The tests span rule-looks-massive.ts, overview.ts and filter-live.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { readStyle } from '../src/style.ts';
import { rulesFor } from '../src/rule-looks.ts';
import { groupLooks, lookCounts, lookCountsSaid, lookFacet } from '../src/rule-looks-massive.ts';
import { FacetIndex, facetsOf } from '../src/facet-counts.ts';
import { LiveFilter } from '../src/filter-live.ts';
import { overviewOf } from '../src/overview.ts';
import { groupsOf } from '../src/scale-groups.ts';

// two teams of tasks, each joined within itself, so the overview has a group for each
const team = (t, n) =>
  Array.from({ length: n }, (_, i) => {
    const status = i % 3 === 0 ? 'late' : 'done';
    return `(${t}${i}:${i % 2 ? 'Task' : 'Bug'} {name: '${t} ${i}', status: '${status}', cost: ${i * 10}})`;
  });
const links = (t, n) => Array.from({ length: n - 1 }, (_, i) => `(${t}${i})-[:NEEDS]->(${t}${i + 1})`);
const DATA = ['// graph: work', [...team('a', 9), ...team('b', 6), ...links('a', 9), ...links('b', 6)].join(',\n')];
const STYLE = `// graph: work_style · STYLE work
(late:Look {when: 'status == "late"', badge: 'clock', means: 'Late'}),
(dear:Look {when: 'cost >= 50', line: 'bold', means: 'Dear'})`;

/** The graph work read with its rules, its drawing and what its rules give its things. */
function read() {
  const texts = [DATA.join('\n'), STYLE];
  const reading = readNote(texts);
  const { style, problems } = readStyle(texts, 'work', reading);
  assert.deepEqual(problems, []);
  const drawing = reading.graphs.get('work');
  return { drawing, rules: rulesFor(style, reading.world.work, drawing) };
}

describe('rule_look_massive', () => {
  test('each group box says how many of its things each look holds, with its badge and meaning', () => {
    const { drawing, rules } = read();
    const late = drawing.boxes.filter((b) => rules.things.get(b.key)?.tokens.includes('look.late')).map((b) => b.key);
    assert.deepEqual(late, ['a0', 'a3', 'a6', 'b0', 'b3']);
    assert.deepEqual(
      lookCounts(['a0', 'a1', 'a3', 'a6'], rules).map((c) => [c.glyph, c.means, c.count]),
      [
        ['⏱', 'Late', 3],
        ['', 'Dear', 1],
      ],
    );
    assert.equal(lookCountsSaid(lookCounts(['a1'], rules)), '', 'a group no look holds says nothing of looks');
    const grouping = groupsOf(drawing);
    const laid = overviewOf(grouping, undefined, groupLooks(rules));
    for (const g of grouping.groups) {
      const said = laid.marks.find((m) => m.id === `${g.id}:looks`);
      assert.equal(said?.text, lookCountsSaid(lookCounts(g.keys, rules)), g.id);
      assert.match(laid.marks.find((m) => m.id === g.id)?.name ?? '', /Late \d/, 'a screen reader hears them too');
    }
    const total = grouping.groups.flatMap((g) => lookCounts(g.keys, rules)).filter((c) => c.means === 'Late');
    assert.equal(
      total.reduce((n, c) => n + c.count, 0),
      5,
      'every late thing is counted in its group',
    );
  });

  test('the filters offer the looks as a facet whose counts follow the other filters, and a filter keeps the counts', () => {
    const { drawing, rules } = read();
    const keys = drawing.boxes.map((b) => b.key);
    const facet = lookFacet(keys, rules);
    assert.equal(facet?.name, 'By look');
    const index = new FacetIndex(keys, [...facetsOf(drawing.boxes), facet]);
    const counted = (chosen) =>
      Object.fromEntries(
        index
          .counts(chosen)
          .get('By look')
          .map((c) => [c.value, c.count]),
      );
    assert.deepEqual(counted({}), { '⏱ Late': 5, Dear: 4 }, 'each thing by the first look it has');
    assert.deepEqual(counted({ Kind: new Set(['Bug']) }), { '⏱ Late': 3, Dear: 1 }, 'they follow the kind chosen');
    assert.deepEqual(index.kept({ 'By look': new Set(['⏱ Late']) }), ['a0', 'a3', 'a6', 'b0', 'b3']);
    const live = new LiveFilter(groupsOf(drawing), index, groupLooks(rules));
    const kept = live.filter({ 'By look': new Set(['⏱ Late']) });
    const said = kept.laid.marks.filter((m) => m.id.endsWith(':looks')).map((m) => m.text);
    assert.ok(said.length && said.every((t) => t.startsWith('⏱ Late ')), 'each kept group counts what it keeps');
  });

  test('a graph whose rules find nothing offers no By look filter', () => {
    const { drawing } = read();
    const keys = drawing.boxes.map((b) => b.key);
    assert.equal(lookFacet(keys, { things: new Map(), legend: [] }), null);
  });
});
