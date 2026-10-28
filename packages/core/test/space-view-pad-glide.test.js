// The change between the flat drawing and the view in space glides (editor spec §53, space_glide): space-view-pad.ts.
// The camera glides from above to its slant, frame by frame, and stops at a move. Leaving, the view fades out.
// Where motion is to be still, both happen at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLIDE_MS, FADE_MS, fadeOut, glideIn } from '../src/display/graph-view/space-view-pad.ts';
import { fromAbove } from '../src/space-controls.ts';

const TO = { target: [10, -20, 5], distance: 900, turn: -Math.PI / 2, tilt: 0.9 };

/** A view in a window whose frames and timers run when the test says; `still` asks for no motion. */
function viewAt(still = false) {
  let now = 0;
  const frames = [],
    timers = [],
    heard = new Map();
  const win = {
    performance: { now: () => now },
    requestAnimationFrame: (f) => frames.push(f),
    setTimeout: (f, ms) => timers.push({ f, at: now + ms }),
    matchMedia: () => ({ matches: still }),
    document: { body: { classList: { contains: () => false } } },
  };
  const classes = new Set();
  const el = {
    win,
    addClass: (c) => classes.add(c),
    addEventListener: (type, f) => heard.set(type, f),
    removeEventListener: (type) => heard.delete(type),
  };
  const frame = (ms) => {
    now += ms;
    for (const f of frames.splice(0)) f(now);
  };
  const wait = (ms) => {
    now += ms;
    for (const t of timers.filter((x) => x.at <= now)) t.f();
  };
  const reach = (type) => heard.get(type)?.();
  return { el, frame, wait, reach, classes, heard };
}

// proves: space_glide
test('the camera glides from above to its slant, frame by frame, and stops at once when the view is reached for', () => {
  const { el, frame, heard } = viewAt();
  const seen = [];
  glideIn(el, TO, (o) => seen.push(o));
  assert.deepEqual(seen[0], fromAbove(TO), 'it starts from straight above');
  for (let i = 0; i < 20; i++) frame(GLIDE_MS / 10);
  assert.deepEqual(seen.at(-1), TO, 'and ends at its slant');
  assert.ok(seen.length > 5 && seen.length < 15, `${seen.length} steps, then no more`);
  const tilts = seen.map((o) => o.tilt);
  assert.ok(
    tilts.every((t, i) => i === 0 || t <= (tilts[i - 1] ?? t)),
    'always going down, never back',
  );
  assert.equal(heard.size, 0, 'done, it listens no more');

  for (const type of ['pointerdown', 'wheel', 'keydown']) {
    const view = viewAt(),
      put = [];
    glideIn(view.el, TO, (o) => put.push(o));
    view.frame(GLIDE_MS / 10);
    view.reach(type);
    for (let i = 0; i < 20; i++) view.frame(GLIDE_MS / 10);
    assert.equal(put.length, 2, `${type} stops it: nothing is put after`);
  }
});

// proves: space_glide
test('leaving, the view fades out, then goes; where motion is to be still, the view comes and goes at once', () => {
  const { el, wait, classes } = viewAt();
  let gone = 0;
  fadeOut(el, () => gone++);
  assert.ok(classes.has('is-leaving'));
  assert.equal(gone, 0, 'not before it has faded');
  wait(FADE_MS);
  assert.equal(gone, 1);

  const still = viewAt(true);
  const seen = [];
  glideIn(still.el, TO, (o) => seen.push(o));
  assert.deepEqual(seen, [], 'no glide: the view opens at its slant');
  let now = 0;
  fadeOut(still.el, () => now++);
  assert.equal(now, 1, 'it goes at once');
  assert.equal(still.classes.size, 0, 'with no fade');
});
