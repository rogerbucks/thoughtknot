// A board read from and written as an Excalidraw drawing (editor spec ES§45, board_exchange). Our own reader and
// writer: no library. What the board cannot hold is named in a plain sentence.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard, writeBoard } from '../src/board.ts';
import { boardExcalidraw, excalidrawBoard, EXCALIDRAW_LIMITS } from '../src/board-excalidraw.ts';

const el = (id, type, x, y, width, height, more = {}) => ({ id, type, x, y, width, height, angle: 0, ...more });
const DRAWING = {
  type: 'excalidraw',
  version: 2,
  elements: [
    el('fr', 'frame', -20, -20, 700, 500, { name: 'Trip' }),
    el('box-1', 'rectangle', 0, 0, 200.4, 100, { boundElements: [{ type: 'text', id: 't1' }], groupIds: ['g1'] }),
    el('t1', 'text', 10, 10, 100, 25, { text: 'Go by train', containerId: 'box-1' }),
    el('oval', 'ellipse', 400, 0, 120, 80, { locked: true, groupIds: ['g1'] }),
    el('dia', 'diamond', 400, 200, 120, 80),
    el('note', 'text', 0, 300, 100, 25, { text: 'Book early\nor pay more' }),
    el('arr', 'arrow', 200, 50, 200, 0, {
      points: [
        [0, 0],
        [200, 0],
      ],
      startBinding: { elementId: 'box-1' },
      endBinding: { elementId: 'oval' },
      boundElements: [{ type: 'text', id: 't2' }],
    }),
    el('t2', 'text', 280, 40, 30, 25, { text: 'then', containerId: 'arr' }),
    el('loose', 'arrow', 0, 400, 100, 50, {
      points: [
        [0, 0],
        [40, 60.2],
        [100, 50],
      ],
    }),
    el('rule', 'line', 0, 500, 100, 0, {
      points: [
        [0, 0],
        [100, 0],
      ],
    }),
    el('pen', 'freedraw', 300, 300, 30, 9, {
      points: [
        [0, 0],
        [12.2, 4],
        [30, 9],
      ],
    }),
    el('gone', 'rectangle', 0, 0, 10, 10, { isDeleted: true }),
  ],
};
const read = (drawing, name = 'trip') => excalidrawBoard(JSON.stringify(drawing), name);

describe('board_excalidraw', () => {
  // proves: board_exchange
  test('reads shapes, text, frames and strokes as items, and a bound arrow as a connector', () => {
    const got = read(DRAWING);
    assert.deepEqual(got.notes, []);
    assert.equal(got.board.name, 'trip');
    assert.deepEqual(got.board.items, [
      { id: 'fr', kind: 'Frame', x: -20, y: -20, w: 700, h: 500, text: 'Trip', more: {} },
      {
        id: 'box_1',
        kind: 'Shape',
        x: 0,
        y: 0,
        w: 200,
        h: 100,
        text: 'Go by train',
        group: 'g1',
        more: { shape: 'box' },
      },
      { id: 'oval', kind: 'Shape', x: 400, y: 0, w: 120, h: 80, group: 'g1', locked: true, more: { shape: 'ellipse' } },
      { id: 'dia', kind: 'Shape', x: 400, y: 200, w: 120, h: 80, more: { shape: 'box' } },
      { id: 'note', kind: 'Text', x: 0, y: 300, w: 100, h: 25, text: 'Book early\nor pay more', more: {} },
      { id: 'loose', kind: 'Shape', x: 0, y: 400, w: 100, h: 50, more: { shape: 'arrow', points: '0 0 100 50' } },
      { id: 'rule', kind: 'Shape', x: 0, y: 500, w: 100, more: { shape: 'line', points: '0 0 100 0' } },
      { id: 'pen', kind: 'Ink', x: 300, y: 300, w: 30, h: 9, more: { points: '0 0 12 4 30 9' } },
    ]);
    assert.deepEqual(got.board.connectors, [{ from: 'box_1', to: 'oval', label: 'then' }]);
  });

  // proves: board_exchange
  test('the board it reads is written as a block the board reader reads with no problem', () => {
    const { board } = read(DRAWING);
    const again = readBoard(writeBoard(board));
    assert.deepEqual(again.problems, []);
    assert.deepEqual(again.board, board);
  });

  // proves: board_exchange
  test('reads the drawing inside an Obsidian Excalidraw note, and refuses a compressed one with what to do', () => {
    const note = (fence, body) =>
      `---\nexcalidraw-plugin: parsed\n---\n# Text Elements\nGo ^t1\n\n## Drawing\n\`\`\`${fence}\n${body}\n\`\`\`\n%%`;
    const got = excalidrawBoard(note('json', JSON.stringify(DRAWING)), 'trip');
    assert.equal(got.board.items.length, 8);
    const packed = excalidrawBoard(note('compressed-json', 'N4KAkARALgngDgUwgLgAQQ'), 'trip');
    assert.equal(packed.why, 'compressed');
    assert.match(packed.refused, /Decompress/);
  });

  // proves: board_exchange
  test('skips what it cannot read, and says so in plain sentences', () => {
    const got = read({
      type: 'excalidraw',
      elements: [
        el('a', 'rectangle', 0, 0, 100, 50, { angle: 0.5, backgroundColor: '#ffc9c9' }),
        el('a', 'rectangle', 0, 0, 100, 50),
        el('img', 'image', 0, 0, 100, 50, { fileId: 'f1' }),
        el('b', 'hologram', 0, 0, 100, 50),
        el('c', 'rectangle', 'left', 0, 100, 50),
        el('lost', 'text', 0, 0, 10, 10, { text: 'no home', containerId: 'nowhere' }),
        'junk',
      ],
    });
    assert.deepEqual(
      got.board.items.map((i) => i.id),
      ['a', 'lost'],
      'a text whose box is gone stands on its own',
    );
    assert.equal(got.notes.length, 3);
    assert.match(got.notes[0], /4 items/, 'the same name twice, an unknown type, a place that is no number, and junk');
    assert.match(got.notes[1], /1 pictures/, 'a picture is kept inside the drawing, where a board cannot hold it');
    assert.match(got.notes[2], /colour/i, 'a fill and a turn are not kept');
    for (const note of got.notes) assert.match(note, /\.$/, 'each is a whole sentence');
  });

  // proves: board_exchange
  test('refuses what is not a drawing, or is over the limits, with a sentence', () => {
    for (const bad of ['', 'not json', '[]', '{}', '{"type": "excalidraw"}', '{"type": "excalidraw", "elements": 3}']) {
      const got = excalidrawBoard(bad, 'x');
      assert.equal(got.why, 'not-excalidraw', bad);
      assert.match(got.refused, /Excalidraw/);
    }
    const many = { type: 'excalidraw', elements: [0, 1, 2, 3].map((i) => el(`n${i}`, 'rectangle', i, 0, 1, 1)) };
    assert.equal(excalidrawBoard(JSON.stringify(many), 'x', { ...EXCALIDRAW_LIMITS, items: 3 }).why, 'too-many');
    assert.equal(excalidrawBoard(JSON.stringify(many), 'x', { ...EXCALIDRAW_LIMITS, chars: 10 }).why, 'too-large');
    const long = { type: 'excalidraw', elements: [el('a', 'text', 0, 0, 1, 1, { text: 'x'.repeat(50) })] };
    assert.equal(excalidrawBoard(JSON.stringify(long), 'x', { ...EXCALIDRAW_LIMITS, text: 40 }).why, 'text-too-long');
  });

  // proves: board_exchange
  test('writes a board as a drawing that reads back as the same items and connectors', () => {
    const { board } = readBoard(`// graph: ideas · BOARD ON trip
(a:Sticky {x: 0, y: 0, text: 'Go by train'}),
(b:Card {x: 300, y: 0, w: 200, h: 100, text: 'Paris', body: 'Two days'}),
(t:Text {x: 0, y: 300, text: 'Book early'}),
(f:Frame {x: -10, y: -10, w: 600, h: 500, text: 'Week 1'}),
(i:Ink {x: 0, y: 400, w: 30, h: 9, points: '0 0 12 4 30 9'}),
(o:Shape {x: 300, y: 300, shape: 'ellipse'}),
(v:View {x: 0, y: 600, view: 'matrix'}),
(a)-[:CONNECTS {label: 'to'}]->(b)`);
    const { json, notes } = boardExcalidraw(board);
    const drawing = JSON.parse(json);
    assert.equal(drawing.type, 'excalidraw');
    assert.equal(drawing.version, 2);
    assert.deepEqual(drawing.files, {});
    assert.deepEqual(
      drawing.elements.map((e) => e.type),
      ['rectangle', 'text', 'rectangle', 'text', 'text', 'frame', 'freedraw', 'ellipse', 'arrow', 'text'],
    );
    const ids = drawing.elements.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, 'every element has a name of its own');
    for (const e of drawing.elements) {
      for (const key of ['x', 'y', 'width', 'height', 'angle', 'seed', 'version', 'versionNonce', 'opacity'])
        assert.equal(typeof e[key], 'number', `${e.id} ${key}`);
      assert.equal(e.isDeleted, false);
      assert.ok(Array.isArray(e.groupIds));
    }
    const arrow = drawing.elements.find((e) => e.type === 'arrow');
    assert.equal(arrow.startBinding.elementId, 'a');
    assert.equal(arrow.endBinding.elementId, 'b');
    assert.equal(arrow.endArrowhead, 'arrow');
    const a = drawing.elements.find((e) => e.id === 'a');
    assert.ok(
      a.boundElements.some((b) => b.type === 'arrow' && b.id === arrow.id),
      'the box knows its arrow',
    );
    assert.equal(notes.length, 1, 'one sentence names what a drawing cannot hold');
    assert.match(notes[0], /1 items/);

    const back = excalidrawBoard(json, 'ideas');
    assert.deepEqual(back.notes, []);
    assert.deepEqual(
      back.board.items.map((i) => [i.id, i.kind, i.x, i.y, i.w, i.h, i.text]),
      [
        ['a', 'Shape', 0, 0, 160, 160, 'Go by train'],
        ['b', 'Shape', 300, 0, 200, 100, 'Paris\nTwo days'],
        ['t', 'Text', 0, 300, 200, 40, 'Book early'],
        ['f', 'Frame', -10, -10, 600, 500, 'Week 1'],
        ['i', 'Ink', 0, 400, 30, 9, undefined],
        ['o', 'Shape', 300, 300, 120, 80, undefined],
      ],
    );
    assert.equal(back.board.items[4].more.points, '0 0 12 4 30 9');
    assert.deepEqual(back.board.connectors, [{ from: 'a', to: 'b', label: 'to' }]);
  });
});
