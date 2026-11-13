// Things drawn as whole cards with all their notes (editor spec §73, render_cards): render/render-cards.ts. A card is
// as tall as its note up to a cap, layouts keep their shape while spreading so no card covers another, and every
// arrow runs from card edge to card edge round the other cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_HEAD,
  CARD_MOST_LINES,
  CARD_W,
  cardArrows,
  cardSizeOf,
  cutsThrough,
  onEdge,
  spreadCardBoxes,
} from '../src/render/render-cards.ts';

const box = (key, x, y, note = '') => ({ key, x, y, ...cardSizeOf({ key, name: key, note }) });

// proves: render_cards
test('a card is as tall as its whole note, up to a cap, with the rest counted for "Show all"', () => {
  const bare = cardSizeOf({ key: 'a', name: 'A' });
  assert.deepEqual(bare, { w: CARD_W, h: CARD_HEAD, shown: 0, more: 0 }, 'no note: only the header');
  const short = cardSizeOf({ key: 'a', name: 'A', note: 'One short line.' });
  assert.equal(short.shown, 1);
  assert.equal(short.more, 0);
  assert.ok(short.h > bare.h);
  const both = cardSizeOf({ key: 'a', name: 'A', note: 'Own note.', linked: 'Body of the linked note.' });
  assert.equal(both.shown, 2, 'the linked note shows below its own note');
  const long = cardSizeOf({ key: 'a', name: 'A', note: Array.from({ length: 30 }, (_, i) => `Line ${i}`).join('\n') });
  assert.equal(long.shown, CARD_MOST_LINES);
  assert.equal(long.more, 30 - CARD_MOST_LINES);
  const longer = cardSizeOf({ key: 'a', name: 'A', note: Array.from({ length: 60 }, () => 'x').join('\n') });
  assert.equal(longer.h, long.h, 'past the cap a card grows no taller');
  const props = cardSizeOf({
    key: 'a',
    name: 'A',
    props: [
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
      ['d', '4'],
    ],
  });
  assert.equal(
    props.h,
    cardSizeOf({
      key: 'a',
      name: 'A',
      props: [
        ['a', '1'],
        ['b', '2'],
        ['c', '3'],
      ],
    }).h,
    'three at most',
  );
});

const covers = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;

// proves: render_cards
test('cards spread from the layout so none covers another, keeping its shape, the same each time', () => {
  // a diamond laid out for dots 60 apart: far too close for cards
  const dots = [box('top', 0, 0, 'a\nb\nc'), box('left', -60, 60), box('right', 60, 60, 'x'), box('bottom', 0, 120)];
  const spread = spreadCardBoxes(dots);
  for (let i = 0; i < spread.length; i++)
    for (let j = i + 1; j < spread.length; j++)
      assert.ok(!covers(spread[i], spread[j]), `${spread[i].key} ${spread[j].key}`);
  const at = new Map(spread.map((b) => [b.key, b]));
  assert.ok(at.get('top').y < at.get('left').y && at.get('left').y < at.get('bottom').y, 'still top to bottom');
  assert.ok(at.get('left').x < at.get('top').x && at.get('top').x < at.get('right').x, 'still left to right');
  assert.deepEqual(spreadCardBoxes([...dots].reverse()), spread, 'the same places whatever order');
  // two in one place part as well
  const same = spreadCardBoxes([box('a', 0, 0), box('b', 0, 0)]);
  assert.ok(!covers(same[0], same[1]));
  // cards already apart stay where they are
  const apart = [box('a', 0, 0), box('b', 1000, 0)];
  assert.deepEqual(
    spreadCardBoxes(apart).map((b) => [b.x, b.y]),
    apart.map((b) => [b.x, b.y]),
  );
});

// proves: render_cards
test('every arrow runs from the edge of one card to the edge of the other, round the cards between', () => {
  // a row of three: the arrow from the first to the last must not run through the middle one
  const cards = spreadCardBoxes([box('a', 0, 0, 'note'), box('m', 400, 0, 'a\nb\nc\nd'), box('z', 800, 0)]);
  const links = [
    { from: 'a', to: 'z' },
    { from: 'a', to: 'm' },
    { from: 'm', to: 'z' },
    { from: 'a', to: 'a' },
    { from: 'a', to: 'gone' },
  ];
  const arrows = cardArrows(cards, links, 0);
  assert.equal(arrows.length, 3, 'none to itself or to a thing with no card');
  const at = new Map(cards.map((b) => [b.key, b]));
  for (const { from, to, way } of arrows) {
    assert.ok(onEdge(way[0], at.get(from)), `${from}->${to} starts on ${from}'s edge, not its middle`);
    assert.ok(onEdge(way.at(-1), at.get(to)), `${from}->${to} ends on ${to}'s edge`);
    for (const card of cards)
      for (let i = 0; i + 1 < way.length; i++)
        assert.ok(!cutsThrough(way[i], way[i + 1], card), `${from}->${to} runs over ${card.key}`);
  }
  assert.deepEqual(cardArrows(cards, links, 0), arrows, 'the same arrows each time');
});
