// A board item and its thing, kept linked both ways (editor spec §45, board_graph_linked, board_link_kept):
// - An item names its thing, the thing's details say it is on a board, and each opens the other.
// - A rename follows both ways, deleting never cascades across, and an undo puts both sides back.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  itemDeleted,
  itemRetitled,
  linkItems,
  thingBoards,
  thingDeleted,
  thingOfItem,
  thingRenamed,
} from '../src/board-links.ts';
import { readBoard } from '../src/board.ts';

const BOARD = `// graph: ideas · BOARD ON team
(s1:Sticky {x: 0, y: 0, text: 'Dana'}),
(s2:Sticky {x: 200, y: 0, text: 'Eli'}),
(s1)-[:CONNECTS]->(s2)`;
const TEAM = `// graph: team
(dana:Person {name: 'Dana'}),
(eli:Person {name: 'Eli'})`;
const note = (...blocks) => `# Team\n\n${blocks.map((b) => '```gql\n' + b + '\n```').join('\n\n')}\n`;
const graphOf = (text, id) => readBoard(text).board.items.find((i) => i.id === id)?.graph;

describe('board_graph_linked', () => {
  test('an item names its thing, the thing says it is on a board, and each opens the other', () => {
    const { text } = linkItems(BOARD, { s1: 'dana', s2: 'eli' });
    assert.equal(graphOf(text, 's1'), 'dana');
    assert.deepEqual(thingBoards(note(TEAM, text), 'team', 'dana'), [{ board: 'ideas', item: 's1' }]);
    assert.equal(thingOfItem(text, 's2'), 'eli');
    assert.deepEqual(thingBoards(note(TEAM, BOARD), 'team', 'dana'), [], 'an item not linked says nothing');
    assert.equal(thingOfItem(BOARD, 's1'), undefined);
  });

  test('only the items named change, and the connectors stay', () => {
    const { text } = linkItems(BOARD, { s1: 'dana' });
    const { board } = readBoard(text);
    assert.equal(board.items.find((i) => i.id === 's2').graph, undefined);
    assert.equal(board.connectors.length, 1);
  });
});

describe('board_link_kept', () => {
  const linked = linkItems(BOARD, { s1: 'dana', s2: 'eli' }).text;

  test('a rename of the thing follows to its item, and a rename of the item offers the thing’s rename', () => {
    const { text, undo } = thingRenamed(linked, 'dana', 'dana_k');
    assert.equal(graphOf(text, 's1'), 'dana_k');
    assert.equal(graphOf(text, 's2'), 'eli', 'the other item is as it was');
    assert.equal(undo, linked);
    assert.deepEqual(itemRetitled(linked, 's1', 'Dana K'), {
      op: 'set',
      thing: 'dana',
      key: 'name',
      value: "'Dana K'",
    });
    assert.equal(itemRetitled(BOARD, 's1', 'Dana K'), undefined, 'an item that stands for nothing renames nothing');
  });

  test('deleting a thing leaves its item, marked unlinked; deleting an item leaves its things', () => {
    const gone = thingDeleted(linked, 'dana');
    const { board } = readBoard(gone.text);
    const item = board.items.find((i) => i.id === 's1');
    assert.ok(item, 'the item is still there');
    assert.equal(item.graph, undefined);
    assert.equal(item.more.unlinked, true);
    assert.equal(board.items.length, 2);
    const dropped = itemDeleted(linked, 's1');
    const after = readBoard(dropped.text).board;
    assert.deepEqual(
      after.items.map((i) => i.id),
      ['s2'],
    );
    assert.equal(after.connectors.length, 0, 'its connector goes with it');
  });

  test('an undo puts both sides back', () => {
    for (const edit of [thingRenamed(linked, 'dana', 'x'), thingDeleted(linked, 'dana'), itemDeleted(linked, 's1')])
      assert.equal(edit.undo, linked);
    const none = itemDeleted(linked, 'nope');
    assert.equal(none.text, linked, 'an item that is not there changes nothing');
  });
});
