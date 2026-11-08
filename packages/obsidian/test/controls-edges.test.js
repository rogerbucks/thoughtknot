// The cards down each side of the drawing stack (editor spec §25, panels_stack). Roger, 6 Nov 2026: the side panels
// "regularly overlap each other …". So the room each side has left is measured. The corner card holds the top of a
// side, and the mini-map and pad its foot. That room is said to the style sheet, which caps each card to it.
// - A corner card ends the top of its side, with a gap below it.
// - The mini-map and the pad hold the foot. The pad grows, so only its head counts as the fixed foot.
// - Each side is its own: the start's cards never take room from the end.
// The browser check that no two land over each other is test/panels-stack.test.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeDocument, installGlobals } from './host/fake-dom.js';

let uninstall, edgesOf, EDGE_GAP;
before(async () => {
  uninstall = installGlobals(fakeDocument());
  ({ edgesOf, EDGE_GAP } = await import('../../core/src/display/graph-view/controls-edges.ts'));
});
after(() => uninstall());

const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });
const drawing = box(0, 100, 1200, 800); // the drawing, under a bar 100 pixels high

// proves: panels_stack
test('a corner card ends the top of its side, a gap below it, and nothing else', () => {
  const room = edgesOf(drawing, [{ side: 'end', at: 'top', box: box(900, 108, 292, 300) }]);
  assert.deepEqual(room.end, { top: 308 + EDGE_GAP, foot: 0, fixed: 0 });
  assert.deepEqual(room.start, { top: 0, foot: 0, fixed: 0 }, 'the other side keeps its room');
});

// proves: panels_stack
test('the mini-map and the pad hold the foot; only the pad’s head counts as fixed', () => {
  const map = { side: 'start', at: 'foot', box: box(8, 742, 150, 150) };
  const pad = { side: 'end', at: 'foot', box: box(1000, 592, 192, 300), fixed: 56 };
  const room = edgesOf(drawing, [map, pad]);
  assert.deepEqual(room.start, { top: 0, foot: 158 + EDGE_GAP, fixed: 158 + EDGE_GAP });
  assert.deepEqual(room.end, { top: 0, foot: 308 + EDGE_GAP, fixed: 8 + 56 + EDGE_GAP });
});

// proves: panels_stack
test('a card of no size, folded away or hidden, takes no room', () => {
  const room = edgesOf(drawing, [{ side: 'end', at: 'top', box: box(900, 108, 0, 0) }]);
  assert.deepEqual(room.end, { top: 0, foot: 0, fixed: 0 });
});

// proves: panels_stack
test('the style sheet caps each card to the room left to it, and the details float between them', () => {
  const css = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.thoughtknot-corner\.thoughtknot-corner-end \{\s*max-height: calc\([^;]*--thoughtknot-end-fixed/);
  assert.match(css, /\.thoughtknot-space-pad \{[^}]*max-height: calc\([^;]*--thoughtknot-end-top/);
  assert.match(
    css,
    /inset-block-start: calc\(\s*var\(--thoughtknot-drawing-top, 0rem\) \+ max\([^;]*--thoughtknot-end-top/,
  );
  assert.match(css, /max\(var\(--gn-space-2\), var\(--thoughtknot-end-foot, 0rem\)\)/);
});
