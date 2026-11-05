// Where the camera goes as an exploration changes (editor spec §71, explore_recentre, explore_stays_put). Roger, 1 Nov
// 2026: never disorient. The first exploration fits its drawing. A change after it keeps the zoom, and holds a thing
// already shown where it was on the screen. Things that would land out of sight bring the view in with them. A new
// centre is put in the middle: the boxes glide there as the view moves. Ended, the view is as it was before.
// Requirements: explore_recentre and explore_stays_put.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Regrouping } from '../src/display/graph-view/regroup.ts';

const rect = (x, y) => ({ left: x, top: y, right: x + 20, bottom: y + 20, width: 20, height: 20, x, y });
const kept = (centre, parents = new Map()) => ({
  things: new Set(),
  edges: new Set(),
  placed: new Map(),
  cross: new Set(),
  centre,
  parents,
});

/** A card whose boxes are `at` by key; `next.at` is where laying out again puts them, as laying the graph out again does. Calls to the zoom are kept. */
function cardOf(at) {
  const calls = [];
  const now = { at: { ...at } },
    next = { at: null };
  const box = (key) => ({
    getAttribute: (n) => (n === 'data-key' ? key : null),
    getBoundingClientRect: () => rect(...now.at[key]),
  });
  const svg = {
    win: { document: { body: { classList: { contains: () => false } } }, matchMedia: () => ({ matches: true }) },
    parentElement: {
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400 }),
    },
    querySelectorAll: (q) => (q.startsWith('g.node') ? Object.keys(now.at).map(box) : []),
  };
  const zoom = {
    holdView: false,
    view: () => ({ scale: 1, x: 5, y: 6, width: 400, height: 400 }),
    restore: (...a) => calls.push(['restore', ...a]),
    panBy: (...a) => calls.push(['panBy', ...a]),
    fit: () => calls.push(['fit']),
  };
  const sw = {
    relays: true,
    regroup: (_only, then) => {
      if (next.at) now.at = next.at;
      next.at = null;
      then();
    },
  };
  const regrouping = new Regrouping({
    svg: () => svg,
    zoom: () => zoom,
    switching: () => sw,
    size: () => ({ width: 400, height: 300 }),
  });
  return { regrouping, calls, next, zoom };
}

// proves: explore_stays_put
test('the first exploration fits the drawing, and the next keeps the zoom and holds what was shown where it was', () => {
  const { regrouping, calls, next, zoom } = cardOf({ hub: [100, 100], a: [200, 100] });
  regrouping.to(kept('hub'));
  assert.deepEqual(calls, [['fit']], 'a drawing newly explored is fitted');
  assert.equal(zoom.holdView, false);
  calls.length = 0;
  // a branch opens: the layout puts what was shown 30 across and 10 down of where it was, and one thing new beside it
  next.at = { hub: [130, 110], a: [230, 110], b: [260, 110] };
  regrouping.to(kept('hub', new Map([['b', 'a']])));
  assert.equal(zoom.holdView, true, 'a drawing laid out again is not fitted again');
  assert.deepEqual(calls.slice(0, 2), [
    ['restore', 1, 5, 6],
    ['panBy', -30, -10],
  ]);
  assert.deepEqual(calls.at(-1), ['panBy', 0, 0], 'the new thing is in sight, so the view goes no further');
});

// proves: explore_stays_put
test('a thing that would land out of sight brings the view in, and a map too wide for it is fitted', () => {
  const { regrouping, calls, next } = cardOf({ hub: [100, 100] });
  regrouping.to(kept('hub'));
  calls.length = 0;
  next.at = { hub: [100, 100], far: [450, 100] };
  regrouping.to(kept('hub'));
  assert.deepEqual(calls.at(-1), ['panBy', -70, 0], 'its right edge, at 470, comes in to 400');
  calls.length = 0;
  next.at = { hub: [100, 100], p: [-100, 100], q: [900, 100] };
  regrouping.to(kept('hub'));
  assert.deepEqual(calls.at(-1), ['fit']);
});

// proves: explore_recentre
test('a new centre is put in the middle, the boxes gliding there, and ended, the view is as it was before', () => {
  const { regrouping, calls, next, zoom } = cardOf({ hub: [100, 100], a: [300, 300] });
  regrouping.to(kept('hub'));
  calls.length = 0;
  next.at = { hub: [100, 100], a: [300, 300] };
  regrouping.to(kept('a'));
  // the held thing needs no move; then the new centre, its middle at 310, 310, goes to the middle, 200, 200
  assert.deepEqual(calls.at(-1), ['panBy', -110, -110]);
  calls.length = 0;
  regrouping.to(null);
  assert.deepEqual(calls, [['restore', 1, 5, 6]], 'the view it had before the exploration began');
  assert.equal(zoom.holdView, false);
});
