// The named layers of a board (editor spec ES§45, board_layers). A layer is a line in the board block; an item is in
// it by `in_layer`. A layer is shown or hidden, locked or open, and drawn in its order. Nothing moves when one changes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard, writeBoard } from '../src/board.ts';
import { cardOf } from '../src/board-card.ts';
import { boardEdit } from '../src/board-edit.ts';
import { layerRows, lockedOn, seenBoard } from '../src/board-layers.ts';
import { mergeBoards } from '../src/board-merge.ts';
import { boardFrame, boardOutline, boardSvg } from '../src/board-svg.ts';
import { PALETTES } from '../src/palette.ts';

const lightPalette = PALETTES.light;

const TEXT = `// graph: ideas · BOARD
(notes:Layer {name: 'Notes', order: 1}),
(back:Layer {name: 'Background', order: -1, locked: true}),
(a:Sticky {x: 0, y: 0, text: 'Go by train', in_layer: 'notes'}),
(b:Sticky {x: 300, y: 0, text: 'Paris'}),
(map:Shape {x: 900, y: 600, w: 200, h: 100, text: 'Map', in_layer: 'back'}),
(a)-[:CONNECTS]->(b)`;

const edit = (text, change) => {
  const r = boardEdit(text, change);
  assert.ok('text' in r, `refused: ${r.refused}`);
  return r.text;
};
const order = (svg) => [...svg.matchAll(/data-item="([^"]+)"/g)].map((m) => m[1]);

describe('the named layers of a board', () => {
  // proves: board_layers
  test('are read from the block apart from the items, and written back as they were', () => {
    const { board, problems } = readBoard(TEXT);
    assert.deepEqual(problems, []);
    assert.deepEqual(
      board.layers.map((l) => [l.id, l.name, l.order, !!l.locked]),
      [
        ['notes', 'Notes', 1, false],
        ['back', 'Background', -1, true],
      ],
    );
    assert.deepEqual(
      board.items.map((i) => i.id),
      ['a', 'b', 'map'],
      'a layer is not an item',
    );
    assert.equal(writeBoard(board), TEXT);
  });

  // proves: board_layers
  test('list top first, with the loose items as a row at their place', () => {
    assert.deepEqual(
      layerRows(readBoard(TEXT).board).map((r) => [r.id, r.count, r.locked]),
      [
        ['notes', 1, false],
        [null, 1, false],
        ['back', 1, true],
      ],
    );
  });

  // proves: board_layers
  test('draw a higher layer over a lower one, whatever each item says of itself', () => {
    const board = readBoard(TEXT).board;
    assert.deepEqual(order(boardSvg(board, lightPalette)), ['map', 'b', 'a']);
  });

  // proves: board_layers
  test('hide a layer without moving or losing anything: its items are not drawn, read out or reached', () => {
    const text = edit(TEXT, { kind: 'layer-set', id: 'notes', hidden: true });
    assert.ok(text.includes("(notes:Layer {name: 'Notes', order: 1, hidden: true})"));
    assert.ok(text.includes("(a:Sticky {x: 0, y: 0, text: 'Go by train', in_layer: 'notes'})"), 'the item stays');
    const board = readBoard(text).board;
    const svg = boardSvg(board, lightPalette);
    assert.deepEqual(order(svg), ['map', 'b']);
    assert.ok(!svg.includes('data-connector'), 'a connector to a hidden item is not drawn');
    assert.deepEqual(
      boardOutline(board).map((l) => l.id),
      ['b', 'map'],
    );
    assert.deepEqual(boardFrame(board), boardFrame(readBoard(TEXT).board), 'the frame stays, so nothing jumps');
    assert.deepEqual(
      seenBoard(board).items.map((i) => i.id),
      ['b', 'map'],
    );
    const shown = edit(text, { kind: 'layer-set', id: 'notes', hidden: false });
    assert.equal(shown, TEXT, 'showing it again puts the block back as it was');
  });

  // proves: board_layers
  test('lock every item of a locked or hidden layer, and free them when it is unlocked', () => {
    const board = readBoard(TEXT).board;
    assert.ok(lockedOn(board, board.items[2]));
    assert.ok('refused' in boardEdit(TEXT, { kind: 'move', id: 'map', x: 0, y: 0 }));
    assert.ok('refused' in boardEdit(TEXT, { kind: 'remove', id: 'map' }));
    const open = edit(TEXT, { kind: 'layer-set', id: 'back', locked: false });
    assert.ok(open.includes("(back:Layer {name: 'Background', order: -1})"));
    assert.ok(edit(open, { kind: 'move', id: 'map', x: 5, y: 5 }).includes('(map:Shape {x: 5, y: 5'));
    const hidden = edit(TEXT, { kind: 'layer-set', id: 'notes', hidden: true });
    assert.ok('refused' in boardEdit(hidden, { kind: 'move', id: 'a', x: 9, y: 9 }), 'unseen, so never moved');
  });

  // proves: board_layers
  test('make a new layer on top, with a name the board does not use', () => {
    const text = edit(TEXT, { kind: 'layer-add', name: 'Ideas' });
    assert.ok(text.includes("(layer1:Layer {name: 'Ideas', order: 2})"));
    assert.equal(layerRows(readBoard(text).board)[0].name, 'Ideas');
  });

  // proves: board_layers
  test('rename a layer by its own line alone', () => {
    const text = edit(TEXT, { kind: 'layer-set', id: 'notes', name: 'Sticky notes' });
    assert.equal(text, TEXT.replace("name: 'Notes'", "name: 'Sticky notes'"));
  });

  // proves: board_layers
  test('step a layer down past the loose items, and refuse a step past either end', () => {
    const text = edit(TEXT, { kind: 'layer-step', id: 'notes', by: -1 });
    assert.deepEqual(
      layerRows(readBoard(text).board).map((r) => r.id),
      [null, 'notes', 'back'],
    );
    assert.deepEqual(order(boardSvg(readBoard(text).board, lightPalette)), ['map', 'a', 'b']);
    assert.ok('refused' in boardEdit(TEXT, { kind: 'layer-step', id: 'notes', by: 1 }));
    assert.ok('refused' in boardEdit(TEXT, { kind: 'layer-step', id: 'back', by: -1 }));
  });

  // proves: board_layers
  test('put items into a layer and make them loose again, changing only their own lines', () => {
    const text = edit(TEXT, { kind: 'into', ids: ['b'], layer: 'notes' });
    assert.equal(text, TEXT.replace("text: 'Paris'}", "text: 'Paris', in_layer: 'notes'}"));
    assert.equal(edit(text, { kind: 'into', ids: ['b'], layer: null }), TEXT);
    assert.ok('refused' in boardEdit(TEXT, { kind: 'into', ids: ['b'], layer: 'nowhere' }));
  });

  // proves: board_layers
  test('refuse to move an item out of a locked or hidden layer, so a move never unlocks it', () => {
    assert.match(boardEdit(TEXT, { kind: 'into', ids: ['map'], layer: 'notes' }).refused, /locked/i);
    assert.match(boardEdit(TEXT, { kind: 'into', ids: ['map'], layer: null }).refused, /locked/i);
    const hidden = edit(TEXT, { kind: 'layer-set', id: 'notes', hidden: true });
    assert.match(boardEdit(hidden, { kind: 'into', ids: ['a'], layer: null }).refused, /locked/i);
    // of a locked item and a free one, only the free one moves
    const both = edit(TEXT, { kind: 'into', ids: ['map', 'b'], layer: 'notes' });
    assert.match(both, /\(b:Sticky \{[^}]*in_layer: 'notes'/);
    assert.match(both, /\(map:Shape \{[^}]*in_layer: 'back'/);
  });

  // proves: board_layers
  test('step a layer up and down when two layers share an order or have none', () => {
    const tied = `// graph: ideas · BOARD
(one:Layer {name: 'One', order: 2}),
(two:Layer {name: 'Two', order: 2}),
(none:Layer {name: 'None'}),
(a:Sticky {x: 0, y: 0, text: 'Go by train', in_layer: 'one'})`;
    const names = (text) => layerRows(readBoard(text).board).map((r) => r.name);
    assert.deepEqual(names(tied), ['Two', 'One', 'None', 'Items in no layer']);
    const up = edit(tied, { kind: 'layer-step', id: 'one', by: 1 });
    assert.deepEqual(names(up), ['One', 'Two', 'None', 'Items in no layer']);
    const down = edit(up, { kind: 'layer-step', id: 'one', by: -1 });
    assert.deepEqual(names(down), ['Two', 'One', 'None', 'Items in no layer']);
    const last = edit(down, { kind: 'layer-step', id: 'none', by: 1 });
    assert.deepEqual(names(last), ['Two', 'None', 'One', 'Items in no layer']);
    const orders = readBoard(last).board.layers.map((l) => l.order);
    assert.equal(new Set(orders).size, orders.length, 'no two layers share an order after a step');
  });

  // proves: board_layers
  test('take a layer out and leave its items on the board, loose', () => {
    const board = readBoard(edit(TEXT, { kind: 'layer-remove', id: 'notes' })).board;
    assert.deepEqual(
      board.layers.map((l) => l.id),
      ['back'],
    );
    assert.deepEqual(board.items.find((i) => i.id === 'a').more, {});
    assert.equal(board.items.length, 3);
  });

  // proves: board_layers
  test('are kept when two people’s boards are merged', () => {
    const theirs = edit(TEXT, { kind: 'layer-add', name: 'Ideas' });
    const merged = readBoard(mergeBoards(TEXT, TEXT, theirs).text).board;
    assert.deepEqual(
      merged.layers.map((l) => l.id),
      ['notes', 'back', 'layer1'],
    );
  });

  // proves: board_layers
  test('never show a card its layer as one of its own properties', () => {
    const card = { id: 'c', kind: 'Card', x: 0, y: 0, text: 'Paris', more: { in_layer: 'notes', country: 'France' } };
    assert.deepEqual(cardOf(card).properties, [['country', 'France']]);
  });

  // proves: board_layers
  test('never give a new item the name of a layer', () => {
    const text = edit(`// graph: ideas · BOARD\n(sticky1:Layer {name: 'Odd', order: 1})`, {
      kind: 'add',
      item: { id: 'sticky1', kind: 'Sticky', x: 0, y: 0, more: {} },
    });
    assert.ok(text);
  });
});
