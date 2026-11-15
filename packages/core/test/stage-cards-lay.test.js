// What the cards show and where they lie (editor spec §73, render_cards): display/graph-view/stage-cards-lay.ts. A card
// renders its Markdown by the host, made safe. A thing that is a note shows that note (node_is_a_note). The cards are
// laid from the layout's places, round the cards the reader put by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardWordsOf, withHands } from '../src/display/graph-view/stage-cards-lay.ts';

test('a card renders by its host, and a thing that is a note embeds that note; with no host, plain text', () => {
  assert.deepEqual(cardWordsOf({ reading: {}, graph: 'plan' }), {});
  const drawn = [];
  const words = cardWordsOf({ links: { render: (md, el) => drawn.push([md, el]) }, reading: {}, graph: 'plan' });
  words.render?.('**hi**', 'el', null);
  assert.deepEqual(drawn, [['**hi**', 'el']]);
  assert.equal(words.linked?.('[[Pilot plan]]'), '![[Pilot plan]]');
  assert.equal(words.linked?.('ann'), undefined);
});

test('with no card put by hand, or cards that keep their places, the cards are laid as they were', () => {
  const laid = { cards: [], spots: new Map(), spread: 1, cx: 0, cy: 0 };
  assert.equal(withHands({ places: new Map() }, laid), laid);
  const only = { ...laid, only: true };
  assert.equal(withHands({ places: new Map([['a', { x: 1, y: 2 }]]) }, only), only);
});
