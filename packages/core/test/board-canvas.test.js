// A board read from and written as JSON Canvas, the open format of Obsidian Canvas (editor spec ES§45,
// board_exchange). Our own reader and writer: no library. What the board cannot hold is named in a plain sentence.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard, writeBoard } from '../src/board.ts';
import { boardCanvas, canvasBoard, CANVAS_LIMITS } from '../src/board-canvas.ts';

const CANVAS = {
  nodes: [
    { id: 'g1', type: 'group', x: -20, y: -20, width: 700, height: 400, label: 'Trip' },
    {
      id: '0a1b2c3d',
      type: 'text',
      x: 0,
      y: 0,
      width: 250,
      height: 120,
      text: "Go by train\nIt's **slow**.",
      color: '4',
    },
    { id: 'pic', type: 'file', x: 300, y: 0, width: 200, height: 150, file: 'Trip/map.png' },
    { id: 'doc', type: 'file', x: 300, y: 200, width: 200, height: 60, file: 'Trip/Plan.md', subpath: '#Day 1' },
    { id: 'web', type: 'link', x: 0, y: 200, width: 200, height: 60, url: 'https://example.org/rail' },
  ],
  edges: [
    { id: 'e1', fromNode: '0a1b2c3d', toNode: 'pic', label: 'see' },
    { id: 'e2', fromNode: 'doc', toNode: 'web', fromEnd: 'arrow', toEnd: 'none' },
  ],
};
const read = (canvas, name = 'trip') => canvasBoard(JSON.stringify(canvas), name);

describe('board_canvas', () => {
  // proves: board_exchange
  test('reads each kind of node as a board item, and each edge as a connector', () => {
    const got = read(CANVAS);
    assert.deepEqual(got.notes, []);
    assert.equal(got.board.name, 'trip');
    assert.equal(got.board.on, null);
    assert.deepEqual(got.board.items, [
      { id: 'g1', kind: 'Frame', x: -20, y: -20, w: 700, h: 400, text: 'Trip', more: {} },
      {
        id: 'n_0a1b2c3d',
        kind: 'Card',
        x: 0,
        y: 0,
        w: 250,
        h: 120,
        text: 'Go by train',
        style: 'green',
        more: { body: "It's **slow**." },
      },
      { id: 'pic', kind: 'Image', x: 300, y: 0, w: 200, h: 150, more: { src: 'Trip/map.png', alt: 'map' } },
      {
        id: 'doc',
        kind: 'Card',
        x: 300,
        y: 200,
        w: 200,
        h: 60,
        text: 'Plan',
        more: { attachments: 'Trip/Plan.md#Day 1' },
      },
      {
        id: 'web',
        kind: 'Card',
        x: 0,
        y: 200,
        w: 200,
        h: 60,
        text: 'example.org',
        more: { links: 'https://example.org/rail' },
      },
    ]);
    // an edge with its arrow at the start runs the other way
    assert.deepEqual(got.board.connectors, [
      { from: 'n_0a1b2c3d', to: 'pic', label: 'see' },
      { from: 'web', to: 'doc' },
    ]);
  });

  // proves: board_exchange
  test('the board it reads is written as a block the board reader reads with no problem', () => {
    const { board } = read(CANVAS);
    const again = readBoard(writeBoard(board));
    assert.deepEqual(again.problems, []);
    assert.deepEqual(again.board, board);
  });

  // proves: board_exchange
  test('round trips: a canvas read and written again holds the same nodes and edges', () => {
    const out = JSON.parse(boardCanvas(read(CANVAS).board).json);
    assert.deepEqual(out.nodes, CANVAS.nodes);
    assert.deepEqual(
      out.edges,
      [
        { id: '0a1b2c3d-pic', fromNode: '0a1b2c3d', toNode: 'pic', label: 'see' },
        { id: 'web-doc', fromNode: 'web', toNode: 'doc' },
      ],
      'an edge is named after its two ends, and the arrow at the start is written as an edge the other way',
    );
  });

  // proves: board_exchange
  test('writes a board of our own: stickies and cards as text, a frame as a group', () => {
    const { board } = readBoard(`// graph: ideas · BOARD ON trip
(a:Sticky {x: 0, y: 0, text: 'Go by train', style: 'red'}),
(b:Card {x: 300, y: 0, w: 200, h: 100, text: 'Paris', body: 'Two days', links: 'https://a.example; https://b.example'}),
(f:Frame {x: -10, y: -10, w: 600, h: 300, text: 'Week 1'}),
(v:View {x: 0, y: 400, view: 'matrix'}),
(i:Ink {x: 0, y: 800, points: '0,0 4,4'}),
(a)-[:CONNECTS {label: 'to'}]->(b)`);
    const { json, notes } = boardCanvas(board);
    assert.deepEqual(JSON.parse(json), {
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 160, height: 160, text: 'Go by train', color: '1' },
        {
          id: 'b',
          type: 'text',
          x: 300,
          y: 0,
          width: 200,
          height: 100,
          text: 'Paris\nTwo days\n\nhttps://a.example\nhttps://b.example',
        },
        { id: 'f', type: 'group', x: -10, y: -10, width: 600, height: 300, label: 'Week 1' },
      ],
      edges: [{ id: 'a-b', fromNode: 'a', toNode: 'b', label: 'to' }],
    });
    assert.equal(notes.length, 1, 'one sentence names what JSON Canvas cannot hold');
    assert.match(notes[0], /2 items/);
    assert.match(json, /^\{\n\t"nodes"/, 'written with tabs, as Obsidian writes it');
  });

  // proves: board_exchange
  test('skips what it cannot read, and says so in plain sentences', () => {
    const got = read({
      nodes: [
        { id: 'a', type: 'text', x: 0.4, y: 0.6, width: 100, height: 50, text: 'A', color: '#ff0000' },
        { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'twice' },
        { id: 'b', type: 'hologram', x: 0, y: 0, width: 100, height: 50 },
        { id: 'c', type: 'text', x: 'left', y: 0, width: 100, height: 50, text: 'C' },
        { id: 'd-1', type: 'group', x: 0, y: 0, width: 100, height: 50, background: 'bg.png' },
        'junk',
      ],
      edges: [
        { id: 'e1', fromNode: 'a', toNode: 'gone' },
        { id: 'e2', fromNode: 'a', toNode: 'd-1', color: '2', fromSide: 'top' },
        { id: 'e3', fromNode: 'a', toNode: 'd-1' },
      ],
    });
    assert.deepEqual(
      got.board.items.map((i) => [i.id, i.x, i.y, i.style]),
      [
        ['a', 0, 1, undefined],
        ['d_1', 0, 0, undefined],
      ],
    );
    assert.deepEqual(got.board.connectors, [{ from: 'a', to: 'd_1' }]);
    assert.equal(got.notes.length, 3);
    assert.match(got.notes[0], /4 items/, 'the same name twice, an unknown type, a place that is no number, and junk');
    assert.match(got.notes[1], /2 lines/, 'an edge to nothing, and the same edge twice');
    assert.match(got.notes[2], /colour/i, 'a colour of its own and a background picture are not kept');
    for (const note of got.notes) assert.match(note, /\.$/, 'each is a whole sentence');
  });

  // proves: board_exchange
  test('refuses what is not a canvas, or is over the limits, with a sentence', () => {
    for (const bad of ['', 'not json', '[]', '"text"', '{"nodes": 3}', '{"nodes": [], "edges": {}}']) {
      const got = canvasBoard(bad, 'x');
      assert.equal(got.why, 'not-canvas', bad);
      assert.match(got.refused, /JSON Canvas/);
    }
    assert.equal(canvasBoard('{}', 'x').board.items.length, 0, 'an empty canvas is an empty board');
    const many = {
      nodes: Array.from({ length: 4 }, (_, i) => ({ id: `n${i}`, type: 'text', x: i, y: 0, width: 1, height: 1 })),
    };
    assert.equal(canvasBoard(JSON.stringify(many), 'x', { ...CANVAS_LIMITS, items: 3 }).why, 'too-many');
    assert.equal(canvasBoard(JSON.stringify(many), 'x', { ...CANVAS_LIMITS, chars: 10 }).why, 'too-large');
    const long = { nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1, text: 'x'.repeat(50) }] };
    assert.equal(canvasBoard(JSON.stringify(long), 'x', { ...CANVAS_LIMITS, text: 40 }).why, 'text-too-long');
  });
});
