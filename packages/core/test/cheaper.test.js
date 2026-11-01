// A graph is never shown as text because its layout was slow (editor spec §68, layout_never_text). Roger, 25 Oct 2026.
// When Graphviz runs out of time, our own engine lays the graph out again. When that is slow too, it goes in rows with
// no ordering, then in a grid. Each step is said in one line beside the drawing. The runner's side is proved in
// layout-worker.test.js; here, the ladder, the two cheaper layouts and the drawing each gives.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_STEPS, cheaperSpots, nextStep } from '../src/layouts/cheaper.ts';
import { ownSpots } from '../src/layouts/own-engine.ts';
import { PICK_ATTRIBUTE, pickSaid, pickShownOf } from '../src/layouts/fingerprint.ts';
import { readNote } from '../src/drawing.ts';
import { draw } from '../src/render.ts';
import { loadEngine } from '../src/engine.ts';

const box = (of, width = 120) => ({
  kind: 'box',
  id: of,
  style: 'thing',
  role: 'thing',
  of,
  x: 0,
  y: 0,
  width,
  height: 40,
});
const link = ([from, to]) => ({ kind: 'link', id: `${from} ${to}`, style: 'link', from, to, points: [] });
const laid = (keys, links) => ({
  marks: [...keys.map((k) => box(k)), ...links.map(link)],
  space: { width: 0, height: 0 },
});
const shapeOf = (keys, links) => ({
  things: keys.map((key) => ({ key, text: key, kinds: [] })),
  links: links.map(([from, to]) => ({ from, type: '', to })),
});
const sizesOf = (keys) => new Map(keys.map((k) => [k, [120, 40]]));

/** Whether any two boxes of `spots`, each 120 by 40, overlap. */
function overlapping(spots) {
  const all = [...spots.values()];
  return all.some(([x, y], i) => all.slice(i + 1).some(([u, v]) => Math.abs(x - u) < 120 && Math.abs(y - v) < 40));
}

describe('the ladder of cheaper steps', () => {
  // proves: layout_never_text
  test('goes from Graphviz to our own engine, then rows, then a grid, and ends there', () => {
    assert.deepEqual(LAYOUT_STEPS, ['own', 'rows', 'grid']);
    assert.equal(nextStep({}), 'own');
    assert.equal(nextStep({ engine: 'own' }), 'rows', 'a drawing our engine laid out goes straight to rows');
    assert.equal(nextStep({ step: 'own' }), 'rows');
    assert.equal(nextStep({ step: 'rows' }), 'grid');
    assert.equal(nextStep({ step: 'grid' }), undefined);
  });
});

describe('rows with no ordering', () => {
  const keys = ['a', 'b', 'c', 'd', 'e'];
  const links = [
    ['a', 'b'],
    ['b', 'c'],
    ['a', 'd'],
    ['c', 'a'], // a loop: it starts where written
  ];

  // proves: layout_never_text
  test('put each thing a row past the nearest that links to it, every thing placed, none on another', () => {
    const { spots, rankdir } = cheaperSpots('rows', shapeOf(keys, links), sizesOf(keys), 'LR');
    assert.equal(rankdir, 'LR');
    assert.deepEqual([...spots.keys()].sort(), keys);
    const x = (k) => spots.get(k)[0];
    assert.ok(x('e') === x('a'), 'a thing alone starts a row');
    assert.ok(x('a') < x('b') && x('b') < x('c'), 'each a row past the one before');
    assert.equal(x('d'), x('b'), 'two linked from one thing share its next row');
    assert.ok(!overlapping(spots));
  });

  test('run down when the drawing runs down', () => {
    const { spots } = cheaperSpots('rows', shapeOf(keys, links), sizesOf(keys), 'TB');
    assert.ok(spots.get('a')[1] < spots.get('b')[1]);
    assert.equal(spots.get('a')[0], spots.get('e')[0] - 150, 'side by side in the first row');
  });

  test('take one pass: each link of 20,000 things is read once', () => {
    const many = Array.from({ length: 20_000 }, (_, i) => `n${i}`);
    const shape = shapeOf(
      many,
      many.slice(1).map((k, i) => [many[Math.floor(i / 3)], k]),
    );
    let reads = 0;
    const links = shape.links;
    shape.links = new Proxy(links, {
      get: (target, key, r) => (typeof key === 'string' && /^\d+$/.test(key) && reads++, Reflect.get(target, key, r)),
    });
    const { spots } = cheaperSpots('rows', shape, sizesOf(many), 'LR');
    assert.equal(spots.size, many.length);
    assert.equal(reads, links.length);
    assert.equal(spots.get('n3')[0], spots.get('n1')[0], 'a row past its parent');
  });
});

describe('a grid', () => {
  // proves: layout_never_text
  test('places every thing in the order written, in about a screen’s shape, none on another', () => {
    const keys = Array.from({ length: 100 }, (_, i) => `n${i}`);
    const { spots, rankdir } = cheaperSpots('grid', shapeOf(keys, []), sizesOf(keys), 'LR');
    assert.equal(rankdir, 'TB', 'its rows run across');
    assert.equal(spots.size, 100);
    assert.ok(!overlapping(spots));
    const xs = [...spots.values()].map(([x]) => x),
      ys = [...spots.values()].map(([, y]) => y);
    const shape = (Math.max(...xs) - Math.min(...xs) + 120) / (Math.max(...ys) - Math.min(...ys) + 40);
    assert.ok(shape > 0.8 && shape < 3.2, `width over height ${shape.toFixed(2)}`);
    assert.ok(spots.get('n0')[0] < spots.get('n1')[0], 'in the order written');
  });
});

describe('our own engine, given a cheaper step', () => {
  // proves: layout_never_text
  test('lays out by it, from the margin, with nothing else to work out', () => {
    const keys = ['a', 'b', 'c'];
    const links = [
      ['a', 'b'],
      ['b', 'c'],
    ];
    const rows = ownSpots(laid(keys, links), 'LR', undefined, [], {}, undefined, 'rows');
    assert.deepEqual(
      [...rows.spots.values()].map(([x]) => x),
      [72, 252, 432],
    );
    assert.equal(rows.spots.get('a')[1], 32, 'a box half its height down from the margin');
    const grid = ownSpots(laid(keys, links), 'LR', undefined, [], {}, undefined, 'grid');
    assert.equal(grid.rankdir, 'TB');
  });
});

const NOTE = `// graph: g
(a:Step {name: 'Plan'}), (b:Step {name: 'Build'}), (c:Step {name: 'Ship'}), (d:Step {name: 'Learn'}),
(a)-[:THEN]->(b), (b)-[:THEN]->(c), (c)-[:THEN]->(d)`;

describe('a drawing laid out by a cheaper step', () => {
  for (const step of LAYOUT_STEPS)
    // proves: layout_never_text
    test(`by ${step === 'own' ? 'our own engine' : step} is a drawing of every thing, never text, and says its step`, async () => {
      const drawing = { ...readNote([NOTE]).graphs.get('g'), step };
      const { svg } = draw(drawing, await loadEngine());
      assert.match(svg, /^<svg/);
      for (const name of ['Plan', 'Build', 'Ship', 'Learn']) assert.match(svg, new RegExp(`>${name}<`));
      const shown = pickShownOf(new RegExp(`${PICK_ATTRIBUTE}="([^"]*)"`).exec(svg)?.[1]);
      assert.equal(shown.step, step);
      const said = pickSaid(shown);
      assert.match(said, step === 'own' ? /^Graphviz took too long/ : /^Laying it out took too long/);
      if (step !== 'own')
        assert.doesNotMatch(said, /Laid out in rows as|Spread out/, 'the step is said in place of why');
    });

  test('one written for a diagram type or a routing of Graphviz’s own is still laid out by our engine', async () => {
    const drawing = { ...readNote([NOTE]).graphs.get('g'), routing: 'curved', step: 'rows' };
    const { svg } = draw(drawing, await loadEngine());
    assert.match(svg, new RegExp(PICK_ATTRIBUTE));
  });
});
