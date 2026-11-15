// A whiteboard file brought into a note as a board block, and a note's boards written out as files (editor spec
// ES§45, board_exchange). The file's ending says which reader or writer is used.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardFileBlock, boardFilesOf, boardFormatOf } from '../src/board-exchange.ts';

const CANVAS = JSON.stringify({
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'Go by train' },
    { id: 'b', type: 'hologram', x: 0, y: 0, width: 1, height: 1 },
  ],
  edges: [],
});
const DRAWING = JSON.stringify({
  type: 'excalidraw',
  elements: [{ id: 'r', type: 'rectangle', x: 0, y: 0, width: 100, height: 50 }],
});
const NOTE = `# Trip

\`\`\`gql
// graph: trip
(ann:Person)
\`\`\`

\`\`\`gql
// graph: ideas · BOARD ON trip
(a:Sticky {x: 0, y: 0, text: 'Go by train'}),
(v:View {x: 0, y: 400})
\`\`\`

\`\`\`gql
// graph: plan · BOARD
(t:Text {x: 0, y: 0, text: 'Book'})
\`\`\`
`;

describe('board_exchange', () => {
  // proves: board_exchange
  test('the ending of a file says which whiteboard format it holds', () => {
    assert.equal(boardFormatOf('Trip/Ideas.canvas'), 'canvas');
    assert.equal(boardFormatOf('Trip/Ideas.EXCALIDRAW'), 'excalidraw');
    assert.equal(boardFormatOf('Trip/Ideas.excalidraw.md'), 'excalidraw');
    assert.equal(boardFormatOf('Trip/Ideas.md'), null);
    assert.equal(boardFormatOf('Trip/canvas'), null);
  });

  // proves: board_exchange
  test('a file becomes a fenced board block for the note, with what was left out said', () => {
    const made = boardFileBlock('ideas', 'Trip/Ideas.canvas', CANVAS);
    assert.equal(
      made.block,
      "```gql\n// graph: ideas · BOARD\n(a:Card {x: 0, y: 0, w: 200, h: 100, text: 'Go by train'})\n```",
    );
    assert.equal(made.notes.length, 1);
    const drawn = boardFileBlock('sketch', 'Trip/Sketch.excalidraw', DRAWING);
    assert.match(drawn.block, /^```gql\n\/\/ graph: sketch · BOARD\n\(r:Shape \{/);
    assert.deepEqual(drawn.notes, []);
  });

  // proves: board_exchange
  test('a name that is no name, a file of no known ending and a file that cannot be read are refused', () => {
    assert.match(boardFileBlock('my ideas', 'Ideas.canvas', CANVAS).refused, /my ideas/);
    assert.match(boardFileBlock('ideas', 'Ideas.txt', CANVAS).refused, /Ideas\.txt/);
    assert.match(boardFileBlock('ideas', 'Ideas.canvas', 'nonsense').refused, /JSON Canvas/);
    assert.match(boardFileBlock('ideas', 'Ideas.excalidraw', CANVAS).refused, /Excalidraw/);
  });

  // proves: board_exchange
  test('each board of a note is written as a file of the format asked for, named after the board', () => {
    const files = boardFilesOf(NOTE, 'canvas');
    assert.deepEqual(
      files.map((f) => f.name),
      ['ideas.canvas', 'plan.canvas'],
    );
    assert.equal(JSON.parse(files[0].text).nodes.length, 1);
    assert.equal(files[0].notes.length, 1, 'the view of a graph is left out, and said');
    assert.deepEqual(files[1].notes, []);
    const drawings = boardFilesOf(NOTE, 'excalidraw');
    assert.deepEqual(
      drawings.map((f) => f.name),
      ['ideas.excalidraw', 'plan.excalidraw'],
    );
    assert.equal(JSON.parse(drawings[1].text).type, 'excalidraw');
    assert.deepEqual(boardFilesOf('# No board here\n', 'canvas'), []);
  });

  // proves: board_exchange
  test('a board written out and brought back in holds the same words in the same places', () => {
    const [file] = boardFilesOf(NOTE, 'canvas');
    const back = boardFileBlock('again', file.name, file.text);
    const { board, problems } = readBoard(back.block.split('\n').slice(1, -1).join('\n'));
    assert.deepEqual(problems, []);
    assert.deepEqual(
      board.items.map((i) => [i.x, i.y, i.text]),
      [[0, 0, 'Go by train']],
    );
  });
});
