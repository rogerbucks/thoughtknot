// A card's drawing laid out again glides (editor spec §68, layout_glide; ethos principle 8): layout-glide-svg.ts.
// The person's place is kept. Each box starts where it was on the screen and eases to where it goes. The links fade
// in as the boxes arrive, and a reach for the drawing ends it at once. Where motion is to be still, the end shows at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LayoutGlide } from '../src/display/graph-view/layout-glide-svg.ts';
import { LAYOUT_GLIDE_MS } from '../src/layout-glide.ts';
import { Zoom } from '../src/zoom.ts';

/** A part of the drawing: a box with its key, or a link; it keeps its attributes and its opacity. */
function partOf(id, key) {
  const attrs = new Map(key ? [['data-key', key]] : []);
  return {
    id,
    css: {},
    getAttribute: (n) => (n === 'id' ? id : (attrs.get(n) ?? null)),
    setAttribute: (n, v) => attrs.set(n, v),
    removeAttribute: (n) => attrs.delete(n),
    setCssStyles(s) {
      Object.assign(this.css, s);
    },
  };
}

/** A drawing 1000 × 1000, its boxes by key at the spots given, with one link; and the taps that read where they are. */
function drawingOf(at) {
  const boxes = Object.keys(at).map((k, i) => partOf(`node${i + 1}`, k)),
    link = partOf('edge1');
  const svg = {
    getAttribute: (n) => (n === 'viewBox' ? '0 0 1000 1000' : null),
    querySelector: (q) =>
      q === 'g.graph'
        ? { getAttribute: () => 'scale(1 1) rotate(0) translate(4 196)' }
        : (boxes.find((b) => `#${b.id}` === q) ?? null),
    querySelectorAll: (q) => (q.startsWith('g.node') ? boxes : [link]),
  };
  const taps = {
    places: (keyOf) =>
      new Map(boxes.map((b, i) => [keyOf(b.id), { x: Object.values(at)[i][0], y: Object.values(at)[i][1] }])),
  };
  const box = (k) => boxes.find((b) => b.getAttribute('data-key') === k);
  return { svg, taps, box, link };
}

/** The card's viewport in a window whose frames run when the test says; `still` asks for no motion. */
function viewportOf(still = false) {
  let now = 0;
  const frames = [],
    heard = new Map();
  const win = {
    requestAnimationFrame: (f) => frames.push(f),
    matchMedia: () => ({ matches: still }),
    document: { body: { classList: { contains: () => false } } },
  };
  // only what is heard on the way down, before the view's own pan and zoom act on the reach
  const viewport = {
    win,
    addEventListener: (type, f, o) => o?.capture && heard.set(type, f),
    removeEventListener: (type, f) => heard.get(type) === f && heard.delete(type),
  };
  const frame = (ms) => {
    now += ms;
    for (const f of frames.splice(0)) f(now);
  };
  return { viewport, frame, reach: (type) => heard.get(type)?.(), frames };
}

const shift = (g) => {
  const m = /translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(g.getAttribute('transform') ?? '');
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
};
/** The drawing at natural size in a viewport a fifth its width, zoomed in, so its place is the person's own. */
const zoomed = () => {
  const z = new Zoom({ width: 1000, height: 1000 }, { width: 200, height: 200 }, 'full');
  z.restore(1, -400, -400);
  return z;
};

// proves: layout_glide
test('each box starts where it was on the screen and eases to where it goes; the links fade in as they arrive', () => {
  const { viewport, frame } = viewportOf();
  const glide = new LayoutGlide(() => viewport);
  const zoom = zoomed();
  const old = drawingOf({ a: [50, 50], b: [150, 50] });
  const was = glide.before(old.svg, old.taps, zoom.view());
  const fresh = drawingOf({ a: [250, 150], b: [150, 150] });
  glide.after(fresh.svg, fresh.taps, zoom, was, null);
  const v = zoom.view();
  // each box's offset takes it back to where it was on the screen: shown at (-400, -400) then, at `v` now
  const onScreen = (k, at) => shift(fresh.box(k)).map((d, i) => d + at[i] + [v.x, v.y][i]);
  assert.deepEqual(onScreen('a', [250, 150]), [50 - 400, 50 - 400], 'a starts where it was');
  assert.deepEqual(onScreen('b', [150, 150]), [150 - 400, 50 - 400], 'and so does b');
  assert.equal(fresh.link.css.opacity, '0', 'the link waits for the boxes it joins');
  const seen = [];
  for (let i = 0; i < 12; i++) {
    frame(LAYOUT_GLIDE_MS / 10);
    seen.push(Math.abs(shift(fresh.box('a'))[0]));
  }
  assert.ok(
    seen.every((x, i) => i === 0 || x <= seen[i - 1]),
    'always on its way, never back',
  );
  assert.equal(fresh.box('a').getAttribute('transform'), null, 'and ends exactly where it goes');
  assert.equal(fresh.link.css.opacity, '', 'the link shown as the drawing shows it');
});

// proves: layout_glide
test('the selected thing stays on the screen where it was; a fitted drawing stays fitted', () => {
  const zoom = zoomed();
  const glide = new LayoutGlide(
    (
      (vp) => () =>
        vp
    )(viewportOf().viewport),
  );
  const old = drawingOf({ a: [50, 50], b: [150, 50] });
  const was = glide.before(old.svg, old.taps, zoom.view());
  const fresh = drawingOf({ a: [150, 150], b: [50, 150] });
  const before = zoom.view();
  glide.after(fresh.svg, fresh.taps, zoom, was, 'b');
  const v = zoom.view();
  assert.deepEqual([v.x - before.x, v.y - before.y], [100, -100], 'the view moved so b is where it was');
  assert.deepEqual(shift(fresh.box('b')), [0, 0], 'b does not move at all');
  assert.deepEqual(shift(fresh.box('a')), [-200, 0]);

  const fit = new Zoom({ width: 1000, height: 1000 }, { width: 200, height: 200 }, 'full');
  fit.fit();
  const g = new LayoutGlide(
    (
      (vp) => () =>
        vp
    )(viewportOf().viewport),
  );
  const w = g.before(old.svg, old.taps, fit.view());
  const at = fit.view();
  g.after(fresh.svg, fresh.taps, fit, w, 'b');
  assert.deepEqual(fit.view(), at, 'fitted, as the person left it');
});

// proves: layout_glide
test('a reach for the drawing ends the glide at once; where motion is to be still, the end shows at once', () => {
  for (const type of ['pointerdown', 'wheel', 'keydown']) {
    const { viewport, frame, reach } = viewportOf();
    const glide = new LayoutGlide(() => viewport);
    const zoom = zoomed();
    const old = drawingOf({ a: [50, 50], b: [150, 50] });
    const was = glide.before(old.svg, old.taps, zoom.view());
    const fresh = drawingOf({ a: [250, 150], b: [150, 150] });
    glide.after(fresh.svg, fresh.taps, zoom, was, null);
    frame(LAYOUT_GLIDE_MS / 10);
    reach(type);
    assert.equal(fresh.box('a').getAttribute('transform'), null, `${type}: every box where it goes`);
    assert.equal(fresh.link.css.opacity, '');
  }
  const { viewport, frames } = viewportOf(true);
  const glide = new LayoutGlide(() => viewport);
  const zoom = zoomed();
  const old = drawingOf({ a: [50, 50], b: [150, 50] });
  const was = glide.before(old.svg, old.taps, zoom.view());
  const fresh = drawingOf({ a: [250, 150], b: [150, 150] });
  glide.after(fresh.svg, fresh.taps, zoom, was, 'a');
  assert.equal(fresh.box('b').getAttribute('transform'), null, 'nothing glides');
  assert.equal(frames.length, 0, 'and no frame is asked for');
  assert.deepEqual([zoom.view().x, zoom.view().y], [-600, -500], 'the place is still kept: a where it was');
});

// proves: layout_glide
test('laid out again with every box where it was, as when its curves come, nothing glides or fades', () => {
  const { viewport, frames } = viewportOf();
  const glide = new LayoutGlide(() => viewport);
  const zoom = zoomed();
  const old = drawingOf({ a: [50, 50], b: [150, 50] });
  const was = glide.before(old.svg, old.taps, zoom.view());
  const same = drawingOf({ a: [50, 50], b: [150, 50] });
  glide.after(same.svg, same.taps, zoom, was, null);
  assert.equal(frames.length, 0);
  assert.equal(same.link.css.opacity, undefined);
});
