// What the floating controls cover (editor spec §25, controls_uncover). Roger, 1 Nov 2026: the controls lie over the
// drawing and never shrink it, so a thing chosen must never hide behind them.
// - Each card covers a strip from the edge nearest it. The docks cover one at the start, the chip one at the top.
// - A tall panel on a short card covers the start, as the top strip would leave almost nothing clear.
//   The phone's sheet covers one at the foot.
// - A card off the drawing or hidden covers nothing; the covers of the cards and the details add up edge by edge.
// - A thing under the docks is aimed at the clear part, so it glides out from behind them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, installGlobals } from './host/fake-dom.js';

let uninstall, coverByCards, widest, Zoom;
before(async () => {
  uninstall = installGlobals(fakeDocument());
  ({ coverByCards, widest } = await import('../../core/src/display/graph-view/controls-cover.ts'));
  ({ Zoom } = await import('../../core/src/zoom.ts'));
});
after(() => uninstall());

const view = { left: 100, top: 50, right: 1100, bottom: 750 }; // 1000 by 700 on the screen
const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });

// proves: controls_uncover
test('each floating card covers a strip from the edge nearest it', () => {
  const docks = box(108, 58, 288, 500); // tall, in the top start corner
  assert.deepEqual(coverByCards(view, [docks]), { top: 0, right: 0, bottom: 0, left: 296 });
  const chip = box(108, 58, 600, 40); // wide and short, at the top
  assert.deepEqual(coverByCards(view, [chip]), { top: 48, right: 0, bottom: 0, left: 0 });
  const sheet = box(100, 620, 1000, 130); // the phone's sheet at peek, at the foot
  const mini = box(940, 650, 152, 92); // the mini-map, in the bottom end corner
  assert.deepEqual(coverByCards(view, [docks, sheet, mini]), { top: 0, right: 0, bottom: 130, left: 296 });
});

// A tall panel on a short card, as the edit pane's: its top strip would leave almost nothing, so it covers the start.
// proves: controls_uncover
test('a card covers the strip that leaves the most of the drawing clear, for its width or height', () => {
  const short = { left: 0, top: 0, right: 594, bottom: 320 };
  assert.deepEqual(coverByCards(short, [box(8, 8, 322, 293)]), { top: 0, right: 0, bottom: 0, left: 330 });
  const wide = { left: 0, top: 0, right: 1200, bottom: 400 };
  assert.deepEqual(coverByCards(wide, [box(0, 0, 500, 100)]), { top: 100, right: 0, bottom: 0, left: 0 });
});

// proves: controls_uncover
test('a card off the drawing or hidden covers nothing, and covers add up edge by edge', () => {
  assert.deepEqual(coverByCards(view, [box(1200, 60, 100, 100), box(300, 300, 0, 0)]), {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
  const details = { top: 0, right: 320, bottom: 0, left: 0 };
  assert.deepEqual(widest(details, { top: 48, right: 100, bottom: 0, left: 296 }), {
    top: 48,
    right: 320,
    bottom: 0,
    left: 296,
  });
});

// proves: controls_uncover
test('a thing under the docks is aimed at the part they leave clear', () => {
  const zoom = new Zoom({ width: 2000, height: 1400 }, { width: 1000, height: 700 }, 'view');
  zoom.restore(1, -100, -100);
  const thing = { x: 0.1, y: 0.1, width: 0.05, height: 0.03 }; // at 100..200 across on the screen: under the docks
  assert.equal(zoom.aim(thing), null, 'with nothing kept clear it is in view, so nothing moves');
  zoom.keepClear(coverByCards(view, [box(108, 58, 288, 500)]));
  const to = zoom.aim(thing);
  assert.ok(to, 'kept clear of the docks, it moves');
  const left = to.x + thing.x * 2000 * to.scale;
  assert.ok(left >= 296, `it lands clear of the docks (at ${left})`);
});
