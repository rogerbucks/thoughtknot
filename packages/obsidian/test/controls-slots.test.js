// No two cards over the drawing overlap (editor spec §25, panels_never_overlap). Roger, 4 Nov 2026: panels overlapped,
// so fix it for every future change.
// - Every card the style sheet floats over the drawing claims a slot, or says why it may lie over the others for a
//   moment. A new card with neither fails here.
// - No two cards hold one slot, unless the later says how it keeps clear.
// - The level badge sits in the top middle, beside the corner cards where there is room and below them where not. At a
//   phone's, a tablet's, a laptop's and a large screen's width it never overlaps them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeDocument, installGlobals } from './host/fake-dom.js';

let uninstall, middlePlace, SLOTS, ON_DEMAND, SHARING;
before(async () => {
  uninstall = installGlobals(fakeDocument());
  ({ middlePlace, SLOTS, ON_DEMAND, SHARING } = await import('../../core/src/display/graph-view/controls-slots.ts'));
});
after(() => uninstall());

const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });
const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/** Where the badge lands, as a box, from its place in `view`: centred in its span, as the style sheet centres it. */
const landed = (view, at, want) => {
  const span = view.right - view.left - at.start - at.end,
    width = Math.min(want.width, span);
  return box(view.left + at.start + (span - width) / 2, view.top + at.top, width, want.height);
};

// proves: panels_never_overlap
test('every card the style sheet floats over the drawing claims a slot, or says why it may lie over the others', () => {
  const css = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const known = new Set([...Object.keys(SLOTS), ...Object.keys(ON_DEMAND)]);
  const unclaimed = [];
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // a card: placed over the page, with an edge or a shadow
    if (!/position:\s*(absolute|fixed)/.test(body) || !/(shadow|border)/.test(body)) continue;
    const classes = [...selector.matchAll(/\.(thoughtknot-[\w-]+)/g)].map((m) => m[1]);
    if (!classes.some((c) => known.has(c))) unclaimed.push(selector.trim().replace(/\s+/g, ' '));
  }
  assert.deepEqual(unclaimed, [], 'add each to SLOTS or ON_DEMAND in controls-slots.ts');
});

test('no two cards hold one slot, unless the later says how it keeps clear', () => {
  const holder = new Map();
  for (const [card, slot] of Object.entries(SLOTS)) {
    if (slot === 'free') continue; // a dock the person moved stays where they put it
    if (holder.has(slot))
      assert.ok(SHARING[card], `${card} shares ${slot} with ${holder.get(slot)}: say how in SHARING`);
    else holder.set(slot, card);
  }
});

test('the level badge sits beside the corner card where there is room', () => {
  const view = box(0, 0, 1280, 800);
  const corner = box(8, 8, 320, 130);
  const at = middlePlace(view, [corner], { width: 700, height: 60 }, 8);
  assert.equal(at.top, 8);
  assert.ok(at.start >= 336, 'starts after the corner card');
  assert.ok(!overlaps(landed(view, at, { width: 700, height: 60 }), corner));
});

test('the level badge drops below the corner card where the gap is too narrow', () => {
  const view = box(0, 0, 390, 700);
  const corner = box(8, 8, 374, 120);
  const at = middlePlace(view, [corner], { width: 300, height: 60 }, 8);
  assert.equal(at.top, 136);
  assert.ok(!overlaps(landed(view, at, { width: 300, height: 60 }), corner));
});

test('in a drawing too short to drop it below them, the badge stays across the top, inside the drawing', () => {
  const view = box(0, 0, 390, 160);
  const at = middlePlace(view, [box(8, 8, 374, 120)], { width: 300, height: 60 }, 8);
  assert.deepEqual(at, { start: 0, end: 0, top: 8 });
});

test('at a phone, tablet, laptop and large screen, the badge never overlaps the cards in the corners', () => {
  for (const width of [390, 768, 1280, 1920]) {
    const view = box(0, 0, width, 800);
    const corner = box(8, 8, Math.min(320, width - 16), 140); // the controls card, at most 20rem
    const end = box(width - 8 - 240, 8, 240, 90); // a dock moved to the end
    const map = box(width - 8 - 200, 800 - 8 - 150, 200, 150); // the mini-map
    for (const want of [
      { width: 200, height: 30 },
      { width: 900, height: 90 },
    ]) {
      const at = middlePlace(view, [corner, end, map], want, 8);
      const badge = landed(view, at, want);
      for (const c of [corner, end, map]) assert.ok(!overlaps(badge, c), `${width}px: ${JSON.stringify({ badge, c })}`);
    }
  }
});
