// Right-angled and straight links drawn by our own router (ES§25, untangle_routing; ES§68, layout_own_engine).
// Graphviz drew them as its own lines. Now each right-angled link runs only across and down, round the boxes in its
// way. It leaves and reaches its boxes the drawing's way. Spans layouts/elbow-route.ts, direct-links.ts and render.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { elbowCurve, elbowRoute } from '../src/layouts/elbow-route.ts';
import { readNote } from '../src/drawing.ts';
import { directions } from '../src/render.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';
import { measuredMarks } from '../src/layouts/measure.ts';
import { groupsIn, kindsIn, linesIn, optionsIn, ownLaid } from '../src/layouts/own-draw.ts';

const box = (key, x, y) => ({ key, x, y, hw: 50, hh: 20 });
const inside = (b, [x, y]) => Math.abs(x - b.x) < b.hw && Math.abs(y - b.y) < b.hh;
/** The points every few pixels along the corners `way`. */
const along = (way) =>
  way.slice(1).flatMap((q, i) => {
    const p = way[i];
    return Array.from({ length: 21 }, (_, k) => [p[0] + ((q[0] - p[0]) * k) / 20, p[1] + ((q[1] - p[1]) * k) / 20]);
  });
const square = (way) => way.slice(1).every((q, i) => q[0] === way[i][0] || q[1] === way[i][1]);

describe('a right-angled link', () => {
  test('goes round a box in its way, only across and down, from the edge of one box to the edge of the other', () => {
    const [a, m, b] = [box('a', 0, 0), box('m', 0, 100), box('b', 0, 200)];
    const way = elbowRoute(a, b, [a, m, b], 1);
    assert.ok(square(way), JSON.stringify(way));
    assert.ok(!along(way).some((p) => inside(m, p)), 'it misses the box between');
    assert.equal(way[0][1], 20, 'it leaves the bottom of the first box');
    assert.equal(way[way.length - 1][1], 180, 'it reaches the top of the last');
  });

  test('leaves and reaches its boxes the drawing’s way, with one corner each side of the middle', () => {
    const way = elbowRoute(box('a', 0, 0), box('b', 300, 200), [], 1);
    assert.deepEqual(way[0], [0, 20]);
    assert.deepEqual(way[way.length - 1], [300, 180]);
    assert.equal(way.length, 4);
  });

  test('keeps off the line a link before it took, where another way is as good', () => {
    const [a, b, c] = [box('a', 0, 0), box('b', 0, 200), box('c', 30, 200)];
    const taken = new Map();
    const first = elbowRoute(a, b, [a, b], 1, taken);
    const second = elbowRoute(a, c, [a, c], 1, taken);
    assert.notDeepEqual(
      second.map((p) => p[0]),
      first.map((p) => p[0]),
    );
  });

  test('is drawn as straight pieces, its arrowhead pointing along its last one', () => {
    const c = elbowCurve([
      [0, 0],
      [0, 50],
      [100, 50],
      [100, 100],
    ]);
    const points = c.cubic(0, 10);
    assert.equal(points.length, 10);
    assert.deepEqual(points[points.length - 1], [100, 90]);
    assert.deepEqual(c.tipAt(false), [[100, 100], 90]);
    assert.deepEqual(c.at(0.5), [50, 50]);
  });
});

const NOTE = `// graph: g
(a:Idea {name: 'Plan'}), (b:Idea {name: 'Design'}), (c:Idea {name: 'Build'}), (d:Idea {name: 'Test'}),
(e:Idea {name: 'Release candidate'}), (f:Idea {name: 'Docs'}), (g:Idea {name: 'Ship'}),
(a)-[:LEADS_TO]->(b), (a)-[:LEADS_TO]->(f), (b)-[:LEADS_TO]->(c), (c)-[:LEADS_TO]->(d), (d)-[:LEADS_TO]->(e),
(f)-[:LEADS_TO]->(e), (e)-[:LEADS_TO]->(g), (a)-[:LEADS_TO]->(d), (b)-[:LEADS_TO]->(g)`;

/** The links of the note drawn by our own engine with the links `routing`, as marks, and its boxes. */
function drawn(routing) {
  const texts = [NOTE, `// graph: g_style · STYLE g\n(l:Links {routing: '${routing}'})`];
  const reading = readNote(texts);
  const { style } = readStyle(texts, 'g', reading);
  const styledOne = { ...styledDrawing(reading.graphs.get('g'), style, reading.world.g), engine: 'own' };
  const ways = directions(styledOne);
  assert.ok(
    ways.every((w) => w.own),
    'laid out by our own engine, not Graphviz',
  );
  const d = ways[0];
  const m = measuredMarks(d.dot);
  const { marks } = ownLaid(
    m,
    d.rankdir,
    groupsIn(d.dot),
    optionsIn(d.dot),
    kindsIn(d.dot),
    true,
    undefined,
    undefined,
    undefined,
    linesIn(d.dot),
  );
  const boxes = marks.marks
    .filter((x) => x.kind === 'box' && x.role === 'thing')
    .map((x) => ({ key: x.of, x: x.x + x.width / 2, y: x.y + x.height / 2, hw: x.width / 2, hh: x.height / 2 }));
  return { links: marks.marks.filter((x) => x.kind === 'link'), boxes };
}

describe('links a person chose to route', () => {
  test('right-angled, each runs only across and down and over no box it does not join', () => {
    const { links, boxes } = drawn('right-angled');
    assert.equal(links.length, 9);
    for (const l of links) {
      const way = l.points.filter((_, i) => i % 3 === 0);
      assert.ok(square(way), `${l.from} to ${l.to} has a slanted piece`);
      const over = boxes.filter((b) => b.key !== l.from && b.key !== l.to && along(way).some((p) => inside(b, p)));
      assert.deepEqual(
        over.map((b) => b.key),
        [],
        `${l.from} to ${l.to}`,
      );
    }
  });

  test('straight, each is one straight line from box to box', () => {
    for (const l of drawn('straight').links) {
      const [p, c1, c2, q] = l.points;
      const cross = (u) => (q[0] - p[0]) * (u[1] - p[1]) - (q[1] - p[1]) * (u[0] - p[0]);
      assert.ok(Math.abs(cross(c1)) < 1e-6 && Math.abs(cross(c2)) < 1e-6, `${l.from} to ${l.to} bends`);
    }
  });
});
