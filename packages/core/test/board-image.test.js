// Pictures and notes brought onto a board (editor spec ES§45, board_images). A picture is an Image item that holds
// only the link to where it is kept. Only a file kept beside the notes is shown. A note becomes a card that links to it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { itemGql, readBoard } from '../src/board.ts';
import {
  IMAGE_MOST,
  LINK_MOST,
  imageItem,
  imageSrc,
  isLocalSrc,
  isPicture,
  nameOf,
  noteCard,
  noteLinkOf,
} from '../src/board-image.ts';
import { boardSvg, itemBox } from '../src/board-svg.ts';
import { cardOf } from '../src/board-card.ts';

const PALETTE = { text: '#111', edge: '#222', muted: '#333', fill: (h) => `fill-${h}`, blend: (h) => `ink-${h}` };

describe('pictures on a board', () => {
  // proves: board_images
  test('a picture is placed with its middle where asked, in its own shape, no larger than the most allowed', () => {
    const big = imageItem('image1', 'Attachments/Eiffel tower.png', [500, 400], { w: 3200, h: 1200 });
    assert.deepEqual([big.w, big.h], [IMAGE_MOST.w, 120], 'made smaller, its shape kept');
    const box = itemBox(big);
    assert.deepEqual([box.x + box.w / 2, box.y + box.h / 2], [500, 400]);
    assert.equal(big.text, 'Eiffel tower', 'named by its file, for the outline and a screen reader');
    assert.equal(imageSrc(big), 'Attachments/Eiffel tower.png');
    const small = imageItem('image2', 'dot.png', [0, 0], { w: 40, h: 30 });
    assert.deepEqual([small.w, small.h], [40, 30], 'a small one is never made larger');
    const plain = imageItem('image3', 'x.svg', [0, 0], null);
    assert.ok(plain.w > 0 && plain.h > 0, 'a size is given when its own cannot be read');
  });

  // proves: board_images
  test('a picture is written as text, read back as it was, and drawn as a frame the host paints into', () => {
    const item = imageItem('image1', 'Attachments/cat.png', [100, 100], { w: 200, h: 100 });
    const { board, problems } = readBoard(`// graph: b · BOARD\n${itemGql(item)}`);
    assert.equal(problems.length, 0);
    assert.equal(imageSrc(board.items[0]), 'Attachments/cat.png');
    assert.match(boardSvg(board, PALETTE), /data-image="image1"/);
    assert.equal(imageSrc({ ...item, more: {} }), null, 'an Image item with no link shows only its frame');
  });

  // proves: board_images
  test('only a file kept beside the notes is shown: never a link to the web, nor data in the link', () => {
    for (const src of ['cat.png', 'Attachments/My cat.png', '../shared/cat.webp']) assert.ok(isLocalSrc(src), src);
    for (const src of ['https://x.org/cat.png', 'http://x.org/a.gif', '//x.org/a.png', 'data:image/png;base64,AAAA'])
      assert.ok(!isLocalSrc(src), src);
    assert.ok(!isLocalSrc('javascript:alert(1)') && !isLocalSrc('file:///etc/passwd') && !isLocalSrc('a"b.png'));
    assert.ok(isPicture('image/png') && isPicture('image/svg+xml') && isPicture('IMAGE/JPEG'));
    assert.ok(!isPicture('application/pdf') && !isPicture('text/html') && !isPicture(''));
  });

  // proves: board_images
  test('a note dropped or pasted is read from a wiki link, a path or the link Obsidian gives, and becomes a card', () => {
    assert.equal(noteLinkOf('[[Paris]]'), 'Paris');
    assert.equal(noteLinkOf(' [[Trips/Paris|the city]] '), 'Trips/Paris');
    assert.equal(noteLinkOf('[[Paris#Hotels]]'), 'Paris');
    assert.equal(noteLinkOf('Trips/Paris.md'), 'Trips/Paris.md');
    assert.equal(noteLinkOf('obsidian://open?vault=Home&file=Trips%2FParis'), 'Trips/Paris');
    assert.equal(noteLinkOf('![[Paris]]'), 'Paris', 'an embed names the note too');
    assert.equal(noteLinkOf('[[a]b]]'), null);
    // a very long text is never read as a link, and an odd one is read character by character, by no pattern
    assert.equal(noteLinkOf(`[[${'a'.repeat(LINK_MOST)}]]`), null);
    for (const odd of ['[['.repeat(400), `${'a.'.repeat(400)}!`, `obsidian://open?${'&file='.repeat(150)}`]) {
      assert.equal(noteLinkOf(odd), null);
      assert.ok(nameOf(odd.repeat(50)).length > 0);
      assert.equal(typeof isLocalSrc(odd.repeat(50)), 'boolean');
    }
    for (const not of ['', 'Just some words', 'two\n[[lines]]', 'https://x.org/a.md', 'obsidian://open?vault=Home'])
      assert.equal(noteLinkOf(not), null, JSON.stringify(not));
    const card = noteCard('card1', 'Trips/Paris.md', [300, 200]);
    assert.equal(card.kind, 'Card');
    assert.equal(card.text, 'Paris');
    assert.deepEqual(cardOf(card).links, ['Trips/Paris'], 'it links to the note');
    const box = itemBox(card);
    assert.deepEqual([box.x + box.w / 2, box.y + box.h / 2], [300, 200]);
    assert.equal(nameOf('a/b/c.d.png'), 'c.d');
  });
});
