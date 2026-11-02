// Things drawn as rounded cards with their names inside (editor spec §36, things_as_cards): thing-card.ts. Also the
// force and ego views that draw them. A name always plainly belongs to its thing, and no card covers another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardTall, cardWidth, spreadCards, thingCard } from '../src/view-types/thing-card.ts';
import { forceMarks } from '../src/view-types/force-view.ts';
import { egoMarks } from '../src/view-types/ego-view.ts';

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
