// What the cards show and where they lie (editor spec §73, render_cards): display/graph-view/stage-cards-lay.ts. A card
// renders its Markdown by the host, made safe. A thing that is a note shows that note (node_is_a_note).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardWordsOf } from '../src/display/graph-view/stage-cards-lay.ts';

test('a card renders by its host, and a thing that is a note embeds that note; with no host, plain text', () => {
  assert.deepEqual(cardWordsOf({ reading: {}, graph: 'plan' }), {});
  const drawn = [];
  const words = cardWordsOf({ links: { render: (md, el) => drawn.push([md, el]) }, reading: {}, graph: 'plan' });
  words.render?.('**hi**', 'el', null);
  assert.deepEqual(drawn, [['**hi**', 'el']]);
  assert.equal(words.linked?.('[[Pilot plan]]'), '![[Pilot plan]]');
  assert.equal(words.linked?.('ann'), undefined);
});
