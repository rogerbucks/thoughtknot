// A Timeline on the new stage (editor spec §73, render_cells_timeline): render/render-timeline.ts. Its places run
// left to right in the plan's order. Things that share a place stack under it. A long timeline folds into rows. Each
// place on a timeline by date is named with its day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timelineLaid } from '../src/render/render-timeline.ts';
import { timelinePlan } from '../src/timeline.ts';

const thing = (key, date) => ({
  key,
  text: `Thing ${key}`,
  kinds: ['Item'],
  texts: new Map(),
  ...(date ? { date } : {}),
});

test('a timeline by date runs left to right by day, and names each day', () => {
  const s = { things: [thing('C', '2026-03-01'), thing('A', '2026-01-01'), thing('B', '2026-02-01')], links: [] };
  const { places, marks } = timelineLaid(s, timelinePlan(s, {}));
  const [a, b, c] = ['A', 'B', 'C'].map((k) => places.get(k));
  assert.ok(a.x < b.x && b.x < c.x && a.y === c.y);
  const days = marks.filter((m) => m.kind === 'label').map((m) => m.text);
  assert.deepEqual(days, ['2026-01-01', '2026-02-01', '2026-03-01']);
});

test('things on one day stack under it, and things with no date stand in a last place', () => {
  const s = { things: [thing('A', '2026-01-01'), thing('B', '2026-01-01'), thing('C')], links: [] };
  const { places } = timelineLaid(s, timelinePlan(s, {}));
  const [a, b, c] = ['A', 'B', 'C'].map((k) => places.get(k));
  assert.ok(a.x === b.x && b.y > a.y, 'two things on one day stack');
  assert.ok(c.x > a.x, 'the undated thing comes last');
});

test('a long timeline folds into rows, nearer a card shape, the same each time', () => {
  const s = { things: Array.from({ length: 30 }, (_, i) => thing(`T${i}`)), links: [] };
  const one = timelineLaid(s, timelinePlan(s, {})),
    two = timelineLaid(s, timelinePlan(s, {}));
  assert.deepEqual([...one.places], [...two.places]);
  const rows = new Set([...one.places.values()].map((p) => p.y));
  assert.ok(rows.size > 1, 'thirty places in one long row');
  assert.ok(one.marks.some((m) => m.kind === 'link' && m.style === 'timeline.line'));
});
