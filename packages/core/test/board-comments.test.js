// board_comments (editor spec §45): threaded comments attach to items, are kept with the board and can be resolved.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { openThreads, threadsOf } from '../src/board-comments.ts';
import { boardOutline, boardSvg } from '../src/board-svg.ts';

const BOARD = `// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'Idea', locked: true}),
(b:Sticky {x: 200, y: 0, text: 'Other'})`;
const palette = { fill: () => '#eee', blend: () => '#999', edge: '#444', text: '#111', muted: '#777' };
const talk = (text, id, op) => boardEdit(text, { kind: 'comment', id, do: op });
const item = (text, id) => readBoard(text).board.items.find((i) => i.id === id);

describe('board_comments', () => {
  test('a thread is started on an item, and replies join it in order', () => {
    let t = talk(BOARD, 'b', { op: 'start', person: 'Ann', text: 'Why this?' }).text;
    t = talk(t, 'b', { op: 'reply', thread: 't1', person: 'Bea', text: 'Cost.' }).text;
    const [thread] = threadsOf(item(t, 'b'));
    assert.equal(thread.id, 't1');
    assert.deepEqual(thread.notes, [
      { by: 'Ann', text: 'Why this?' },
      { by: 'Bea', text: 'Cost.' },
    ]);
  });

  test('an item can hold several threads, each its own', () => {
    let t = talk(BOARD, 'b', { op: 'start', person: 'Ann', text: 'One' }).text;
    t = talk(t, 'b', { op: 'start', person: 'Bea', text: 'Two' }).text;
    assert.deepEqual(
      threadsOf(item(t, 'b')).map((x) => x.id),
      ['t1', 't2'],
    );
  });

  test('the comments are kept in the board block, with quotes and new lines intact', () => {
    const t = talk(BOARD, 'b', { op: 'start', person: 'Ann', text: 'He said "no"\nthen \'yes\'' }).text;
    assert.match(t, /comments:/);
    assert.equal(threadsOf(item(t, 'b'))[0].notes[0].text, 'He said "no"\nthen \'yes\'');
    assert.deepEqual(readBoard(t).problems, []);
  });

  test('a thread is resolved when done, and can be opened again', () => {
    let t = talk(BOARD, 'b', { op: 'start', person: 'Ann', text: 'Q' }).text;
    assert.equal(openThreads(item(t, 'b')), 1);
    t = talk(t, 'b', { op: 'resolve', thread: 't1' }).text;
    assert.equal(openThreads(item(t, 'b')), 0);
    assert.equal(threadsOf(item(t, 'b'))[0].resolved, true);
    t = talk(t, 'b', { op: 'reopen', thread: 't1' }).text;
    assert.equal(openThreads(item(t, 'b')), 1);
  });

  test('a reply to a thread that is not there is refused', () => {
    assert.match(talk(BOARD, 'b', { op: 'reply', thread: 't9', person: 'Ann', text: 'x' }).refused, /thread/);
  });

  test('a locked item can still be commented on, and no other item changes', () => {
    const t = talk(BOARD, 'a', { op: 'start', person: 'Ann', text: 'Hi' }).text;
    assert.equal(item(t, 'a').locked, true);
    assert.deepEqual(item(t, 'b'), item(BOARD, 'b'));
  });

  test('open threads are shown on the item and said in the outline', () => {
    const t = talk(BOARD, 'b', { op: 'start', person: 'Ann', text: 'Q' }).text;
    const board = readBoard(t).board;
    assert.match(boardSvg(board, palette), /data-comments="1"/);
    assert.match(boardOutline(board).find((l) => l.id === 'b').said, /1 open comment thread/);
    const done = readBoard(talk(t, 'b', { op: 'resolve', thread: 't1' }).text).board;
    assert.doesNotMatch(boardSvg(done, palette), /data-comments/);
  });
});
