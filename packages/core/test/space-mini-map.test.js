// The mini-map of the view in space (editor spec §24, space_mini_map; ethos principle 8). The plan is the whole drawing
// seen from straight above, with the floor the camera sees outlined, its near side the narrower (space-plan.ts). The
// mini-map shows it by the setting and marks the picked thing. A tap or drag on it moves the camera there. The press
// goes no further (space-mini-map.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, installGlobals } from '../../obsidian/test/host/fake-dom.js';
import { allInView, lookAt, planOf, seenOf } from '../src/space-plan.ts';
import { orbitFit, spaceMatrix } from '../src/space-view.ts';

/** Two things far apart and a link between them, laid out in space. */
const block = (of, x, y) => ({ id: `t:${of}`, style: 'thing', of, x, y, width: 100, depth: 40, floor: 0, tall: 20 });
const SPACE = {
  blocks: [block('a', 0, 0), block('b', 900, 500)],
  lines: [
    {
      id: 'e:ab',
      style: 'link',
      points: [
        [100, 20, 10],
        [900, 520, 10],
      ],
    },
  ],
  labels: [],
  arrows: [],
  least: [0, 0, 0],
  most: [1000, 540, 20],
};
const W = 800,
  H = 600;
const near = (a, b, why, by = 1e-6) => assert.ok(Math.abs(a - b) < by, `${why}: ${a} is not ${b}`);
const width = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

// proves: space_mini_map
test('the plan is the whole drawing from above: each footprint, each line, and a margin round it', () => {
  const plan = planOf(SPACE);
  assert.deepEqual(plan.boxes[1], { x: 900, y: 500, width: 100, height: 40, of: 'b' });
  assert.deepEqual(plan.lines, [
    [
      [100, 20],
      [900, 520],
    ],
  ]);
  const { bounds: b } = plan;
  assert.ok(b.x < 0 && b.y < 0 && b.x + b.width > 1000 && b.y + b.height > 540, 'every thing inside, with room');
});

// proves: space_mini_map
test('the floor seen is outlined: square from above, its near side the narrower from a slant', () => {
  const fit = orbitFit(SPACE, W / H);
  const above = seenOf({ ...fit, tilt: Math.PI / 2 - 1e-6 }, W / H);
  const [a, b, c] = above;
  near(width(a, b) / width(b, c), W / H, 'from above, the shape of the screen');
  const middle = [0, 1].map((k) => above.reduce((s, p) => s + p[k], 0) / 4);
  near(middle[0], fit.target[0], 'round what it looks at', 1e-3);
  near(middle[1], fit.target[1], 'round what it looks at', 1e-3);
  // from the slant it opens with: the far side, at the top of the screen, is the wider
  const [farLeft, farRight, nearRight, nearLeft] = seenOf(fit, W / H);
  assert.ok(width(farLeft, farRight) > width(nearLeft, nearRight) * 1.2, 'the near side narrower');
  // a corner looking over the horizon still meets the floor, far off
  const low = seenOf({ ...fit, tilt: 0.05 }, W / H);
  assert.ok(low.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
});

// proves: space_mini_map
test('every thing in view, fitted; not, zoomed in; and a spot looked at keeps the turn, tilt and distance', () => {
  const fit = orbitFit(SPACE, W / H);
  const matrix = (o) => spaceMatrix(o, W / H, 2000);
  assert.equal(allInView(SPACE, matrix(fit), W, H), true, 'fitted');
  assert.equal(allInView(SPACE, matrix({ ...fit, distance: fit.distance / 6 }), W, H), false, 'zoomed in');
  const moved = lookAt(fit, [900, 500]);
  assert.deepEqual(moved, { ...fit, target: [900, 500, fit.target[2]] });
});

/** The mini-map in a view of the fake page, shown by `setting`, and the camera it moves. */
async function mapIn(setting) {
  const doc = fakeDocument(W),
    uninstall = installGlobals(doc);
  const { SpaceMiniMap } = await import('../src/display/graph-view/space-mini-map.ts');
  const view = doc.body.createDiv();
  let orbit = orbitFit(SPACE, W / H);
  const said = { setting };
  const map = new SpaceMiniMap(
    view,
    () => said.setting,
    (by) => (orbit = by(orbit)),
  );
  const update = (o = orbit, picked = null) => map.update(SPACE, o, spaceMatrix(o, W / H, 2000), [W, H], picked);
  return { map, said, update, orbit: () => orbit, uninstall };
}

// proves: space_mini_map
test('it shows by the setting: never, when some thing is off the screen, or always', async () => {
  const { map, said, update, orbit, uninstall } = await mapIn('auto');
  try {
    update();
    assert.equal(map.el.hidden, true, 'auto: all in view, none');
    update({ ...orbit(), distance: orbit().distance / 6 });
    assert.equal(map.el.hidden, false, 'auto: zoomed in, shown');
    said.setting = 'off';
    update({ ...orbit(), distance: orbit().distance / 6 });
    assert.equal(map.el.hidden, true, 'off');
    said.setting = 'always';
    update();
    assert.equal(map.el.hidden, false, 'always');
    assert.ok(map.el.hasClass('is-space'), 'in the corner the buttons leave free');
  } finally {
    uninstall();
  }
});

// proves: space_mini_map
test('it copies every thing, marks the picked one, and outlines the floor seen', async () => {
  const { map, update, orbit, uninstall } = await mapIn('always');
  try {
    update(orbit(), SPACE.blocks[1]);
    const boxes = map.el.querySelectorAll('rect.thoughtknot-mini-box');
    assert.equal(boxes.length, 2, 'every thing');
    assert.deepEqual(
      boxes.map((r) => r.hasClass('is-picked')),
      [false, true],
      'the picked thing marked',
    );
    assert.equal(map.el.querySelectorAll('polyline.thoughtknot-mini-line').length, 1, 'each link');
    const points = () => map.el.querySelector('polygon.thoughtknot-mini-frame').getAttribute('points');
    assert.equal(points().split(' ').length, 4, 'the floor seen, outlined');
    const was = points();
    update({ ...orbit(), turn: orbit().turn + 1 });
    assert.notEqual(points(), was, 'and it follows the camera');
    update(orbit(), null);
    assert.equal(map.el.querySelectorAll('rect.is-picked').length, 0, 'nothing picked, nothing marked');
  } finally {
    uninstall();
  }
});

// proves: space_mini_map
test('a tap or drag on it moves the view there, and goes no further than the mini-map', async () => {
  const { map, update, orbit, uninstall } = await mapIn('always');
  try {
    update();
    const before = orbit();
    const svg = map.el.querySelector('svg'),
      r = svg.getBoundingClientRect();
    let stopped = 0;
    const press = (type, fx, fy) =>
      map.el.dispatch(type, {
        target: svg,
        pointerId: 3,
        button: 0,
        clientX: r.left + fx * r.width,
        clientY: r.top + fy * r.height,
        stopPropagation: () => stopped++,
      });
    // the plan's bounds, from planOf: the spot under the pointer, at a share across and down
    const { bounds: b } = planOf(SPACE);
    press('pointerdown', 0.9, 0.9);
    assert.deepEqual(orbit(), { ...before, target: [b.x + 0.9 * b.width, b.y + 0.9 * b.height, before.target[2]] });
    press('pointermove', 0.1, 0.5);
    near(orbit().target[0], b.x + 0.1 * b.width, 'dragged across');
    press('pointerup', 0.1, 0.5);
    press('pointermove', 0.5, 0.5);
    near(orbit().target[0], b.x + 0.1 * b.width, 'let go, it stays');
    assert.equal(stopped, 4, 'none of its presses reach the view under it');
  } finally {
    uninstall();
  }
});
