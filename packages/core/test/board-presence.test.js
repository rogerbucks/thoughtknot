// Presence on a board (editor spec §45, board_presence). Each person's pointer, selection and name show with a mark that
// is not only colour. A person can be followed. Presence never reaches the note.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import * as presence from '../src/board-presence.ts';

const { followSpot, marks, others, presenceSaid, SHAPES, STALE } = presence;
const BOARD = `// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'One'}),
(b:Sticky {x: 400, y: 0, text: 'Two'})`;
const peer = (id, name, extra = {}) => ({ id, name, selection: [], seen: 1000, ...extra });
const board = readBoard(BOARD).board;

describe('board_presence', () => {
  test('others leaves out me and anyone not heard from lately, in a fixed order', () => {
    const peers = [peer('z', 'Zed'), peer('me', 'Me'), peer('a', 'Ann'), peer('old', 'Old', { seen: 0 })];
    assert.deepEqual(
      others(peers, 'me', 1000 + STALE).map((p) => p.id),
      ['a', 'z'],
    );
  });

  test('each person has a shape and an initial, not only a colour, and the same on every screen', () => {
    const peers = [peer('b', 'bea'), peer('a', 'Ann')];
    const first = marks(peers);
    const again = marks([...peers].reverse());
    assert.deepEqual([...first.entries()], [...again.entries()].sort());
    assert.equal(first.get('a').initial, 'A');
    assert.equal(first.get('b').initial, 'B');
    assert.notEqual(first.get('a').shape, first.get('b').shape);
    assert.ok(SHAPES.includes(first.get('a').shape));
  });

  test('following a person goes to their pointer, else the middle of their selection, else nowhere', () => {
    assert.deepEqual(followSpot(board, peer('a', 'Ann', { pointer: [5, 6] })), [5, 6]);
    const spot = followSpot(board, peer('a', 'Ann', { selection: ['a'] }));
    const box = board.items[0];
    assert.ok(spot && spot[0] > box.x && spot[1] > box.y);
    assert.equal(followSpot(board, peer('a', 'Ann')), null);
  });

  test('says who is here and what they have selected', () => {
    assert.match(presenceSaid([]), /only one/);
    const said = presenceSaid([peer('a', 'Ann', { selection: ['a', 'b'] }), peer('b', 'Bea')]);
    assert.match(said, /Ann has a, b selected/);
    assert.match(said, /Bea is here/);
  });

  test('presence never reaches the note: no part of it takes or gives the board text', () => {
    for (const fn of Object.values(presence).filter((v) => typeof v === 'function'))
      assert.ok(fn.length <= 3, `${fn.name} takes no board text`);
    const edited = boardEdit(BOARD, { kind: 'text', id: 'a', text: 'Same' }).text;
    presenceSaid([peer('a', 'Ann', { selection: ['a'] })]);
    assert.equal(boardEdit(BOARD, { kind: 'text', id: 'a', text: 'Same' }).text, edited);
    assert.ok(!/Ann|pointer|selection/.test(edited));
  });
});
