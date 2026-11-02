// The force-directed view (editor spec §36, view_types_offered): force-view.ts. Linked things sit close and the rest
// spread out. The same graph gives the same layout, and a warm start moves little.
// Things are drawn as rounded cards with their names inside (things_as_cards): thing-card.ts, in the force and ego
// views. A name always plainly belongs to its thing, and no card covers another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitted, forceLayout, forceMarks } from '../src/view-types/force-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';
import { cardTall, cardWidth, spreadCards, thingCard } from '../src/view-types/thing-card.ts';
import { egoMarks } from '../src/view-types/ego-view.ts';

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

/** Whether boxes `a` and `b` overlap. */
const covers = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** A hub with `n` spokes, each with a name of a few words. */
function star(n) {
  const things = [{ key: 'hub', text: 'The hub', kinds: ['Layer'] }];
  const links = [];
  for (let i = 0; i < n; i++) {
    things.push({ key: `s${i}`, text: `Spoke number ${i}`, kinds: ['Part'] });
    links.push({ from: `s${i}`, to: 'hub', type: 'PART_OF' });
  }
  return { things, links };
}

// proves: things_as_cards
test('a card is rounded, as wide as its whole name, with the name inside it', () => {
  const [box, name] = thingCard('a', 'Orders', 100, 50, cardWidth('Orders', 20), 20, 'kind.0');
  assert.equal(box.shape, 'round');
  assert.equal(box.solid, true, 'solid, so a link behind it does not show through');
  assert.equal(name.text, 'Orders', 'the whole name');
  assert.ok(name.x > box.x && name.x < box.x + box.width, 'inside, across');
  assert.ok(name.y > box.y && name.y < box.y + box.height, 'and down');
  const long = 'A very long name indeed, far too long to show in any card at all';
  const [cut, said] = thingCard('b', long, 100, 50, cardWidth(long, 20), 20, 'kind.0');
  assert.ok(said.text.endsWith('…') && cut.name === long, 'only a very long name is cut; the box keeps it whole');
  assert.ok(cardTall(['a', 'b'], 1e9) <= 26, 'never taller than the most');
});

// proves: things_as_cards
test('cards that would cover one another are moved apart, the same way each time', () => {
  const at = [
    [100, 100],
    [100, 100],
    [110, 104],
  ];
  const widths = [60, 60, 60];
  const one = spreadCards(at, widths, 20, 400, 400);
  assert.deepEqual(spreadCards(at, widths, 20, 400, 400), one, 'the same each time');
  const boxes = one.map(([x, y], i) => ({ x: x - widths[i] / 2, y: y - 10, width: widths[i], height: 20 }));
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(!covers(boxes[i], boxes[j]), `${i} and ${j}`);
});

// proves: things_as_cards
test('the force and ego views draw named things as cards, none covering another', () => {
  const space = { width: 720, height: 405 };
  for (const marks of [forceMarks({ shape: star(30), space }), egoMarks({ shape: star(30), space })]) {
    const boxes = marks.filter((m) => m.kind === 'box');
    assert.ok(boxes.length === 31 && boxes.every((b) => b.shape === 'round'), 'every thing a card');
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        assert.ok(!covers(boxes[i], boxes[j]), `${boxes[i].id} ${boxes[j].id}`);
    const names = marks.filter((m) => m.kind === 'label');
    assert.equal(names.length, 31, 'each named inside its card');
  }
});
