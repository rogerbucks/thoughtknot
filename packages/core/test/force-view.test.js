// The force-directed view (editor spec §36, view_types_offered): force-view.ts. Linked things sit close and the rest
// spread out. The same graph gives the same layout, and a warm start moves little.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitted, forceLayout, forceMarks } from '../src/view-types/force-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';
import { diagramGiven } from '../src/plugin-diagrams.ts';

const SPACE = { width: 600, height: 400 };

/** A shape of things by key and links `[from, to]`. */
const shapeOf = (keys, links = []) => ({
  things: keys.map((key) => ({ key, text: key.toUpperCase(), kinds: ['Thing'] })),
  links: links.map(([from, to]) => ({ from, type: 'LINKS', to })),
});

const apart = (at, a, b) => Math.hypot(at.get(a)[0] - at.get(b)[0], at.get(a)[1] - at.get(b)[1]);

// two triangles, a b c and d e f, not linked to each other
const TWO = shapeOf(
  ['a', 'b', 'c', 'd', 'e', 'f'],
  [
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'a'],
    ['d', 'e'],
    ['e', 'f'],
    ['f', 'd'],
  ],
);

test('linked things sit closer than things not linked, and the same graph gives the same layout', () => {
  const at = forceLayout(TWO);
  const inside = Math.max(apart(at, 'a', 'b'), apart(at, 'b', 'c'), apart(at, 'd', 'e'), apart(at, 'e', 'f'));
  const across = Math.min(...['a', 'b', 'c'].flatMap((p) => ['d', 'e', 'f'].map((q) => apart(at, p, q))));
  assert.ok(inside < across, `${inside} ${across}`);
  assert.deepEqual([...forceLayout(TWO)], [...at]);
});

test('a warm start from last time moves the things already placed only a little', () => {
  const before = forceLayout(TWO);
  const grown = shapeOf([...TWO.things.map((t) => t.key), 'g'], [...TWO.links.map((l) => [l.from, l.to]), ['g', 'a']]);
  const after = forceLayout(grown, before);
  const cold = forceLayout(grown);
  const moved = (at) =>
    Math.max(
      ...[...before.keys()].map((k) => Math.hypot(at.get(k)[0] - before.get(k)[0], at.get(k)[1] - before.get(k)[1])),
    );
  // in the layout's units a link is about one long: with nothing new, nothing moves as far as a tenth of a link
  assert.ok(moved(forceLayout(TWO, before)) < 0.1, moved(forceLayout(TWO, before)));
  assert.ok(moved(after) < moved(cold) / 2, `${moved(after)} ${moved(cold)}`);
});

test('a big graph still fits the space, and every mark has its own id', () => {
  const keys = [...Array.from({ length: 2000 }, (_, i) => `t${i}`), 't0.label', 'link.0'];
  const links = keys.slice(1).map((k, i) => [keys[Math.floor(i / 3)], k]);
  const marks = drawMarksOf(forceMarks({ shape: shapeOf(keys, links), space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  const ids = marks.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('a small graph is named and fits; a graph with nothing draws nothing', () => {
  const marks = drawMarksOf(forceMarks({ shape: TWO, space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  assert.equal(marks.filter((m) => m.kind === 'label').length, 6);
  assert.equal(marks.filter((m) => m.kind === 'link').length, 6);
  assert.deepEqual(forceMarks({ shape: shapeOf([]), space: SPACE }), []);
  const one = fitted(forceLayout(shapeOf(['x'])), SPACE.width, SPACE.height);
  assert.deepEqual(one.get('x'), [300, 200]);
});

// proves: view_options_everywhere
test('the View menu’s spacing draws the force view again, things farther apart', () => {
  const marks = (layout) => JSON.stringify(forceMarks({ shape: TWO, space: { ...SPACE, layout } }));
  assert.notEqual(marks({ spacing: 3 }), marks(undefined), 'a wider spacing is drawn otherwise');
  assert.equal(marks({ spacing: 1, linkLength: 1 }), marks(undefined), 'as it was by default, the same drawing');
});

// a chain a → b → c → d, and a side branch b → e
const CHAIN = shapeOf(
  ['a', 'b', 'c', 'd', 'e'],
  [
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'd'],
    ['b', 'e'],
  ],
);
const across = (at) => Math.max(...[...at.values()].map(([x]) => x)) - Math.min(...[...at.values()].map(([x]) => x));
const down = (at) => Math.max(...[...at.values()].map(([, y]) => y)) - Math.min(...[...at.values()].map(([, y]) => y));

// proves: view_options_everywhere
test('the View menu’s layout: in rows each thing keeps its row, down or across as the menu says', () => {
  const rows = forceLayout(CHAIN, undefined, { strategy: 'rows' });
  const y = (k) => rows.get(k)[1];
  assert.ok(y('a') < y('b') && y('b') < y('c') && y('c') < y('d'), 'each link runs down a row');
  assert.equal(y('e'), y('c'), 'two things one link from b share a row');
  const turned = forceLayout(CHAIN, undefined, { strategy: 'rows', direction: 'LR' });
  assert.ok(turned.get('a')[0] < turned.get('d')[0], 'across, each link runs one row to the right');
  assert.deepEqual([...forceLayout(CHAIN, undefined, { strategy: 'spread' })], [...forceLayout(CHAIN)]);
});

// proves: view_options_everywhere
test('the View menu’s layout: rounds, its shape and a plug-in’s layout', () => {
  const plain = forceLayout(TWO);
  assert.notDeepEqual([...forceLayout(TWO, undefined, { rounds: 0.25 })], [...plain], 'fewer rounds, settled less');
  const wide = forceLayout(TWO, undefined, { shape: 'wide' }),
    tall = forceLayout(TWO, undefined, { shape: 'tall' });
  assert.ok(across(wide) / down(wide) > across(plain) / down(plain), 'wider');
  assert.ok(down(tall) / across(tall) > down(plain) / across(plain), 'taller');
  const spots = Object.fromEntries(TWO.things.map((t, i) => [t.key, [i, 0]]));
  const placed = forceLayout(TWO, undefined, { strategy: 'acme.shapes.line' }, spots);
  assert.deepEqual(placed.get('c'), [2, 0], 'each thing at the spot the plug-in gave it');
  assert.deepEqual([...forceLayout(TWO, undefined, { strategy: 'acme.shapes.line' })], [...plain], 'none: as Force');
});

// proves: view_options_everywhere
test('a view type is given the View menu’s layout and a plug-in’s spots, copied', () => {
  const space = { ...SPACE, layout: { spacing: 2 }, spots: { a: [1, 2] } };
  const given = diagramGiven(TWO, space);
  assert.deepEqual(given.space, space, 'the spacing reaches Force: it was dropped before');
  assert.notEqual(given.space.layout, space.layout);
  assert.ok(Object.isFrozen(given.space.spots.a));
});
