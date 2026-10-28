// How the 3D view is moved (editor spec §53, scale_space_controls): space-controls.ts. Each move has a key, and two
// fingers move and pinch. Moving across the floor keeps the camera's turn, tilt and distance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  between,
  fingerTurn,
  pinchBy,
  tiltsTogether,
  zoomToward,
  fromAbove,
  KEY_STEP,
  ZOOM_STEP,
  keyMove,
  orbitAround,
  panBy,
  turnRound,
  twistBy,
  twistOf,
  touchesStay,
  twoFingers,
} from '../src/space-controls.ts';
import { eyeOf, orbitBy, orbitFit, projectPoint, spaceMatrix, zoomBy } from '../src/space-view.ts';

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

// proves: space_turns_round_pick
test('a drag turns the view round the picked thing, or the middle: it stays still on the screen while all else turns', () => {
  const pivot = [300, -200, 40];
  const at = (o) => projectPoint(spaceMatrix(o, 1, 2000), pivot, 600, 600);
  const start = at(ORBIT);
  let o = ORBIT;
  for (const [dx, dy] of [
    [80, 0],
    [0, 60],
    [-150, -90],
  ]) {
    o = turnRound(o, dx, dy, pivot);
    const now = at(o);
    assert.ok(Math.abs(now.x - start.x) < 0.5 && Math.abs(now.y - start.y) < 0.5, `${now.x}, ${now.y}`);
  }
  assert.notDeepEqual(eyeOf(o), eyeOf(ORBIT), 'the camera did move');
  assert.equal(o.distance, ORBIT.distance);
});

test('one finger turns the view the way it goes: the drawing beyond the middle follows it, where a mouse drags the camera', () => {
  const far = (o) => projectPoint(spaceMatrix(o, 1, 4000), [0, 200, 0], 600, 600);
  const was = far(ORBIT);
  assert.ok(far(fingerTurn(ORBIT, 50, 0)).x > was.x + 20, 'a finger right takes the far side right');
  assert.ok(far(fingerTurn(ORBIT, -50, 0)).x < was.x - 20);
  assert.equal(fingerTurn(ORBIT, 0, 30).tilt, orbitBy(ORBIT, 0, 30).tilt, 'up and down are as they were');
});

// proves: space_glide
test('the view starts from straight above, the drawing flat with its top up, and glides gently to its slant', () => {
  const space = { least: [0, -100, 0], most: [200, 0, 10] };
  const to = orbitFit(space, 1),
    above = fromAbove(to);
  const at = (o, p) => projectPoint(spaceMatrix(o, 1, 400), p, 600, 600);
  // the page's top left, top right and bottom left: as on the page, and square, seen from above
  const [tl, tr, bl] = [
    [0, 0, 0],
    [200, 0, 0],
    [0, -100, 0],
  ].map((p) => at(above, p));
  assert.ok(tl.x < tr.x && Math.abs(tl.y - tr.y) < 0.5, 'its top runs across the screen');
  assert.ok(bl.y > tl.y + 50 && Math.abs(bl.x - tl.x) < 0.5, 'its left side runs down the screen');
  assert.ok(Math.abs((tr.x - tl.x) / (bl.y - tl.y) - 2) < 0.02, 'not squashed: twice as wide as tall, as drawn');
  assert.deepEqual(between(above, to, 0), above);
  assert.deepEqual(between(above, to, 1), to);
  const early = between(above, to, 0.1).tilt - above.tilt,
    mid = between(above, to, 0.5).tilt - above.tilt;
  assert.ok(Math.abs(mid - (to.tilt - above.tilt) / 2) < 1e-9, 'half way at half time');
  assert.ok(Math.abs(early) < Math.abs((to.tilt - above.tilt) * 0.1), 'it starts gently');
});

test('a drag right turns the near side right, the right way up and upside down alike', () => {
  for (const tilt of [0.9, 2.2]) {
    const o = { ...ORBIT, tilt },
      side = Math.cos(tilt) > 0 ? 1 : -1;
    const near = [200 * side * Math.cos(o.turn), 200 * side * Math.sin(o.turn), 0];
    const at = (v) => projectPoint(spaceMatrix(v, 1, 4000), near, 600, 600);
    assert.ok(at(turnRound(o, 50, 0, [0, 0, 0])).x > at(o).x + 20, `tilt ${tilt}`);
  }
});

test('zooming toward a point keeps what is under it under it, from any side', () => {
  for (const tilt of [0.9, 2.2]) {
    const o = { ...ORBIT, tilt },
      aspect = 1.5,
      [nx, ny] = [0.6, -0.4];
    const eye = eyeOf(o);
    // the point of the plane through the target, square to the way the camera looks, which is under the pointer
    const matrix = spaceMatrix(o, aspect, 4000);
    const f = o.target.map((v, i) => v - eye[i]);
    assert.ok(Math.abs(Math.hypot(...f) - o.distance) < 1e-6);
    const sees = (m, p) => projectPoint(m, p, 900, 600);
    // find that point by search along the plane through the target: it is the one that projects to the pointer
    const want = { x: ((nx + 1) / 2) * 900, y: ((1 - ny) / 2) * 600 };
    const grid = [];
    for (let a = -800; a <= 800; a += 20) for (let b = -800; b <= 800; b += 20) grid.push([a, b]);
    const ray = grid
      .map(([a, b]) => [o.target[0] + a, o.target[1] + b, 0])
      .map((p) => ({ p, s: sees(matrix, p) }))
      .filter((c) => c.s)
      .sort((x, y) => Math.hypot(x.s.x - want.x, x.s.y - want.y) - Math.hypot(y.s.x - want.x, y.s.y - want.y))[0];
    const zoomed = zoomToward(o, 2, nx, ny, aspect);
    const was = sees(matrix, ray.p),
      now = sees(spaceMatrix(zoomed, aspect, 4000), ray.p);
    assert.ok(zoomed.distance < o.distance);
    assert.ok(Math.abs(was.x - want.x) < 40, 'the search found the pointer');
    // that point stays near the pointer after zooming, far nearer than if it zoomed on the middle
    const middle = sees(spaceMatrix(zoomBy(o, 2), aspect, 4000), ray.p);
    assert.ok(
      Math.hypot(now.x - was.x, now.y - was.y) < Math.hypot(middle.x - was.x, middle.y - was.y) / 2,
      `tilt ${tilt}`,
    );
  }
  const o = ORBIT;
  assert.deepEqual(zoomToward(o, 2, 0, 0, 1).target, o.target);
});

test('two fingers pinching move, zoom and twist the view in one go, toward their middle', () => {
  const was = [
      { x: 400, y: 250 },
      { x: 500, y: 250 },
    ],
    spread = [
      { x: 350, y: 250 },
      { x: 550, y: 250 },
    ];
  const moved = pinchBy(ORBIT, was, spread, { left: 0, top: 0 }, 900, 600);
  assert.ok(moved.distance < ORBIT.distance, 'spread apart zooms in');
  assert.equal(moved.turn, ORBIT.turn, 'no twist');
  assert.notDeepEqual(moved.target, ORBIT.target, 'toward their middle, off the screen centre');
  assert.equal(pinchBy(ORBIT, was, was, { left: 0, top: 0 }, 900, 600).distance, ORBIT.distance);
});

// stuck_touch (Roger, 27 Oct 2026): a lift that never arrived must not leave a finger tracked
test('the touches really down settle the pointers tracked, keeping the newest', () => {
  const seen = {};
  const el = { addEventListener: (type, fn) => (seen[type] = fn) };
  const down = new Map([
    [1, 'old'],
    [2, 'new'],
  ]);
  touchesStay(el, down);
  const stopped = [];
  seen.touchstart({ touches: { length: 1 }, stopPropagation: () => stopped.push('start') });
  assert.deepEqual([...down.keys()], [2], 'one finger down: only the newest is kept');
  seen.touchend({ touches: { length: 0 }, stopPropagation: () => stopped.push('end') });
  assert.equal(down.size, 0, 'none down: none kept');
  assert.deepEqual(stopped, ['start', 'end'], 'and the host never takes a touch');
});

// proves: space_two_finger_tilt
test('two fingers going up together tilt the view, spreading or sideways ones do not, and tilt is not stopped', () => {
  const at = { left: 0, top: 0 };
  const pair = (y, gap = 100, x = 400) => [
    { x, y },
    { x: x + gap, y },
  ];
  const up = pinchBy(ORBIT, pair(300), pair(280), at, 900, 600);
  assert.ok(up.tilt !== ORBIT.tilt, 'it tilts');
  assert.deepEqual(up.target, ORBIT.target);
  assert.equal(up.distance, ORBIT.distance);
  assert.equal(up.tilt, fingerTurn(ORBIT, 0, -20).tilt, 'as one finger going the same way');
  assert.ok(!tiltsTogether(pair(300), pair(280, 140)), 'spreading is a zoom');
  assert.ok(!tiltsTogether(pair(300), pair(298, 100, 440)), 'mostly sideways moves across');
  let over = ORBIT;
  for (let i = 0; i < 60; i++) over = pinchBy(over, pair(300), pair(310), at, 900, 600);
  assert.ok(over.tilt > Math.PI / 2 || over.tilt < -Math.PI / 2, 'it runs on past straight down or up');
});
