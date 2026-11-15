// Graph views kept on a board (editor spec ES§45, board_view_items). A View item shows a graph of the note, drawn live
// by a view type, the board's own graph unless it names another. It moves nothing, and says why when it cannot draw.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardSvg } from '../src/board-svg.ts';
import { PALETTES } from '../src/palette.ts';
import { drawBoardView, viewerOf, viewGraphOf, viewTypeOf } from '../src/view-types/board-views.ts';

const BOARD = `// graph: ideas · BOARD ON trip
(v:View {x: 0, y: 0, w: 400, h: 300}),
(m:View {x: 500, y: 0, view: 'matrix', of: 'people'}),
(odd:View {x: 0, y: 400, view: 'sideways'})`;
const NOTE = [
  '```gql',
  '// graph: trip',
  '(paris:City), (lyon:City), (paris)-[:ROAD]->(lyon)',
  '```',
  '```gql',
  '// graph: people',
  '(ann:Person), (bo:Person), (ann)-[:KNOWS]->(bo)',
  '```',
  '```gql',
  BOARD,
  '```',
].join('\n');
const board = readBoard(BOARD).board;

describe('a view on a board', () => {
  // proves: board_view_items
  test('shows the board’s own graph by force unless it names a view type and a graph', () => {
    const [v, m, odd] = board.items;
    assert.deepEqual([viewTypeOf(v), viewGraphOf(board, v)], ['force', 'trip']);
    assert.deepEqual([viewTypeOf(m), viewGraphOf(board, m)], ['matrix', 'people']);
    assert.equal(viewTypeOf(odd), 'force', 'a view type that is not one is drawn by force');
  });

  // proves: board_view_items
  test('is drawn live from the note, its own size, with the graph’s things in it', async () => {
    const r = await drawBoardView(NOTE, board, 'v');
    assert.ok('svg' in r, JSON.stringify(r));
    assert.match(r.svg, /^<svg/);
    assert.match(r.svg, /paris/);
    assert.match(r.svg, /lyon/);
    const m = await drawBoardView(NOTE, board, 'm');
    assert.ok('svg' in m && /ann/.test(m.svg) && !/paris/.test(m.svg), 'the graph it names');
    const later = NOTE.replace('(paris:City), ', '(paris:City), (nice:City), ');
    const again = await viewerOf(() => later)(board, 'v');
    assert.ok('svg' in again && /nice/.test(again.svg), 'drawn afresh from the note as it is now');
  });

  // proves: board_view_items
  test('says why when it cannot be drawn: no graph, an empty graph, or gone', async () => {
    const free = readBoard('// graph: ideas · BOARD\n(v:View {x: 0, y: 0})').board;
    assert.match((await drawBoardView(NOTE, free, 'v')).refused, /not on a graph/);
    const empty = readBoard(`// graph: ideas · BOARD ON nowhere\n(v:View {x: 0, y: 0})`).board;
    assert.match((await drawBoardView(NOTE, empty, 'v')).refused, /nowhere/);
    assert.ok('refused' in (await drawBoardView(NOTE, board, 'gone')));
  });

  // proves: board_view_items
  test('is drawn by the board as a frame named by its view and graph, with a place for the picture', () => {
    const svg = boardSvg(board, PALETTES.light);
    assert.match(svg, /data-item="v" data-view="v"/);
    assert.match(svg, /force view of trip/);
    assert.match(svg, /matrix view of people/);
  });
});
