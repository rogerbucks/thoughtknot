// The whiteboard first (editor spec ES§76, board_first_new_note). A new note, or one with no graph and no board, opens on
// an empty whiteboard, the same in every host: each host asks the core for the board a note opens on. Nothing is
// written to the note until the person makes something on it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks } from '../src/blocks.ts';
import { boardOf, readBoard } from '../src/board.ts';
import { capture } from '../src/board-capture.ts';
import { boardEditInNote } from '../src/board-edit.ts';
import { openingBoard } from '../src/board-first.ts';
import { withStarter } from '../src/board-starter.ts';

const isBoard = (t) => !!boardOf(t);
const NOTES = { new: '', words: '# Trip\n\nIdeas for the trip, not yet a graph.\n' };

describe('board_first_new_note', () => {
  for (const [what, note] of Object.entries(NOTES))
    test(`a ${what} note opens on an empty board, and the note is unchanged`, () => {
      const before = note;
      const b = openingBoard(note, isBoard);
      assert.ok(b);
      assert.equal(b.starter, true, 'still to be written');
      const { board, problems } = readBoard(b.text);
      assert.deepEqual(problems, []);
      assert.equal(board.items.length, 0);
      assert.equal(board.on, null);
      assert.equal(note, before);
      assert.equal(gqlBlocks(note).length, 0, 'nothing was written');
    });

  test('the board is written only when the first item is made, and the words are kept', () => {
    const note = NOTES.words;
    const b = openingBoard(note, isBoard);
    const r = capture(readBoard(b.text).board, 'spot', 'Go by train', null, [0, 0]);
    assert.ok(!('refused' in r));
    const written = boardEditInNote(withStarter(note, b.text), b.name, r.changes[0]);
    assert.ok(!('refused' in written), written.refused);
    assert.ok(written.note.startsWith(note.trimEnd()), 'the words are kept');
    const after = readBoard(
      gqlBlocks(written.note)
        .map((x) => x.text)
        .find(isBoard),
    ).board;
    assert.equal(after.items.length, 1);
    assert.equal(after.items[0].text, 'Go by train');
  });

  test('a note with graphs opens on its starter board, and one with a board on that board', () => {
    const graph = "# G\n\n```gql\n// graph: trip\n(a:Place {name: 'Home'})\n```\n";
    const b = openingBoard(graph, isBoard);
    assert.equal(readBoard(b.text).board.items[0].kind, 'View');
    const kept = withStarter(graph, b.text);
    assert.equal(openingBoard(kept, isBoard), null, 'its own board opens');
  });

  test('the empty board takes a name the note does not use', () => {
    const note = '```gql\n// graph: ideas_board\n(a:Thing)\n```\n';
    const b = openingBoard('# Plain\n', isBoard);
    assert.equal(b.name, 'ideas_board');
    const c = openingBoard(note, isBoard);
    assert.notEqual(c.name, 'ideas_board');
  });
});
