// Every pass that draws links counts its real work against its budget and stops at it (editor spec §68,
// layout_work_counted). Roger, 25 Oct 2026. So no pass takes longer as a graph grows past what its budget says. Here
// each pass is given a small budget and a graph far past it, and never does more than it was given. Below its budget,
// a pass draws as it did before it counted.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Work, WORK_MOST } from '../src/layout-work.ts';
import { bends, crowded } from '../src/direct-bends.ts';
import { directLinks } from '../src/direct-links.ts';
import { wordSpots } from '../src/direct-words.ts';
import { curveOf } from '../src/direct-curve.ts';

/** A seeded stream of numbers in [0, 1), so each graph is the same every run. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

/** `n` boxes in a loose grid and about twice as many links between them, the same each run. */
function graph(n, seed = 7) {
  const rnd = seeded(seed);
  const side = Math.ceil(Math.sqrt(n));
  const boxes = Array.from({ length: n }, (_, i) => ({
    key: `n${i}`,
    x: (i % side) * 160 + rnd() * 40,
    y: Math.floor(i / side) * 90 + rnd() * 30,
    hw: 50,
    hh: 18,
  }));
  const links = Array.from({ length: n * 2 }, () => {
    const a = boxes[Math.floor(rnd() * n)];
    const b = boxes[Math.floor(rnd() * n)];
    return { a, b, toward: rnd() < 0.5 ? 1 : -1 };
  }).filter((l) => l.a !== l.b);
  return { boxes, links };
}

/** `g` as the marks Graphviz gives: a box for each thing and a line for each link. */
function marksOf({ boxes, links }) {
  const box = (b) => ({
    kind: 'box',
    id: b.key,
    style: 'thing',
    role: 'thing',
    of: b.key,
    x: b.x - b.hw,
    y: b.y - b.hh,
    width: 2 * b.hw,
    height: 2 * b.hh,
  });
  const link = (l, i) => ({
    kind: 'link',
    id: `e${i}`,
    of: `e${i}`,
    style: 'link',
    from: l.a.key,
    to: l.b.key,
    points: [
      [l.a.x, l.a.y],
      [l.b.x, l.b.y],
    ],
  });
  const word = (l, i) => ({
    kind: 'label',
    id: `w${i}`,
    of: `e${i}`,
    style: 'link',
    x: (l.a.x + l.b.x) / 2,
    y: (l.a.y + l.b.y) / 2,
    text: 'links to',
    size: 12,
    anchor: 'middle',
    font: 'Helvetica',
  });
  return {
    marks: [...boxes.map(box), ...links.map(link), ...links.map(word)],
    space: { width: 4000, height: 4000 },
  };
}

describe('a budget of work', () => {
  // proves: layout_work_counted
  test('takes steps while they fit, never past its most, and says when the next would not', () => {
    const w = new Work(10);
    assert.equal(w.take(4), true);
    assert.equal(w.take(6), true);
    assert.equal(w.take(1), false);
    assert.equal(w.done, 10);
    assert.equal(new Work(3).take(4), false, 'a step too big for what is left is not taken');
  });

  test('is the same in the Python library, pass by pass', () => {
    const py = readFileSync(new URL('../../../python/graph_spec/src/graphspec/style/work.py', import.meta.url), 'utf8');
    for (const [pass, most] of Object.entries(WORK_MOST))
      assert.match(py, new RegExp(`"${pass}": ${String(most).replace(/\B(?=(\d{3})+$)/g, '_')},`), pass);
  });
});

describe('each pass that draws links', () => {
  const small = graph(40);
  const big = graph(900);

  // proves: layout_work_counted
  test('bends: stops at its budget however big the graph, and below it bends as it did', () => {
    for (const g of [small, big]) {
      const w = new Work(200_000);
      const bows = bends(g.links, g.boxes, { bends: w, crossings: new Work(200_000) });
      assert.ok(w.done <= w.most, `${w.done} steps`);
      assert.equal(bows.length, g.links.length, 'every link is given a bend');
      assert.ok(bows.every(Number.isFinite));
    }
    const spent = new Work(200_000);
    bends(big.links, big.boxes, { bends: spent, crossings: new Work(WORK_MOST.crossings) });
    assert.ok(spent.done > spent.most * 0.9, 'the big graph used its budget, and was stopped by it');
    const ample = new Work(WORK_MOST.bends);
    assert.deepEqual(
      bends(small.links, small.boxes, { bends: ample, crossings: new Work(WORK_MOST.crossings) }),
      bends(small.links, small.boxes),
    );
    assert.ok(ample.done < ample.most, 'the small graph did not need it all');
  });

  // proves: layout_work_counted
  test('crowded: stops at its budget, and a graph that spends it is taken to need room', () => {
    const pairs = big.links.map((l) => [l.a, l.b]);
    const w = new Work(1000);
    assert.equal(crowded(pairs, big.boxes, w), true);
    assert.ok(w.done <= 1000);
    const apart = [
      { key: 'a', x: 0, y: 0, hw: 10, hh: 10 },
      { key: 'b', x: 100, y: 0, hw: 10, hh: 10 },
    ];
    assert.equal(crowded([[apart[0], apart[1]]], apart, new Work(WORK_MOST.crowded)), false);
  });

  // proves: layout_work_counted
  test('words: stops at its budget, each block left at the first spot it would try', () => {
    const laid = marksOf(small);
    const placed = new Map(small.boxes.map((b) => [b.key, b]));
    const curves = new Map(small.links.map((l, i) => [`e${i}`, curveOf(l.a, l.b, 0)]));
    const none = new Work(0);
    const spots = wordSpots(laid.marks, placed, curves, undefined, none);
    assert.equal(none.done, 0);
    assert.equal(spots.size, small.links.length, 'every block still has a spot');
    const w = new Work(500);
    wordSpots(laid.marks, placed, curves, undefined, w);
    assert.ok(w.done <= 500);
  });

  // proves: layout_work_counted
  test('the whole drawing: each pass of a graph far past its budgets stays within them, and every link is drawn', () => {
    const laid = marksOf(big);
    const tiny = {
      crowded: new Work(100_000),
      settle: new Work(100_000),
      bends: new Work(100_000),
      crossings: new Work(100_000),
      words: new Work(100_000),
    };
    const drawn = directLinks(laid, undefined, undefined, 'LR', false, tiny);
    for (const [pass, w] of Object.entries(tiny)) assert.ok(w.done <= w.most, `${pass}: ${w.done} steps`);
    assert.ok(tiny.settle.done > 90_000, 'moving boxes was stopped by its budget');
    const curved = drawn.marks.filter((m) => m.kind === 'link' && m.curve);
    assert.equal(curved.length, big.links.length);
  });
});
