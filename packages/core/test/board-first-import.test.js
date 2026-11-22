// Starting a graph on a whiteboard by importing (editor spec ES§76, board_first_import). A JSON Canvas, an Excalidraw
// drawing or a deck (board_exchange), another note's graph as live cards (graph_on_board), or plain text through text
// to graph. Each lands in a frame of its own on clear space, and one undo takes the whole import away.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks } from '../src/blocks.ts';
import { boardOf, readBoard } from '../src/board.ts';
import { boardGraphAccepted, importOnBoard, openingBoard, undoImport } from '../src/board-first.ts';
import { liveCards } from '../src/board-live-cards.ts';
import { pptxBlock, pptxBoard } from '../src/board-pptx.ts';
import { itemBox } from '../src/board-svg.ts';
import { makeProposal, thingChange, linkChange } from '../src/proposals.ts';
import { readSource, sourceFor } from '../src/sources.ts';
import { basisOf } from '../src/proposals-basis.ts';
import { deck, sp } from './pptx-fixture.js';

const isBoard = (t) => !!boardOf(t);
const NOTE = '# Trip\n';
const WITH_STICKY = `# Trip

\`\`\`gql
// graph: ideas_board · BOARD
(s1:Sticky {x: 0, y: 0, w: 200, h: 120, text: 'Go by train'})
\`\`\`
`;
const CANVAS = JSON.stringify({
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'Pack' },
    { id: 'b', type: 'text', x: 300, y: 0, width: 200, height: 100, text: 'Leave' },
  ],
  edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }],
});
const DRAWING = JSON.stringify({
  type: 'excalidraw',
  elements: [{ id: 'r', type: 'rectangle', x: 0, y: 0, width: 100, height: 50 }],
});
const OTHER =
  "# People\n\n```gql\n// graph: people\n(dana:Guide {name: 'Dana'}),\n(sam:Driver {name: 'Sam'}),\n(dana)-[:KNOWS]->(sam)\n```\n";
const blockOf = (note) =>
  gqlBlocks(note)
    .map((b) => b.text)
    .find(isBoard);
const boardIn = (note) => readBoard(blockOf(note)).board;
const inside = (i, o) => {
  const [a, b] = [itemBox(i), itemBox(o)];
  return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
};
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The board a note opens on, as its block text. */
const opening = (note) => blockOf(note) ?? openingBoard(note, isBoard).text;

/** Checks a landed import: one frame holding all it brought, clear of what was there, and one undo back. */
function landed(note, made, count) {
  assert.ok(!('refused' in made), made.refused);
  const before = blockOf(note) ? boardIn(note).items : [];
  const after = boardIn(made.note);
  const added = after.items.filter((i) => !before.some((b) => b.id === i.id));
  // the frame of the import holds all it brought, a deck's own slide frames too
  const outer = added.filter(
    (i) => i.kind === 'Frame' && !added.some((o) => o !== i && o.kind === 'Frame' && inside(i, o)),
  );
  assert.equal(outer.length, 1, 'a frame of its own');
  const frame = itemBox(outer[0]);
  for (const i of added.filter((x) => x !== outer[0])) {
    const b = itemBox(i);
    assert.ok(
      b.x >= frame.x && b.y >= frame.y && b.x + b.w <= frame.x + frame.w && b.y + b.h <= frame.y + frame.h,
      i.id,
    );
  }
  assert.equal(added.length - 1, count);
  for (const was of before) assert.ok(!meets(itemBox(was), frame), 'on clear space');
  const undone = undoImport(made.note, made);
  assert.deepEqual(undone, { note: note }, 'one undo takes it all away');
  return after;
}

describe('board_first_import', () => {
  test('a JSON Canvas lands in its own frame, its connector kept, on an empty board and beside a sticky', () => {
    for (const note of [NOTE, WITH_STICKY]) {
      const made = importOnBoard(note, opening(note), { file: { path: 'Plans/route.canvas', text: CANVAS } });
      const b = landed(note, made, 2);
      assert.equal(b.connectors.length, 1);
      assert.match(made.said, /route\.canvas/);
    }
  });

  test('an Excalidraw drawing and a deck each land in a frame of their own', () => {
    landed(
      WITH_STICKY,
      importOnBoard(WITH_STICKY, opening(WITH_STICKY), { file: { path: 'a.excalidraw', text: DRAWING } }),
      1,
    );
    const read = pptxBoard(deck([{ shapes: [sp({ ph: { type: 'title' }, paras: ['Plan'] })] }]), 'deck', 'Talk.pptx');
    assert.ok(!('refused' in read), read.refused);
    const block = pptxBlock(read, new Map()).block.replace(/^```gql\n|\n```$/g, '');
    const board = readBoard(block).board;
    const made = importOnBoard(NOTE, opening(NOTE), { deck: { board, title: 'Talk.pptx', notes: [] } });
    landed(NOTE, made, board.items.length);
  });

  test('another note’s graph comes as live cards, read from that note and never copied', () => {
    const made = importOnBoard(WITH_STICKY, opening(WITH_STICKY), { graph: { link: 'People', note: OTHER } });
    const b = landed(WITH_STICKY, made, 2);
    assert.equal(b.on, 'people');
    assert.ok(made.note.includes('// graph: people · FROM [[People]]'));
    assert.ok(!made.note.includes("name: 'Dana'"), 'the things are not copied into the note');
    // with the source read where it is written, each card is live: it shows the thing as that note holds it now
    const texts = gqlBlocks(made.note).map((x) => x.text);
    const src = sourceFor(texts, 'people');
    const read = readSource(src, { found: 'People.md', text: OTHER.replace("'Dana'", "'Dana Lee'") });
    assert.ok(!('refused' in read), read.refused);
    const fence = (t) => `\`\`\`gql\n${t}\n\`\`\``;
    const cards = liveCards([...read.texts, blockOf(made.note)].map(fence).join('\n\n'), blockOf(made.note));
    assert.deepEqual(
      cards.map((c) => [c.thing, c.name]),
      [
        ['dana', 'Dana Lee'],
        ['sam', 'Sam'],
      ],
    );
    // a board on another graph, or a graph of the same name already here, is refused, changing nothing
    const on = WITH_STICKY.replace('ideas_board · BOARD', 'ideas_board · BOARD ON trip');
    assert.ok('refused' in importOnBoard(on, opening(on), { graph: { link: 'People', note: OTHER } }));
    assert.ok('refused' in importOnBoard(NOTE, opening(NOTE), { graph: { link: 'Nobody', note: '# Empty\n' } }));
  });

  test('plain text through text to graph lands in its own frame, and one undo takes it all away', () => {
    const proposal = makeProposal({
      id: 'text-graph',
      graph: 'ideas',
      by: { name: 'Local', kind: 'model' },
      basis: basisOf(WITH_STICKY, 'ideas'),
      changes: [
        thingChange('pack', 'Task', { name: 'Pack' }, {}),
        thingChange('leave', 'Task', { name: 'Leave' }, {}),
        linkChange('pack', 'BEFORE', 'leave', {}, {}),
      ],
    });
    assert.ok(!('refused' in proposal), proposal.refused);
    const made = boardGraphAccepted(WITH_STICKY, opening(WITH_STICKY), proposal);
    landed(WITH_STICKY, made, 2);
  });

  test('a file that is no whiteboard, or a damaged one, is refused with a sentence and changes nothing', () => {
    for (const file of [
      { path: 'notes.txt', text: 'hello' },
      { path: 'bad.canvas', text: 'not json' },
    ]) {
      const r = importOnBoard(NOTE, opening(NOTE), { file });
      assert.ok('refused' in r && r.refused.length > 0, file.path);
    }
  });
});
