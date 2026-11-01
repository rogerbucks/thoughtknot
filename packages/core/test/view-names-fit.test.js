// A name drawn inside a box stays inside it (design review, 1 Nov 2026): view-types/fit-text.ts. The card's SVG draws
// a label at full length. So a view whose names sit in boxes or a names column cuts each to its room.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIEW_DRAWERS } from '../src/view-types/view-types.ts';

const long = 'a rather long name for a thing in the graph';
const things = Array.from({ length: 12 }, (_, i) => ({
  key: `k${i}`,
  text: `${long} ${i}`,
  kinds: [i % 2 ? 'Task' : 'Bug'],
  ...(i < 6 ? { date: `2026-11-0${i + 1}`, dates: new Map([['start', `2026-11-0${i + 1}`]]) } : {}),
}));
const links = things.slice(1).map((t, i) => ({ from: things[i].key, type: 'PART_OF', to: t.key }));
const shape = { things, links };
const SPACE = { width: 600, height: 400 };

for (const view of ['block', 'centroid', 'plan', 'grid', 'treemap', 'containment', 'matrix'])
  test(`the ${view} view cuts a long name to its room`, () => {
    const labels = VIEW_DRAWERS[view]({ shape, space: SPACE }).filter(
      (m) => m.kind === 'label' && m.maxWidth !== undefined,
    );
    assert.ok(labels.length);
    // a letter is about 0.56 of its size wide
    for (const m of labels) assert.ok([...m.text].length * m.size * 0.56 <= m.maxWidth + 1e-9, `${view}: ${m.text}`);
  });
