// One type scale for every view (design review, 1 Nov 2026; Zen-led refresh step 1): type-scale.ts. A view's names were
// 6 pixels in one view and 30 in the next. Now every view draws its names in one band, and a caption one step smaller.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPTION, NAME_LEAST, NAME_MOST, captionSize, nameSize } from '../src/view-types/type-scale.ts';
import { VIEW_DRAWERS, VIEW_TYPES } from '../src/view-types/view-types.ts';

/** A graph of `n` things in three kinds, each linked to the next. */
const shapeOf = (n) => ({
  things: Array.from({ length: n }, (_, i) => ({
    key: `t${i}`,
    text: `Thing number ${i}`,
    kinds: [['Service', 'Store', 'Person'][i % 3]],
  })),
  links: Array.from({ length: n - 1 }, (_, i) => ({ from: `t${i}`, type: 'USES', to: `t${i + 1}` })),
});

// proves: view_types_offered
test('a name is drawn in one band, never too small to read nor shouting, and a caption one step smaller', () => {
  assert.equal(nameSize(2), NAME_LEAST);
  assert.equal(nameSize(40), NAME_MOST);
  assert.equal(nameSize(10), 10);
  assert.equal(captionSize(NAME_MOST), NAME_MOST * CAPTION);
  assert.equal(captionSize(1), NAME_LEAST * CAPTION, 'never under the least');
});

// proves: view_types_offered
test('no view draws its words larger than the most a name may be', () => {
  for (const n of [6, 30, 120])
    for (const type of VIEW_TYPES) {
      const marks = VIEW_DRAWERS[type]({ shape: shapeOf(n), space: { width: 900, height: 600 } });
      for (const m of marks.filter((k) => k.kind === 'label'))
        assert.ok(m.size <= NAME_MOST + 1e-9, `${type}, ${n} things: ${m.id} is ${m.size}px`);
    }
});

// proves: view_types_offered
test('a view that names things in open space names them at a readable size', () => {
  const open = ['arc', 'chord', 'ego', 'force', 'hive', 'map', 'density'].filter((t) => VIEW_TYPES.includes(t));
  for (const [n, space] of [
    [30, { width: 900, height: 600 }],
    [60, { width: 390, height: 300 }],
  ])
    for (const type of open) {
      const marks = VIEW_DRAWERS[type]({ shape: shapeOf(n), space });
      // a name inside its card scales with the card, so a crowded view's cards are read by zooming in (things_as_cards)
      const carded = new Set(marks.filter((k) => k.kind === 'box' && k.shape === 'round').map((k) => k.of));
      for (const m of marks.filter((k) => k.kind === 'label' && !carded.has(k.of)))
        assert.ok(m.size >= NAME_LEAST * CAPTION - 1e-9, `${type}, ${n} things: ${m.id} is ${m.size}px`);
    }
});
