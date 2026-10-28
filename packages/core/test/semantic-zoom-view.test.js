// Semantic zoom on a card (editor spec §68, projection_semantic_zoom): semantic-zoom-view.ts. Picked as the lens, it
// steps the View menu's ladder once the zoom rests, the way the person zoomed. It never steps while a new layout glides
// in, so the new picture's size never steps it again. With another lens, zooming changes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SemanticZoom, SEMANTIC_REST_MS } from '../src/display/graph-view/semantic-zoom-view.ts';
import { onScreen } from '../src/display/graph-view/layout-glide-svg.ts';
import { ViewState } from '../src/view-switches.ts';

/** A card of 300 things in a viewport 800 × 600, its timers run by hand, and the rungs it was stepped to. */
function cardOf(lens = 'semantic') {
  const state = new ViewState({ labels: true, hubs: false, groups: true, merge: true, engine: false, lanes: true });
  [state.lens, state.things] = [lens, 300];
  let timers = [];
  const win = {
    setTimeout: (f, ms) => timers.push({ f, ms }) - 1,
    clearTimeout: (id) => (timers[id] = null),
  };
  const run = () => {
    const due = timers.filter(Boolean);
    timers = [];
    for (const t of due) t.f();
  };
  const view = { scale: 1, x: 0, y: 0, width: 800, height: 600 };
  const steps = [];
  const zoom = new SemanticZoom({
    win,
    state,
    view: () => view,
    size: () => ({ width: 800, height: 600 }),
    step: (r) => {
      steps.push(r);
      state.toRung(r);
    },
  });
  /** Zooms to `scale`, the drawing that much larger, and lets it rest. */
  const zoomTo = (scale) => {
    Object.assign(view, { scale, width: 800 * scale, height: 600 * scale });
    zoom.changed();
    run();
  };
  return { zoom, state, steps, view, zoomTo, timers: () => timers.filter(Boolean) };
}

// proves: projection_semantic_zoom
test('zooming in steps the ladder to more detail once the zoom rests, and zooming out back', () => {
  const { zoom, state, steps, zoomTo, timers } = cardOf();
  zoomTo(0.4); // 800 × 600 holds 24 things' room at natural size: here 150
  assert.deepEqual(steps, [], 'the first rest is where zooming is judged from');
  zoom.changed();
  assert.equal(timers()[0].ms, SEMANTIC_REST_MS, 'it waits for the zoom to rest');
  zoomTo(0.7); // 49 things on screen
  assert.deepEqual(steps, ['groups']);
  zoomTo(1.3); // 14
  assert.deepEqual(steps, ['groups', 'all']);
  zoomTo(2); // 6
  assert.deepEqual(steps, ['groups', 'all', 'properties']);
  assert.equal(state.properties, true);
  zoomTo(0.45); // 118
  assert.deepEqual(steps.at(-1), 'overview');
});

// proves: projection_semantic_zoom
test('a new layout gliding in never steps it, and with another lens zooming changes nothing', () => {
  const { zoom, steps, zoomTo } = cardOf();
  zoomTo(0.4);
  zoom.redrawn();
  zoomTo(2);
  assert.deepEqual(steps, [], 'the view the new layout settles in is only where the next zoom is judged from');
  const other = cardOf('fisheye');
  other.zoomTo(0.4);
  other.zoomTo(2);
  assert.deepEqual(other.steps, []);
});

// proves: projection_semantic_zoom
test('picked in the View menu, it steps at once to the rung that fits', () => {
  const { zoom, state, steps, view } = cardOf('none');
  zoom.picked();
  assert.deepEqual(steps, [], 'no semantic zoom, no step');
  state.lens = 'semantic';
  [state.things, view.scale] = [40, 0.5];
  zoom.picked();
  assert.deepEqual(steps, ['groups'], 'all forty fit in view: each shown, the links bundled');
});

// proves: projection_semantic_zoom
test("a folded group's box stands for its things, so a new layout that opens it keeps them where the box was", () => {
  const outline = { getAttribute: (n) => (n === 'd' ? 'M80,40L120,40L120,60L80,60Z' : null) };
  const box = {
    getAttribute: (n) => (n === 'data-keys' ? 'a b' : null),
    querySelector: () => outline,
  };
  const svg = {
    getAttribute: (n) => (n === 'viewBox' ? '0 0 200 100' : null),
    querySelector: (q) => (q === 'g.graph' ? { getAttribute: () => 'scale(1 1) rotate(0) translate(0 0)' } : null),
    querySelectorAll: (q) => (q === 'g.node[data-keys]' ? [box] : []),
  };
  const taps = { places: () => new Map([['b', { x: 10, y: 10 }]]) };
  const seen = onScreen(svg, taps, { scale: 2, x: 5, y: 0, width: 400, height: 200 });
  assert.deepEqual(seen.get('a'), [205, 100], 'drawn inside the box, at its middle on the screen');
  assert.deepEqual(seen.get('b'), [25, 20], 'a thing drawn on its own keeps its own place');
});
