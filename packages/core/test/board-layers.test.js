// The named layers of a board (editor spec §45, board_layers). A layer is a thing of the board block. It is hidden,
// locked, put over another, renamed and removed, and items are moved to it. Each is a change to the block.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readBoard, writeBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { boardKey } from '../src/board-keys.ts';
import { layersTopFirst, readShown } from '../src/board-layers.ts';
import { boardOutline, boardSvg } from '../src/board-svg.ts';
import { PALETTES } from '../src/palette.ts';

const PALETTE = PALETTES.light;
const TEXT = [
  '// graph: ideas · BOARD',
  "(notes:Layer {name: 'Notes', order: 1}),",
  "(marks:Layer {name: 'Marks', order: 2, hidden: true}),",
  "(a:Sticky {x: 0, y: 0, text: 'Go'}),",
  "(b:Sticky {x: 300, y: 0, text: 'Stay', sheet: 'notes'}),",
  "(c:Sticky {x: 600, y: 0, text: 'Maybe', sheet: 'marks'}),",
  '(b)-[:CONNECTS]->(c)',
].join('\n');
const ask = (text, a) => boardEdit(text, { kind: 'layers', ask: a });
const order = (svg) => [...svg.matchAll(/data-item="(\w+)"/g)].map((m) => m[1]);

// proves: board_layers
test('layers are things of the board block, read with no problem and written back as they were', () => {
  const { board, problems } = readBoard(TEXT);
  assert.deepEqual(problems, []);
  assert.deepEqual(
    board.layers.map((l) => [l.id, l.name, l.order, !!l.hidden]),
    [
      ['notes', 'Notes', 1, false],
      ['marks', 'Marks', 2, true],
    ],
  );
  assert.deepEqual(
    board.items.map((i) => i.id),
    ['a', 'b', 'c'],
    'a layer is not an item',
  );
  assert.equal(writeBoard(board), TEXT);
});

// proves: board_layers
test('a hidden layer is not drawn and cannot be reached, and a shown one is drawn over the board itself', () => {
  const shown = readShown(TEXT);
  assert.deepEqual(
    shown.items.map((i) => i.id),
    ['a', 'b'],
  );
  assert.ok(!boardSvg(shown, PALETTE).includes('data-connector'), 'a connector to a hidden item goes with it');
  assert.ok(!boardOutline(shown).some((l) => /Maybe/.test(l.said)), 'and the outline does not say it');
  assert.equal(writeBoard(shown), TEXT, 'yet nothing is lost when it is written');
  assert.deepEqual(order(boardSvg(readBoard(TEXT).board, PALETTE)), ['a', 'b']);
  const raised = boardEdit(TEXT, { kind: 'layer', id: 'a', layer: 9 });
  assert.deepEqual(order(boardSvg(readBoard(raised.text).board, PALETTE)), ['a', 'b'], 'a layer outranks an item');
  const seen = ask(TEXT, { kind: 'show', id: 'marks', shown: true });
  assert.ok(!seen.text.includes('hidden'));
  assert.deepEqual(order(boardSvg(readBoard(seen.text).board, PALETTE)), ['a', 'b', 'c']);
});

// proves: board_layers
test('an item on a locked layer stays as it is until the layer is unlocked, and its text may still change', () => {
  const locked = ask(TEXT, { kind: 'lock', id: 'notes', locked: true });
  assert.match(locked.text, /\(notes:Layer \{name: 'Notes', order: 1, locked: true\}\)/);
  assert.match(boardEdit(locked.text, { kind: 'move', id: 'b', x: 5, y: 5 }).refused, /locked layer Notes/);
  assert.match(boardEdit(locked.text, { kind: 'remove', id: 'b' }).refused, /locked layer Notes/);
  assert.ok('text' in boardEdit(locked.text, { kind: 'text', id: 'b', text: 'Wait' }));
  assert.ok('text' in boardEdit(locked.text, { kind: 'move', id: 'a', x: 5, y: 5 }), 'other items are free');
  assert.equal(readShown(locked.text).items.find((i) => i.id === 'b').locked, true, 'so it is never dragged');
  const press = { key: 'ArrowRight', shift: true, alt: false, ctrl: false, meta: false };
  const step = boardKey(readShown(locked.text), { focus: 'b', linking: null }, press, [0, 0], false);
  assert.match(step.said, /locked layer Notes/, 'and the keyboard says why');
  assert.equal(step.change, undefined);
  assert.match(ask(locked.text, { kind: 'put', items: ['b'], id: null }).refused, /locked layer Notes/);
  assert.match(ask(locked.text, { kind: 'put', items: ['a', 'b'], id: 'marks' }).refused, /locked layer Notes/);
  assert.ok('text' in ask(locked.text, { kind: 'put', items: ['a'], id: 'notes' }), 'an item may still be put on it');
  const open = ask(locked.text, { kind: 'lock', id: 'notes', locked: false });
  assert.equal(open.text, TEXT);
});

// proves: board_layers
test('a new layer goes on top under a name nothing has, and layers change places one step at a time', () => {
  const made = ask(TEXT, { kind: 'add', name: '  Notes ' });
  assert.match(made.text, /\(notes2:Layer \{name: 'Notes', order: 3\}\)/);
  assert.match(ask(TEXT, { kind: 'add', name: '  ' }).refused, /name/);
  const top = (text) => layersTopFirst(readBoard(text).board).map((l) => l.id);
  assert.deepEqual(top(TEXT), ['marks', 'notes']);
  const up = ask(TEXT, { kind: 'raise', id: 'notes', by: 1 });
  assert.deepEqual(top(up.text), ['notes', 'marks']);
  assert.match(ask(up.text, { kind: 'raise', id: 'notes', by: 1 }).refused, /on top/);
  assert.match(ask(TEXT, { kind: 'raise', id: 'notes', by: -1 }).refused, /at the back/);
  const tied = TEXT.replace(', order: 1}', '}').replace('order: 2, ', '');
  assert.deepEqual(top(tied), ['marks', 'notes'], 'layers written with no order both have 1: the later is over');
  const untied = ask(tied, { kind: 'raise', id: 'notes', by: 1 });
  assert.deepEqual(top(untied.text), ['notes', 'marks'], 'and still change places');
  assert.match(untied.text, /\(notes:Layer \{name: 'Notes', order: 2\}\)/);
});

// proves: board_layers
test('items are moved to a layer or back to the board, and a layer removed leaves its items on the board', () => {
  const put = ask(TEXT, { kind: 'put', items: ['a'], id: 'notes' });
  assert.match(put.text, /\(a:Sticky \{x: 0, y: 0, text: 'Go', sheet: 'notes'\}\)/);
  const back = ask(put.text, { kind: 'put', items: ['a'], id: null });
  assert.equal(back.text, TEXT);
  assert.match(ask(TEXT, { kind: 'put', items: [], id: 'notes' }).refused, /Choose an item/);
  assert.match(ask(TEXT, { kind: 'put', items: ['a'], id: 'gone' }).refused, /no layer gone/);
  const renamed = ask(TEXT, { kind: 'rename', id: 'notes', name: 'Thoughts' });
  assert.match(renamed.text, /\(notes:Layer \{name: 'Thoughts', order: 1\}\)/);
  const removed = ask(TEXT, { kind: 'remove', id: 'marks' });
  assert.ok(!removed.text.includes('marks'));
  assert.match(removed.text, /\(c:Sticky \{x: 600, y: 0, text: 'Maybe'\}\)/, 'its item stays, on the board itself');
  assert.match(removed.text, /\(b\)-\[:CONNECTS\]->\(c\)/);
});

// proves: board_layers
test('a new item never takes the name of a layer or of an item on a hidden layer', () => {
  const shown = readShown(TEXT.replace('(c:Sticky', '(sticky1:Sticky').replace('->(c)', '->(sticky1)'));
  const made = boardEdit(writeBoard(shown), {
    kind: 'add',
    item: { id: 'sticky2', kind: 'Sticky', x: 0, y: 300, more: {} },
  });
  assert.ok('text' in made);
  assert.match(boardEdit(TEXT, { kind: 'add', item: { id: 'c', kind: 'Sticky', x: 0, y: 0, more: {} } }).refused, /c/);
});
