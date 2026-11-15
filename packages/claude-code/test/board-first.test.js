// The board as the page's main screen (editor spec ES§45, board_main_screen). A note with graphs and no board opens on
// a starter board, one view for each graph, written only once it is changed. The choice of what comes first is kept for
// the person, and a storage that refuses never stops the page.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boardOf, readBoard } from '../../core/src/board.ts';
import { boardFirst, chooseFirst, firstTimeLine, starterBoard, withStarter } from '../page/board-first.ts';

const NOTE = [
  '# Trip',
  '```gql',
  '// graph: trip',
  '(paris:City), (lyon:City), (paris)-[:ROAD]->(lyon)',
  '```',
  '```gql',
  '// graph: people',
  '(ann:Person)',
  '```',
  '',
].join('\n');
const isBoard = (t) => !!boardOf(t);

/** A storage like the window's, kept in a map. */
function store() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)) };
}

describe('the board as the main screen', () => {
  // proves: board_main_screen
  test('a note with graphs and no board opens on a starter board with a view of each graph, side by side', () => {
    const s = starterBoard(NOTE, isBoard);
    const board = readBoard(s.text).board;
    assert.equal(board.on, 'trip');
    assert.deepEqual(
      board.items.map((i) => [i.kind, i.more.of, i.y]),
      [
        ['View', 'trip', 0],
        ['View', 'people', 0],
      ],
    );
    assert.ok(board.items[1].x > board.items[0].x + board.items[0].w, 'never over each other');
  });

  // proves: board_main_screen
  test('a note with a board, or with no graph, has no starter board; written, it goes at the note’s end', () => {
    const s = starterBoard(NOTE, isBoard);
    const written = withStarter(NOTE, s.text);
    assert.ok(written.startsWith(NOTE.trimEnd()), 'the note as it was, first');
    assert.equal(starterBoard(written, isBoard), null);
    assert.equal(starterBoard('# Just words\n', isBoard), null);
  });

  // proves: board_main_screen
  test('the board comes first until the person chooses the graph first, and a storage that refuses changes nothing', () => {
    const kept = store();
    assert.equal(boardFirst(kept), true);
    assert.equal(firstTimeLine(kept), true, 'the line about the change, until the person chooses');
    assert.equal(firstTimeLine(kept), true);
    chooseFirst(kept, false);
    assert.equal(firstTimeLine(kept), false);
    assert.equal(boardFirst(kept), false);
    chooseFirst(kept, true);
    assert.equal(boardFirst(kept), true);
    const refusing = {
      getItem() {
        throw new Error('no');
      },
      setItem() {
        throw new Error('no');
      },
    };
    assert.equal(boardFirst(refusing), true);
    assert.doesNotThrow(() => chooseFirst(refusing, false));
    assert.equal(firstTimeLine(refusing), false);
    assert.equal(boardFirst(null), true);
  });
});
