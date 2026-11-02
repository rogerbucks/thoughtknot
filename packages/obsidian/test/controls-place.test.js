// Panels you move, dock and minimise (editor spec §25, controls_panels). Roger, 2 Nov 2026: the controls are panels
// that can be docked, minimised and moved over the drawing.
// - A dock dropped stays inside the drawing. Dropped near a side, it docks there.
// - Its buttons dock it at either side. With its grip in focus, arrow keys move it free and Home and End dock it.
// - Where it was left is kept for the session, so a card drawn again puts it back there.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';

before(() => build());

let env, el, placeIn, SNAP;
before(async () => {
  env = await load();
  el = (await show(env, fence(GRAPH))).el;
  ({ placeIn, SNAP } = await import('../../core/src/display/graph-view/controls-place.ts'));
});
after(() => env.uninstall());

const dock = () => el.querySelector('.thoughtknot-explore-sidebar');
const labelled = (start) =>
  dock()
    .querySelectorAll('button')
    .find((b) => b.getAttribute('aria-label')?.startsWith(start));

/** Starts exploring from the first thing the bar's search finds for `text`. */
async function explore(text) {
  el.querySelectorAll('button')
    .find((b) => b.getAttribute('aria-label')?.startsWith('Find a thing'))
    .click();
  const bar = el.querySelector('.thoughtknot-find'),
    input = bar.querySelector('input');
  input.value = text;
  input.dispatch('input');
  bar.querySelector('.thoughtknot-find-explore').click();
  await until(() => !dock().hidden);
}

const room = { w: 1000, h: 700 };

// proves: controls_panels
test('a dock dropped stays inside the drawing, and docks when dropped near a side', () => {
  assert.deepEqual(placeIn(400, 200, 280, 300, room), { side: 'free', x: 400, y: 200 });
  assert.deepEqual(placeIn(900, 600, 280, 300, room), { side: 'end', x: 720, y: 400 }, 'pushed back in, at the end');
  assert.deepEqual(placeIn(-50, -20, 280, 300, room), { side: 'start', x: 0, y: 0 }, 'pushed back in, at the start');
  assert.equal(placeIn(SNAP + 1, 10, 280, 300, room).side, 'free', 'just clear of the side it stays free');
  assert.equal(placeIn(1000 - 280 - SNAP - 1, 10, 280, 300, room).side, 'free');
  assert.equal(placeIn(1000 - 280 - SNAP, 10, 280, 300, room).side, 'end');
});

// proves: controls_panels
test('its buttons dock it at either side, and its grip moves it free by the arrow keys', async () => {
  await explore('Tablet');
  const corner = dock().parentElement;
  assert.ok(corner.classList.contains('thoughtknot-corner'), 'it starts in the controls card');
  labelled('Dock Explore at the right').click();
  assert.ok(dock().parentElement.classList.contains('thoughtknot-corner-end'), 'docked in the end corner');
  assert.equal(dock().getAttribute('data-place'), 'end');
  labelled('Dock Explore at the left').click();
  assert.equal(dock().parentElement, corner, 'back in the start corner');
  const grip = labelled('Move Explore');
  assert.ok(grip.classList.contains('thoughtknot-dock-grip'));
  grip.dispatch('keydown', { key: 'ArrowDown' });
  assert.ok(dock().classList.contains('is-free'), 'an arrow key frees it');
  assert.ok(dock().parentElement.classList.contains('thoughtknot-over'), 'a card of its own in the layer');
  assert.match(dock().cssProps['--thoughtknot-at-y'], /^\d+px$/);
  grip.dispatch('keydown', { key: 'End' });
  assert.ok(!dock().classList.contains('is-free'));
  assert.ok(dock().parentElement.classList.contains('thoughtknot-corner-end'), 'End docks it at the end');
  grip.dispatch('keydown', { key: 'Home' });
  assert.equal(dock().parentElement, corner, 'Home docks it at the start');
});

// proves: controls_panels
test('where it was left is kept for the session: a card drawn again puts it back there', async () => {
  labelled('Dock Explore at the right').click();
  el = (await show(env, fence(GRAPH))).el;
  await explore('Tablet');
  assert.ok(dock().parentElement.classList.contains('thoughtknot-corner-end'), 'still at the end');
  labelled('Dock Explore at the left').click();
  assert.ok(dock().parentElement.classList.contains('thoughtknot-corner'));
});
