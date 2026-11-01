// A card drawn again in its place, as typing redraws it, stays where the last was left (editor spec §4,
// redraw_keeps_place; risk NEURO-7). type-place.ts leaves the place, and the next card takes it up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, installGlobals } from '../../obsidian/test/host/fake-dom.js';
import { Zoom } from '../src/zoom.ts';

/** A place to leave a card in and take it from, as a host keeps one for each card. */
function stayOf() {
  let left;
  return {
    leave: (at) => (left = at),
    kept: () => {
      const at = left;
      left = undefined;
      return at;
    },
  };
}

/** A card's switch between flat and space, here in 3D with its camera at `orbit`, or flat. */
const spaces = (orbit) => ({ mode: () => (orbit ? 'balls' : null), orbit: () => orbit, startAt() {} });

/** A drawing 800 × 600 in a viewport 400 × 300, zoomed in on its middle. */
function zoomedIn() {
  const z = new Zoom({ width: 800, height: 600 }, { width: 400, height: 300 }, 'note');
  z.zoomIn();
  return z;
}

// proves: redraw_keeps_place
test('a card drawn again takes up the zoom and pan the last was left at, once; a fitted one leaves the next to fit', async () => {
  const uninstall = installGlobals(fakeDocument());
  try {
    const { TypePlace } = await import('../src/display/graph-view/type-place.ts');
    const stay = stayOf(),
      o = { graph: 'Team', mode: 'note', stay };
    const z = zoomedIn(),
      v = z.view();
    new TypePlace().leave(o, null, z, spaces());
    const was = new TypePlace().take(o, 'note');
    assert.deepEqual([was.zoom, was.x, was.y], [v.scale, v.x, v.y], 'the zoom and pan, as left');
    // drawn again, the next card restores it: its zoom is the last one's exactly
    const next = new Zoom({ width: 800, height: 600 }, { width: 400, height: 300 }, 'note');
    next.restore(was.zoom, was.x, was.y);
    assert.deepEqual(next.view(), v);
    assert.equal(new TypePlace().take(o, 'note'), undefined, 'taken once');
    // a fitted card leaves no zoom: the next is fitted too, however its size changed
    const fitted = new Zoom({ width: 800, height: 600 }, { width: 400, height: 300 }, 'note');
    new TypePlace().leave(o, null, fitted, spaces());
    assert.equal(new TypePlace().take(o, 'note').zoom, undefined);
  } finally {
    uninstall();
  }
});

// proves: redraw_keeps_place
test('in space the camera is left too, and the next card opens there; full screen and a card never built leave nothing', async () => {
  const uninstall = installGlobals(fakeDocument());
  try {
    const { TypePlace } = await import('../src/display/graph-view/type-place.ts');
    const stay = stayOf(),
      o = { graph: 'Team', mode: 'note', stay };
    const orbit = { target: [1, 2, 3], distance: 40, yaw: 0.5, pitch: 0.3 };
    new TypePlace().leave(o, null, zoomedIn(), spaces(orbit));
    const place = new TypePlace(),
      was = place.take(o, 'note');
    assert.equal(was.space, 'balls', 'shown in 3D again');
    const started = [];
    place.takeUp(null, null, zoomedIn(), () => {}, { startAt: (at) => started.push(at) });
    assert.deepEqual(started, [orbit], 'its camera where it was');
    new TypePlace().leave({ ...o, mode: 'full' }, null, zoomedIn(), spaces());
    assert.equal(stay.kept(), undefined, 'full screen is not the card in the note');
    new TypePlace().leave(o, null, undefined, spaces());
    assert.equal(stay.kept(), undefined, 'a card gone before it was built was never seen');
  } finally {
    uninstall();
  }
});
