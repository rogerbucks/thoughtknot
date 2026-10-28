// The view in space glides as its drawing is laid out again (editor spec §68, layout_glide): space-view-glide.ts.
// The things and the camera ease to where they go. A reach for the view ends it at once. Where motion is to be still,
// the end shows at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpaceGlide } from '../src/display/graph-view/space-view-glide.ts';
import { LAYOUT_GLIDE_MS } from '../src/layout-glide.ts';
import { spotsOf } from '../src/space-glide.ts';

const ball = (k, x) => ({ id: k, style: 's', of: k, x, y: 0, width: 10, depth: 10, floor: 0, tall: 10 });
const spaceAt = (x) => ({
  blocks: [ball('a', x)],
  lines: [],
  labels: [],
  arrows: [],
  least: [0, 0, 0],
  most: [1, 1, 1],
});
const ORBIT = (d) => ({ target: [0, 0, 0], distance: d, turn: 0, tilt: 0.9 });

/** The view in a window whose frames run when the test says; `still` asks for no motion. */
function viewOf(still = false) {
  let now = 0;
  const frames = [],
    heard = new Map();
  const win = {
    requestAnimationFrame: (f) => frames.push(f),
    matchMedia: () => ({ matches: still }),
    document: { body: { classList: { contains: () => false } } },
  };
  const el = { win, addEventListener: (type, f, o) => heard.set(type, { f, o }) };
  const frame = (ms) => {
    now += ms;
    for (const f of frames.splice(0)) f(now);
  };
  return { el, frame, frames, reach: (type) => heard.get(type)?.f(), heard };
}

/** A glide in the view `v`, first showing `space`, keeping each camera it is put at. */
function glideIn(v, space) {
  const cameras = [];
  let painted = 0;
  const glide = new SpaceGlide(
    v.el,
    space,
    () => painted++,
    (o) => cameras.push(o),
  );
  return { glide, cameras, painted: () => painted };
}

const across = (glide) => spotsOf(glide.shown).get('a')[0];

// proves: layout_glide
test('the things and the camera ease from where they were to where they go, then show as laid out', () => {
  const v = viewOf();
  const { glide, cameras } = glideIn(v, spaceAt(0));
  const was = glide.settle();
  const now = spaceAt(100);
  glide.to(now, was, ORBIT(500), ORBIT(800));
  assert.equal(across(glide), 5, 'it starts where it was');
  assert.equal(cameras[0].distance, 500, 'the camera too');
  const seen = [];
  for (let i = 0; i < 12; i++) {
    v.frame(LAYOUT_GLIDE_MS / 10);
    seen.push(across(glide));
  }
  assert.ok(
    seen.every((x, i) => i === 0 || x >= seen[i - 1]),
    'always on its way, never back',
  );
  assert.equal(glide.shown, now, 'and ends as laid out');
  assert.equal(cameras.at(-1).distance, 800);
  assert.equal(v.frames.length, 0, 'no frame asked for after');
});

// proves: layout_glide
test('a reach for the view ends the glide at once, caught before the view acts on it; still, the end shows at once', () => {
  for (const type of ['pointerdown', 'wheel', 'keydown']) {
    const v = viewOf();
    const { glide, cameras } = glideIn(v, spaceAt(0));
    assert.equal(v.heard.get(type).o.capture, true, `${type} is caught on the way down`);
    const now = spaceAt(100);
    glide.to(now, glide.settle(), ORBIT(500), ORBIT(800));
    v.frame(LAYOUT_GLIDE_MS / 10);
    v.reach(type);
    assert.equal(glide.shown, now, `${type}: as laid out`);
    assert.equal(cameras.at(-1).distance, 800, 'the camera where the glide was taking it');
    const put = cameras.length;
    v.frame(LAYOUT_GLIDE_MS / 10);
    assert.equal(cameras.length, put, 'and nothing more is put');
  }
  const v = viewOf(true);
  const { glide, cameras, painted } = glideIn(v, spaceAt(0));
  const now = spaceAt(100);
  glide.to(now, glide.settle(), ORBIT(500), ORBIT(800));
  assert.equal(glide.shown, now, 'still: shown as laid out at once');
  assert.equal(cameras.length, 0, 'the camera left where the view put it');
  assert.equal(painted(), 1);
  assert.equal(v.frames.length, 0);
});

// proves: layout_glide
test('the picked thing’s ring glides with it: the block shown now is the one marked', () => {
  const v = viewOf();
  const { glide } = glideIn(v, spaceAt(0));
  const now = spaceAt(100);
  const picked = now.blocks[0];
  glide.to(now, glide.settle(), ORBIT(500), ORBIT(800));
  v.frame(LAYOUT_GLIDE_MS / 2);
  const marked = glide.match(picked);
  assert.notEqual(marked, picked, 'mid-glide, the block on its way');
  assert.equal(marked.x, glide.shown.blocks[0].x);
  assert.equal(glide.match(null), null);
  glide.settle();
  assert.equal(glide.match(picked), picked, 'once there, the block itself');
});
