// Lenses bend whatever a view drew round a focus (editor spec §68: projections_all_on, projection_fisheye): lenses.ts.
// A fisheye enlarges what is round its focus and shrinks what is nearer its rim. What lies beyond does not move, and
// nor does the focus. It bends a flat drawing's points and a drawing in space alike, and is chosen by a Render line.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  LENSES,
  WHOLE_LENSES,
  bent,
  bentPoints,
  bentSpace,
  fisheye,
  hyperbolic,
  lensOf,
  spaceSeen,
  sphere,
  unbent,
} from '../src/lenses.ts';
import { readNote } from '../src/drawing.ts';
import { readStyle } from '../src/style.ts';
import { renderFor } from '../src/render-choice.ts';
import { viewLayers } from '../src/view-layers.ts';

const near = (a, b, by = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < by);

describe('a fisheye enlarges round its focus and leaves the rest as drawn (projection_fisheye)', () => {
  const lens = fisheye([100, 100], 50);

  // proves: projection_fisheye
  test('the focus stays put and is enlarged most; beyond the reach nothing moves', () => {
    assert.deepEqual(bent(lens, [100, 100]).at, [100, 100]);
    assert.ok(bent(lens, [100, 100]).times > 1.5, 'the focus is drawn over one and a half times as large');
    assert.deepEqual(bent(lens, [200, 100]), { at: [200, 100], times: 1 });
    assert.deepEqual(bent(lens, [100, 150]), { at: [100, 150], times: 1 }, 'at the rim, as drawn');
  });

  // proves: projection_fisheye
  test('near the focus things are pushed apart, in the same order, so none passes another', () => {
    const out = [1, 5, 10, 20, 30, 40, 49, 50, 60].map((r) => bent(lens, [100 + r, 100]).at[0] - 100);
    assert.ok(out[1] > 5 * 2, 'a thing near the focus is moved over twice as far out');
    assert.ok(out[1] / 5 > bent(lens, [100, 100]).times, 'apart by more than they grow, so neither covers the other');
    assert.ok(
      out.every((r, i) => i === 0 || r > out[i - 1]),
      'the order of distances is kept',
    );
    const times = [1, 10, 25, 49].map((r) => bent(lens, [100, 100 + r]).times);
    assert.ok(
      times.every((t, i) => t >= 1 && (i === 0 || t < times[i - 1])),
      'larger the nearer the focus',
    );
  });

  // proves: projection_fisheye
  test('a point seen through the lens is found where it was drawn, flat and in space', () => {
    for (const p of [
      [110, 95],
      [130, 130],
      [60, 101],
    ])
      assert.ok(near(unbent(lens, bent(lens, p).at), p), `${p}`);
    const ball = fisheye([0, 0, 0], 300);
    const p = [40, -70, 90];
    assert.ok(near(unbent(ball, bent(ball, p).at), p));
    assert.deepEqual(unbent(lens, [500, 500]), [500, 500]);
  });

  // proves: projection_fisheye
  test('no lens, no focus or no reach bends nothing', () => {
    assert.equal(lensOf('none', [0, 0], 10), null);
    assert.equal(lensOf(undefined, [0, 0], 10), null);
    assert.equal(lensOf('fisheye', null, 10), null);
    assert.equal(lensOf('fisheye', [0, 0], 0), null);
    assert.ok(lensOf('fisheye', [0, 0], 10));
  });
});

describe('a lens bends a flat drawing and a drawing in space (projections_all_on)', () => {
  // proves: projection_fisheye
  test('each x,y of an SVG path or list of points is moved, and the rest is left as written', () => {
    const d = 'M68.49,-100C90.6,-80.41 115.07,-64.83 141.91,-53.24';
    assert.equal(
      bentPoints(d, (x, y) => [x + 1, y * 2]),
      'M69.49,-200C91.6,-160.82 116.07,-129.66 142.91,-106.48',
    );
    assert.equal(
      bentPoints('140.94,-50.99 148.34,-50.46', (x, y) => [x, y]),
      '140.94,-50.99 148.34,-50.46',
    );
  });

  /** A drawing in space: two balls far apart, joined by a link with its arrowhead and its words. */
  const space = {
    blocks: [
      { id: 'a', style: 'thing', of: 'a', x: -10, y: -10, width: 20, depth: 20, floor: -10, tall: 20 },
      { id: 'b', style: 'thing', of: 'b', x: 990, y: -10, width: 20, depth: 20, floor: -10, tall: 20 },
    ],
    lines: [
      {
        id: 'l',
        style: 'link',
        from: 'a',
        to: 'b',
        points: [
          [10, 0, 0],
          [990, 0, 0],
        ],
      },
    ],
    labels: [{ id: 'n', style: 'thing', at: [0, 0, 15], text: 'A', size: 12, of: 'a' }],
    arrows: [{ id: 'l\narrow', style: 'link', tip: [990, 0, 0], back: [980, 0, 0], size: 10 }],
    round: true,
    least: [-10, -10, -10],
    most: [1010, 10, 10],
  };

  // proves: projections_all_on
  test('in space the picked thing is enlarged where it is, its name with it, and what is far off is left alone', () => {
    const seen = bentSpace(space, fisheye([0, 0, 0], 300));
    const [a, b] = seen.blocks;
    assert.ok(a.width > 30, 'the picked ball is over one and a half times as wide');
    assert.ok(near([a.x + a.width / 2, a.y + a.depth / 2, a.floor + a.tall / 2], [0, 0, 0]), 'and stays put');
    assert.deepEqual(b, space.blocks[1], 'a ball beyond the reach is as laid out');
    assert.ok(seen.lines[0].points[0][0] > 10, 'the link leaves the larger ball further out');
    assert.deepEqual(seen.lines[0].points[1], [990, 0, 0]);
    assert.ok(seen.labels[0].size > 12, 'its name is larger too');
    assert.deepEqual(seen.arrows, space.arrows, 'the far arrowhead is as drawn');
    assert.deepEqual([seen.least, seen.most], [space.least, space.most], 'the box round it all stays, for the camera');
  });

  // proves: projections_all_on
  test('in space the lens follows the picked thing: with nothing picked, or no lens, it is as laid out', () => {
    assert.equal(spaceSeen(space, 'fisheye', null), space);
    assert.equal(spaceSeen(space, 'none', space.blocks[0]), space);
    assert.ok(spaceSeen(space, 'fisheye', space.blocks[0]).blocks[0].width > 20);
  });
});

describe('a Render line chooses the lens, for the whole graph or a view (projections_all_on)', () => {
  const DATA = "// graph: work\n(a:Task {name: 'A'}),\n(b:Task {name: 'B'}),\n(a)-[:NEXT]->(b)";
  const styled = (...lines) => {
    const texts = [DATA, `// graph: work_style · STYLE work\n${lines.join(',\n')}`];
    return readStyle(texts, 'work', readNote(texts));
  };

  // proves: projections_all_on
  test("a view's own lens wins over the whole graph's, and is the projection layer's", () => {
    const { style, problems } = styled("(r1:Render {lens: 'fisheye', view: 'plan'})", "(r2:Render {space: '3d'})");
    assert.deepEqual(problems, []);
    assert.equal(renderFor(style, 'plan').lens, 'fisheye');
    assert.equal(renderFor(style).lens, 'none');
    assert.deepEqual(viewLayers(style, 'plan').projection, { type: 'network', space: '3d', lens: 'fisheye' });
  });

  // proves: projections_all_on
  test('a lens not among ours is a problem that names them', () => {
    const { style, problems } = styled("(r1:Render {lens: 'fishbowl'})");
    assert.deepEqual(style.renders, []);
    assert.deepEqual(
      problems.map((p) => p.message),
      ['lens must be none, fisheye, hyperbolic, sphere or semantic'],
    );
  });
});

// The lenses that lay the whole drawing on a disc (projection_hyperbolic, projection_sphere). Each keeps its focus,
// enlarges round it and draws the rest nearer its edge, in order. In space each makes a ball.
const REACH = 1000;
const distance = (p) => Math.hypot(...p);

for (const [name, make] of [
  ['hyperbolic', hyperbolic],
  ['sphere', sphere],
]) {
  // proves: projection_hyperbolic, projection_sphere
  test(`a ${name} lens keeps its focus, enlarges round it, and draws the rest nearer its edge in order`, () => {
    const lens = make([0, 0], REACH);
    assert.deepEqual(bent(lens, [0, 0]).at, [0, 0], 'the focus stays put');
    assert.ok(bent(lens, [0, 0]).times > 1.2, 'and is drawn larger');
    const near = distance(bent(lens, [50, 0]).at),
      far = distance(bent(lens, [800, 0]).at);
    assert.ok(near > 50, 'near the focus things are pushed apart');
    assert.ok(far > near && far < REACH, 'further out they are drawn nearer the edge, in the same order, inside it');
    assert.ok(bent(lens, [900, 0]).times < 1, 'near the edge things are drawn smaller');
    assert.ok(bent(lens, [990, 0]).times >= 0.25, 'but none vanishes');
    for (const p of [
      [120, -40],
      [600, 300],
    ]) {
      const back = unbent(lens, bent(lens, p).at);
      assert.ok(Math.abs(back[0] - p[0]) < 1e-6 && Math.abs(back[1] - p[1]) < 1e-6, `found where ${p} was drawn`);
    }
  });
}

// proves: projection_hyperbolic, projection_sphere
test('both are offered as lenses, reach the whole drawing, and lensOf makes each', () => {
  assert.deepEqual([...LENSES], ['none', 'fisheye', 'hyperbolic', 'sphere', 'semantic']);
  assert.deepEqual([...WHOLE_LENSES], ['hyperbolic', 'sphere']);
  const h = lensOf('hyperbolic', [0, 0], REACH),
    s = lensOf('sphere', [0, 0], REACH);
  assert.equal(h.reach, REACH);
  assert.notEqual(distance(bent(h, [500, 0]).at), distance(bent(s, [500, 0]).at), 'two different discs');
});

/** A drawing in space of two blocks: one at the middle, one far off in a corner. */
const block = (key, x, y) => ({ key, x, y, floor: 0, width: 10, depth: 10, tall: 10 });
const SPACE = {
  blocks: [block('a', 495, 495), block('b', 0, 0)],
  lines: [],
  labels: [],
  arrows: [],
  least: [0, 0, 0],
  most: [1000, 1000, 10],
};

// proves: projection_hyperbolic
test('in space each lays the drawing in a ball: round the picked thing, else round its middle', () => {
  const seen = spaceSeen(SPACE, 'hyperbolic', null);
  const [a, b] = seen.blocks;
  assert.ok(a.width > 10, 'the middle is enlarged though nothing is picked');
  assert.ok(Math.abs(a.x + a.width / 2 - 500) < 1e-6, 'and stays where it is');
  assert.ok(b.width < 10, 'the far corner is drawn smaller');
  assert.ok(
    Math.hypot(b.x + b.width / 2 - 500, b.y + b.depth / 2 - 500) < 1.15 * Math.hypot(495, 495),
    'inside the edge',
  );
  const picked = spaceSeen(SPACE, 'sphere', SPACE.blocks[1]).blocks[1];
  assert.ok(picked.width > 10, 'a picked thing is the middle of a globe');
});
