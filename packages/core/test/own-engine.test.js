// Our own layout engine (editor spec §53: layout_own_engine, layout_stress, layout_layered). Its files are
// layouts/stress.ts, layouts/layered.ts, layouts/own-engine.ts and layouts/own-draw.ts. A flow or a tree goes in
// rows. A network is spread by stress. No two boxes sit on each other, and a graph drawn by it is never text.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { stressLayout } from '../src/layouts/stress.ts';
import { layeredLayout } from '../src/layouts/layered.ts';
import { apart, pickLayout } from '../src/layouts/own-engine.ts';
import { ownable, ownSource } from '../src/layouts/own-draw.ts';
import { readNote } from '../src/drawing.ts';
import { directions, draw } from '../src/render.ts';
import { loadEngine } from '../src/engine.ts';

/** A shape of things by key and links `[from, to]`. */
const shapeOf = (keys, links = []) => ({
  things: keys.map((key) => ({ key, text: key.toUpperCase(), kinds: ['Thing'] })),
  links: links.map(([from, to]) => ({ from, type: 'LINKS', to })),
});

const far = (at, a, b) => Math.hypot(...at.get(a).map((v, k) => v - at.get(b)[k]));

/** Whether any two boxes of `sizes`, placed at their middles in `at`, sit on each other. */
function anyOverlap(at, sizes) {
  const keys = [...at.keys()];
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const [x1, y1] = at.get(keys[i]),
        [x2, y2] = at.get(keys[j]);
      const [w1, h1] = sizes.get(keys[i]),
        [w2, h2] = sizes.get(keys[j]);
      if (Math.abs(x1 - x2) < (w1 + w2) / 2 - 0.5 && Math.abs(y1 - y2) < (h1 + h2) / 2 - 0.5) return true;
    }
  return false;
}

// two triangles, a b c and d e f, joined by one link c to d
const BARBELL = shapeOf(
  ['a', 'b', 'c', 'd', 'e', 'f'],
  [
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'a'],
    ['c', 'd'],
    ['d', 'e'],
    ['e', 'f'],
    ['f', 'd'],
  ],
);

describe('the stress layout', () => {
  // proves: layout_stress
  test('puts linked things nearer than things two parts apart, the same way each time', () => {
    const at = stressLayout(BARBELL, 2);
    assert.ok(far(at, 'a', 'b') < far(at, 'a', 'f'), 'a sits nearer b than f');
    assert.ok(far(at, 'e', 'f') < far(at, 'b', 'e'), 'e sits nearer f than b');
    assert.deepEqual(stressLayout(BARBELL, 2), at, 'the same shape gives the same spots');
  });

  test('from last time’s spots, a small edit moves the rest little', () => {
    const before = stressLayout(BARBELL, 2, undefined, { unit: 100 });
    const edited = shapeOf(
      [...BARBELL.things.map((t) => t.key), 'g'],
      [...BARBELL.links.map((l) => [l.from, l.to]), ['f', 'g']],
    );
    const after = stressLayout(edited, 2, before, { unit: 100 });
    for (const k of before.keys())
      assert.ok(
        far(
          new Map([
            [0, before.get(k)],
            [1, after.get(k)],
          ]),
          0,
          1,
        ) < 100,
        k,
      );
    assert.ok(far(after, 'f', 'g') < 200, 'the new thing starts beside its neighbour');
  });

  test('lays out in three dimensions too', () => {
    const at = stressLayout(BARBELL, 3);
    for (const p of at.values()) assert.equal(p.length, 3);
  });
});

describe('the layered layout', () => {
  const chain = shapeOf(
    ['a', 'b', 'c', 'd'],
    [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['a', 'd'],
    ],
  );
  // proves: layout_layered
  test('puts each link’s end in a later row, left to right or top to bottom', () => {
    const lr = layeredLayout(chain, new Map(), 'LR');
    for (const l of chain.links) assert.ok(lr.get(l.to)[0] > lr.get(l.from)[0], `${l.from} → ${l.to} runs right`);
    const tb = layeredLayout(chain, new Map(), 'TB');
    for (const l of chain.links) assert.ok(tb.get(l.to)[1] > tb.get(l.from)[1], `${l.from} → ${l.to} runs down`);
  });

  test('turns a link that runs back, so a loop is still drawn in rows', () => {
    const loop = shapeOf(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
      ],
    );
    const at = layeredLayout(loop, new Map(), 'LR');
    assert.equal(new Set([...at.values()].map(([x]) => x)).size, 3, 'three rows');
  });

  test('cuts a row far too long, so a wide shallow tree is not one endless strip, and keeps every box apart', () => {
    const keys = ['root', ...Array.from({ length: 120 }, (_, i) => `leaf${i}`)];
    const tree = shapeOf(
      keys,
      keys.slice(1).map((k) => ['root', k]),
    );
    const sizes = new Map(keys.map((k) => [k, [200, 120]]));
    const at = layeredLayout(tree, sizes, 'LR');
    const ys = [...at.values()].map(([, y]) => y);
    const high = Math.max(...ys) - Math.min(...ys) + 120;
    assert.ok(new Set([...at.values()].map(([x]) => x)).size > 2, 'the leaves’ row is cut in more than one');
    assert.ok(high < 120 * 138, `shorter than one strip of all the leaves: ${Math.round(high)}`);
    assert.equal(anyOverlap(at, sizes), false);
  });
});

describe('picking a layout', () => {
  // proves: layout_own_engine
  test('rows for a tree and a flow, stress for a network and a dense graph', () => {
    const tree = shapeOf(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['a', 'c'],
        ['c', 'd'],
      ],
    );
    assert.deepEqual(pickLayout(tree), { layout: 'layered', why: 'tree' });
    const flow = shapeOf(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['a', 'c'],
        ['b', 'd'],
        ['c', 'd'],
        ['a', 'd'],
      ],
    );
    assert.deepEqual(pickLayout(flow), { layout: 'layered', why: 'flow' });
    assert.deepEqual(pickLayout(BARBELL), { layout: 'stress', why: 'network' });
    const keys = ['a', 'b', 'c', 'd', 'e'];
    const all = keys.flatMap((p) => keys.filter((q) => q !== p).map((q) => [p, q]));
    assert.deepEqual(pickLayout(shapeOf(keys, all)), { layout: 'stress', why: 'dense' });
  });

  test('pushes apart boxes on each other', () => {
    const at = new Map([
      ['a', [0, 0]],
      ['b', [10, 5]],
      ['c', [5, 10]],
    ]);
    const sizes = new Map([...at.keys()].map((k) => [k, [100, 40]]));
    apart(at, sizes);
    assert.equal(anyOverlap(at, sizes), false);
  });
});

describe('the source Graphviz measures', () => {
  const dot = ['digraph G {', '  rankdir=LR;', '  "a" [label="A"];', '  b [label="B"];', '  "a" -> b;', '}'].join('\n');

  test('puts every box at a spot and every link straight, so Graphviz only measures', () => {
    const src = ownSource(dot);
    assert.match(src, /"a" \[pos="[\d.]+,[\d.]+", label="A"\]/);
    assert.match(src, /b \[pos="[\d.]+,[\d.]+", label="B"\]/);
    assert.match(src, /"a" -> b;/, 'the link line is left as it is');
    assert.match(src, /graph \[splines=false\];/);
  });

  test('is not used where Graphviz draws groups as boxes round their things', () => {
    assert.equal(ownable(dot), true);
    const grouped = [...dot.split('\n').slice(0, -1), '  subgraph cluster_x { "a"; }', '}'].join('\n');
    assert.equal(ownable(grouped), false);
  });
});

describe('a graph drawn by our own engine', () => {
  // a tree of 40 things: each linked from the one at half its number
  const tree = readNote([
    `// graph: g\n${[
      ...Array.from({ length: 40 }, (_, i) => `(t${i}:Thing {name: 'Thing ${i}'})`),
      ...Array.from({ length: 39 }, (_, i) => `(t${(i + 1) >> 1})-[:HAS]->(t${i + 1})`),
    ].join(',\n')}`,
  ]).graphs.get('g');

  // proves: layout_own_engine
  test('is laid out once, by our engine, and drawn as a picture with every thing in it', async () => {
    const own = { ...tree, engine: 'own' };
    const laid = directions(own);
    assert.equal(laid.length, 1, 'one direction');
    assert.equal(laid[0].own, true);
    const drawn = draw(own, await loadEngine());
    assert.match(drawn.svg, /^<svg/);
    for (let i = 0; i < 40; i++) assert.ok(drawn.svg.includes(`>Thing ${i}<`), `Thing ${i} is drawn`);
  });

  test('is left to Graphviz when switched off', () => {
    assert.equal(directions(tree)[0].own, undefined);
  });
});
