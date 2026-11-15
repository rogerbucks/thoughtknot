// Laying the cards (editor spec §73, render_cards): display/graph-view/stage-cards-lay.ts. The cards are laid from
// the layout's places, round the cards the reader put by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withHands } from '../src/display/graph-view/stage-cards-lay.ts';

test('with no card put by hand, or cards that keep their places, the cards are laid as they were', () => {
  const laid = { cards: [], spots: new Map(), spread: 1, cx: 0, cy: 0 };
  assert.equal(withHands({ places: new Map() }, laid), laid);
  const only = { ...laid, only: true };
  assert.equal(withHands({ places: new Map([['a', { x: 1, y: 2 }]]) }, only), only);
});
