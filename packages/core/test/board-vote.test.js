// board_vote (editor spec §45): each person votes on or reacts to an item. The votes are kept per person in the board
// block. The tally is shown per item.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { tallyOf, votesOf } from '../src/board-vote.ts';
import { boardOutline, boardSvg } from '../src/board-svg.ts';

const BOARD = `// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'Idea', locked: true}),
(b:Sticky {x: 200, y: 0, text: 'Other'})`;
const palette = { fill: () => '#eee', blend: () => '#999', edge: '#444', text: '#111', muted: '#777' };
const vote = (text, id, person, reaction) => boardEdit(text, { kind: 'vote', id, person, reaction }).text;
const item = (text, id) => readBoard(text).board.items.find((i) => i.id === id);

describe('board_vote', () => {
  test('a vote is kept per person in the item’s own text', () => {
    const t = vote(vote(BOARD, 'a', 'Ann', '+1'), 'a', 'Bea', '❤');
    assert.match(t, /votes: 'Ann=\+1; Bea=❤'/);
    assert.deepEqual(votesOf(item(t, 'a')), [
      { person: 'Ann', reaction: '+1' },
      { person: 'Bea', reaction: '❤' },
    ]);
  });

  test('the tally counts each reaction, the most first', () => {
    let t = BOARD;
    for (const p of ['Ann', 'Bea', 'Cy']) t = vote(t, 'a', p, '+1');
    t = vote(t, 'a', 'Cy', '❤');
    const tally = tallyOf(item(t, 'a'));
    assert.deepEqual(
      tally.reactions.map((r) => [r.reaction, r.count]),
      [
        ['+1', 3],
        ['❤', 1],
      ],
    );
    assert.equal(tally.people, 3);
    assert.equal(tally.total, 4);
  });

  test('the same vote again takes it back; null takes back all of a person’s', () => {
    let t = vote(BOARD, 'a', 'Ann', '+1');
    t = vote(t, 'a', 'Ann', '+1');
    assert.equal(votesOf(item(t, 'a')).length, 0);
    assert.doesNotMatch(t, /votes/);
    t = vote(vote(vote(BOARD, 'a', 'Ann', '+1'), 'a', 'Ann', '❤'), 'a', 'Ann', null);
    assert.equal(votesOf(item(t, 'a')).length, 0);
  });

  test('a locked item can still be voted on, and nothing else on the board changes', () => {
    const t = vote(BOARD, 'a', 'Ann', '+1');
    assert.equal(item(t, 'a').locked, true);
    assert.deepEqual(item(t, 'b'), item(BOARD, 'b'));
  });

  test('the tally is shown on the item and said in the outline', () => {
    const t = vote(vote(BOARD, 'b', 'Ann', '+1'), 'b', 'Bea', '+1');
    const board = readBoard(t).board;
    assert.match(boardSvg(board, palette), /data-votes="2"[^>]*>\+1 2</);
    assert.match(boardOutline(board).find((l) => l.id === 'b').said, /\+1 2/);
    assert.doesNotMatch(boardSvg(readBoard(BOARD).board, palette), /data-votes/);
  });

  test('a name or reaction cannot break the stored form', () => {
    const t = vote(BOARD, 'a', 'A;n=n', '+1');
    assert.equal(votesOf(item(t, 'a')).length, 1);
    assert.equal(votesOf(item(t, 'a'))[0].person, 'A n n');
  });
});
