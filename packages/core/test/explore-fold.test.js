// A closed branch folds into its parent, and the camera stays still (editor spec §71, explore_stays_put). Roger, 1 Nov
// 2026: nodes must not jump. Closing a branch glides its things back into the thing they came from, fading, and the
// things left stay where they are on the screen, even in a small drawing the zoom would otherwise centre.
// Requirements: explore_stays_put.
// - A box no longer drawn glides into its nearest parent still drawn, then its copy is taken away.
// - One still drawn, or with no parent drawn, is left alone. Where motion is to be still, nothing glides.
// - While held, a drawing laid out again keeps its zoom and place, though it was fitted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glideAway } from '../src/display/graph-view/regroup.ts';
import { Zoom } from '../src/zoom.ts';

const rect = (x, y) => ({ left: x, top: y, right: x + 10, bottom: y + 10, width: 10, height: 10, x, y });

/** A copy of a box that is put back in the drawing at `x`, `y`, noting how it is told to glide and when it ends. */
function copyAt(x, y) {
  const g = {
    classes: new Set(['thoughtknot-hidden']),
    attrs: new Map([['data-key', 'k']]),
    gone: false,
    classList: {
      remove: (c) => g.classes.delete(c),
      add: (c) => g.classes.add(c),
    },
    removeAttribute: (n) => g.attrs.delete(n),
    setAttribute: (n, v) => g.attrs.set(n, v),
    getBoundingClientRect: () => rect(x, y),
    getBBox: () => ({ width: 10 }),
    remove: () => (g.gone = true),
    animate(frames) {
      g.frames = frames;
      return g;
    },
  };
  return g;
}

/** A drawing of the boxes still drawn, `at` by key, which takes in the copies put back. */
function drawingOf(at, still = false) {
  const kept = Object.entries(at).map(([key, [x, y]]) => ({
    getAttribute: (n) => (n === 'data-key' ? key : null),
    getBoundingClientRect: () => rect(x, y),
  }));
  const layer = { appended: [], appendChild: (g) => layer.appended.push(g) };
  return {
    layer,
    win: { document: { body: { classList: { contains: () => false } } }, matchMedia: () => ({ matches: still }) },
    querySelectorAll: (q) => (q.startsWith('g.node') ? kept : []),
    querySelector: (q) => (q === 'g.graph' ? layer : null),
  };
}

// proves: explore_stays_put
test('a box no longer drawn glides into its nearest parent still drawn, fading, and its copy is taken away', () => {
  const svg = drawingOf({ top: [200, 100] });
  const [a1, deep] = [copyAt(40, 100), copyAt(30, 100)];
  const copies = new Map([
    ['a1', { g: a1, at: rect(300, 140) }],
    ['deep', { g: deep, at: rect(320, 180) }],
  ]);
  glideAway(
    svg,
    copies,
    new Map([
      ['a1', 'top'],
      ['deep', 'a1'],
    ]),
  );
  assert.deepEqual(svg.layer.appended, [a1, deep]);
  assert.ok(a1.classes.has('thoughtknot-ghost') && !a1.classes.has('thoughtknot-hidden'));
  assert.ok(!a1.attrs.has('data-key'), 'a copy is not a thing of the drawing');
  assert.deepEqual(a1.frames, [
    { translate: '260px 40px', opacity: 1 },
    { translate: '160px 0px', opacity: 0 },
  ]);
  assert.equal(deep.frames[1].translate, '170px 0px', 'a deeper one goes into the nearest parent drawn: top');
  a1.onfinish();
  assert.ok(a1.gone);
});

// proves: explore_stays_put
test('a box still drawn, or with no parent drawn, is left alone, and where motion is to be still nothing glides', () => {
  const svg = drawingOf({ top: [200, 100], here: [10, 10] });
  const [here, orphan] = [copyAt(10, 10), copyAt(50, 50)];
  glideAway(
    svg,
    new Map([
      ['here', { g: here, at: rect(10, 10) }],
      ['orphan', { g: orphan, at: rect(50, 50) }],
    ]),
    new Map([['here', 'top']]),
  );
  assert.deepEqual(svg.layer.appended, []);
  const quiet = drawingOf({ top: [200, 100] }, true);
  glideAway(quiet, new Map([['a1', { g: copyAt(0, 0), at: rect(0, 0) }]]), new Map([['a1', 'top']]));
  assert.deepEqual(quiet.layer.appended, []);
});

// proves: explore_stays_put
test('while held, a drawing laid out again keeps its zoom and place, though it was fitted', () => {
  const zoom = new Zoom({ width: 100, height: 100 }, { width: 400, height: 400 }, 'full');
  zoom.fit();
  zoom.holdView = true;
  const before = zoom.view();
  zoom.resize({ width: 400, height: 400 }, { width: 300, height: 200 });
  assert.equal(zoom.view().scale, before.scale);
  zoom.holdView = false;
  zoom.resize({ width: 400, height: 400 }, { width: 100, height: 100 });
  assert.ok(zoom.isFitted(), 'free again, a fitted drawing is fitted again');
});
