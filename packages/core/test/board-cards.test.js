// board_cards_rich (editor spec §45): a card shows its title, Markdown body, properties, attachments and links as a
// thing's details do.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { cardOf, cardLines, cardSaid, plainLine } from '../src/board-card.ts';
import { boardSvg, boardOutline } from '../src/board-svg.ts';

const BOARD = `// graph: trip · BOARD
(c:Card {x: 0, y: 0, w: 260, h: 200, text: 'Paris', body: '## Plan\\n- see the **tower**\\n- [map](https://example.org)', owner: 'Ann', attachments: 'ticket.pdf; notes.md', links: 'Hotel'}),
(s:Sticky {x: 400, y: 0, text: 'Plain'})`;

const palette = { fill: () => '#eee', blend: () => '#999', edge: '#444', text: '#111', muted: '#777' };
const board = readBoard(BOARD).board;
const byId = (id) => board.items.find((i) => i.id === id);
const card = cardOf(byId('c'));

describe('board_cards_rich', () => {
  test('a card holds a title, a Markdown body, properties, attachments and links', () => {
    assert.equal(card.title, 'Paris');
    assert.match(card.body, /tower/);
    assert.deepEqual(card.properties, [['owner', 'Ann']]);
    assert.deepEqual(card.attachments, ['ticket.pdf', 'notes.md']);
    assert.deepEqual(card.links, ['Hotel']);
  });

  test('the body is shown as plain words, links by their words', () => {
    assert.equal(plainLine('## Plan'), 'Plan');
    assert.equal(plainLine('- see the **tower**'), 'see the tower');
    assert.equal(plainLine('- [map](https://example.org)'), 'map');
  });

  test('the lines run title, body, properties, then attachments and links', () => {
    assert.deepEqual(
      cardLines(card).map((l) => l.role),
      ['title', 'body', 'body', 'body', 'row', 'row', 'row'],
    );
  });

  test('it is said whole, in the outline and the picture’s title', () => {
    const said = cardSaid(card);
    for (const part of ['Paris', 'see the tower', 'owner: Ann', 'Attached: ticket.pdf, notes.md', 'Links: Hotel'])
      assert.ok(said.includes(part), part);
    assert.ok(
      boardOutline(board)
        .find((l) => l.id === 'c')
        .said.includes('owner: Ann'),
    );
    assert.ok(boardSvg(board, palette).includes('owner: Ann'));
  });

  test('nothing remote is loaded: no address of the body reaches the picture', () => {
    assert.ok(!boardSvg(board, palette).includes('example.org'));
  });

  test('a card with only a title is drawn as it was, and other kinds are untouched', () => {
    assert.deepEqual(
      cardLines(cardOf({ ...byId('s'), kind: 'Card' })).map((l) => l.text),
      ['Plain'],
    );
    assert.ok(boardSvg(board, palette).includes('Plain'));
  });
});
