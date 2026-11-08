// board_facilitation (editor spec §45): a session may run a shared timer and keep each person's new notes hidden until
// they are revealed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import {
  authorOf,
  clock,
  hiddenFrom,
  isHidden,
  secondsLeft,
  seenBy,
  timeIsUp,
  timerSaid,
} from '../src/board-session.ts';

const BOARD = `// graph: retro · BOARD
(a:Sticky {x: 0, y: 0, text: 'Mine'}),
(b:Sticky {x: 200, y: 0, text: 'Theirs'}),
(c:Sticky {x: 400, y: 0, text: 'Open'}),
(a)-[:CONNECTS]->(b),
(c)-[:CONNECTS]->(a)`;
const hide = (text, id, person, hidden = true) => boardEdit(text, { kind: 'hide', id, person, hidden }).text;
const board = (text) => readBoard(text).board;

describe('board_facilitation', () => {
  test('every person reads the same timer from its start and length', () => {
    const timer = { startedAt: 1_000_000, seconds: 300, label: 'Write' };
    assert.equal(secondsLeft(timer, 1_000_000), 300);
    assert.equal(secondsLeft(timer, 1_000_000 + 61_000), 239);
    assert.equal(clock(239), '3:59');
    assert.equal(timeIsUp(timer, 1_000_000 + 299_000), false);
    assert.equal(timeIsUp(timer, 1_000_000 + 300_000), true);
    assert.equal(secondsLeft(timer, 9_000_000), 0);
  });

  test('the timer is said in words, and says when time is up', () => {
    const timer = { startedAt: 0, seconds: 60 };
    assert.match(timerSaid(timer, 0), /1:00 left/);
    assert.match(timerSaid(timer, 61_000), /up/);
  });

  test('a note written hidden carries its writer, in its own text', () => {
    const t = hide(BOARD, 'a', 'Ann');
    assert.match(t, /hidden: true/);
    assert.match(t, /author: 'Ann'/);
    assert.equal(isHidden(board(t).items[0]), true);
    assert.equal(authorOf(board(t).items[0]), 'Ann');
  });

  test('another person does not see a hidden note or the links to it; its writer does', () => {
    const t = hide(BOARD, 'a', 'Ann');
    const bea = seenBy(board(t), 'Bea');
    assert.deepEqual(
      bea.items.map((i) => i.id),
      ['b', 'c'],
    );
    assert.equal(bea.connectors.length, 0);
    assert.equal(seenBy(board(t), 'Ann').items.length, 3);
    assert.equal(hiddenFrom(board(t), 'Bea'), 1);
    assert.equal(hiddenFrom(board(t), 'Ann'), 0);
  });

  test('revealing shows the note to all and leaves no trace in the text', () => {
    const t = hide(hide(BOARD, 'a', 'Ann'), 'a', 'Ann', false);
    assert.doesNotMatch(t, /hidden|author/);
    assert.equal(seenBy(board(t), 'Bea').items.length, 3);
  });

  test('hiding changes only that note, and the board itself is not changed by looking', () => {
    const t = hide(BOARD, 'a', 'Ann');
    assert.deepEqual(board(t).items[1], board(BOARD).items[1]);
    const before = JSON.stringify(board(t));
    seenBy(board(t), 'Bea');
    assert.equal(JSON.stringify(board(t)), before);
  });
});
