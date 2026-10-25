// How the 3D view is moved (editor spec §53, scale_space_controls): space-controls.ts. Each move has a key, and two
// fingers move and pinch. Moving across the floor keeps the camera's turn, tilt and distance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KEY_STEP,
  ZOOM_STEP,
  keyMove,
  orbitAround,
  panBy,
  twistBy,
  twistOf,
  twoFingers,
} from '../src/space-controls.ts';
import { eyeOf, projectPoint, spaceMatrix, zoomBy } from '../src/space-view.ts';

const ORBIT = { target: [0, 0, 0], distance: 1000, turn: -Math.PI / 2, tilt: 0.9 };

test('a drag across moves the view over the floor, and what was under the pointer follows it', () => {
  const moved = panBy(ORBIT, 100, 0, 600);
  assert.equal(moved.distance, ORBIT.distance);
  assert.equal(moved.turn, ORBIT.turn);
  assert.equal(moved.tilt, ORBIT.tilt);
  assert.equal(moved.target[2], 0, 'it stays on the floor');
  // the point the camera looked at is now 100 pixels to the right of the middle, as the drag went
  const at = projectPoint(spaceMatrix(moved, 1, 2000), [0, 0, 0], 600, 600);
  assert.ok(Math.abs(at.x - 400) < 2, `x ${at.x}`);
  assert.ok(Math.abs(at.y - 300) < 2, `y ${at.y}`);
});

test('a drag down brings the drawing nearer: the old middle goes down the screen', () => {
  const moved = panBy(ORBIT, 0, 80, 600);
  const at = projectPoint(spaceMatrix(moved, 1, 2000), [0, 0, 0], 600, 600);
  assert.ok(at.y > 300 + 40, `y ${at.y}`);
  assert.ok(Math.abs(at.x - 300) < 2);
});

test('every move has a key: arrows turn, Shift and arrows move, + and - zoom, Home resets', () => {
  assert.deepEqual(keyMove('ArrowLeft', false), { turn: [-KEY_STEP, 0] });
  assert.deepEqual(keyMove('ArrowUp', false), { turn: [0, -KEY_STEP] });
  assert.deepEqual(keyMove('ArrowRight', true), { pan: [-KEY_STEP, 0] });
  assert.deepEqual(keyMove('+', false), { zoom: ZOOM_STEP });
  assert.deepEqual(keyMove('-', false), { zoom: 1 / ZOOM_STEP });
  assert.deepEqual(keyMove('Home', false), { reset: true });
  assert.deepEqual(keyMove('0', false), { reset: true });
  assert.deepEqual(keyMove('?', true), { help: true });
  assert.deepEqual(keyMove('Escape', false), { back: true });
  assert.equal(keyMove('a', false), null);
});

test('two fingers moving together move the view; spreading apart zooms in', () => {
  const was = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ];
  assert.deepEqual(
    twoFingers(was, [
      { x: 110, y: 120 },
      { x: 210, y: 120 },
    ]),
    { dx: 10, dy: 20, zoom: 1 },
  );
  assert.equal(
    twoFingers(was, [
      { x: 50, y: 100 },
      { x: 250, y: 100 },
    ]).zoom,
    2,
  );
});

test('a picked point becomes what the view turns round and zooms to, the camera staying where it is', () => {
  const point = [300, -200, 50];
  const around = orbitAround(ORBIT, point);
  assert.deepEqual(around.target, point);
  const was = eyeOf(ORBIT),
    now = eyeOf(around);
  assert.ok(Math.hypot(now[0] - was[0], now[1] - was[1], now[2] - was[2]) < 1e-6, 'the camera has not moved');
  // the point is now in the middle of the screen
  const at = projectPoint(spaceMatrix(around, 1, 4000), point, 600, 600);
  assert.ok(Math.abs(at.x - 300) < 1 && Math.abs(at.y - 300) < 1, `${at.x} ${at.y}`);
  // zooming goes toward it from where the camera is: it stays in the middle, nearer
  const nearer = zoomBy(around, 2);
  const seen = projectPoint(spaceMatrix(nearer, 1, 4000), point, 600, 600);
  assert.ok(Math.abs(seen.x - 300) < 1 && Math.abs(seen.y - 300) < 1);
  assert.ok(Math.abs(nearer.distance - around.distance / 2) < 1e-6);
  // part of the way, for a glide: the camera still stays put
  const half = orbitAround(ORBIT, point, 0.5),
    eye = eyeOf(half);
  assert.ok(Math.hypot(eye[0] - was[0], eye[1] - was[1], eye[2] - was[2]) < 1e-6);
  assert.deepEqual(half.target, [150, -100, 25]);
});

test('two fingers twisting turn the view with them: the drawing follows the fingers, clockwise for clockwise', () => {
  const was = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ];
  // the right-hand finger goes down: a quarter turn clockwise on the screen
  const now = [
    { x: 150, y: 50 },
    { x: 150, y: 150 },
  ];
  assert.ok(Math.abs(twistOf(was, now) - Math.PI / 2) < 1e-9);
  assert.equal(twistOf(was, was), 0);
  // across the half turn the angle does not leap by a whole turn
  const near = (y) => [
    { x: 200, y: 100 },
    { x: 100, y },
  ];
  assert.ok(Math.abs(twistOf(near(99), near(101)) + 0.02) < 0.01, 'a line crossing the half turn');
  // seen from above, a point right of the middle goes down the screen as the twist goes clockwise
  const top = { ...ORBIT, tilt: Math.PI / 2 - 0.01 };
  const twisted = twistBy(top, Math.PI / 6);
  assert.equal(twisted.tilt, top.tilt);
  assert.equal(twisted.distance, top.distance);
  const at = (o) => projectPoint(spaceMatrix(o, 1, 4000), [100, 0, 0], 600, 600);
  const before = at(top),
    after = at(twisted);
  const angle = (p) => Math.atan2(p.y - 300, p.x - 300);
  assert.ok(Math.abs(angle(after) - angle(before) - Math.PI / 6) < 0.02, `${angle(before)} -> ${angle(after)}`);
});
