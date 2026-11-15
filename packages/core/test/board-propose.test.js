// A whole board proposed (editor spec §45, board_proposed). It comes from a graph, or from an AI asked in plain words.
// Every item cites what it came from, and an answer with an item that cites nothing is refused whole.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readBoard } from '../src/board.ts';
import { boardNames } from '../src/board-list.ts';
import { itemBox } from '../src/board-svg.ts';
import {
  boardDraftIn,
  boardFromGraph,
  boardMakeAsk,
  boardMakeInstructions,
  withBoardKept,
} from '../src/view-types/board-propose.ts';

const NOTE = [
  '# Team',
  '```gql',
  '// graph: team',
  "(ann:Person {name: 'Ann'}), (bob:Person {name: 'Bob'}), (acme:Company {name: 'Acme'}),",
  '(ann)-[:KNOWS]->(bob), (ann)-[:WORKS_AT]->(acme)',
  '```',
  '',
].join('\n');
const SENT = ['ann', 'bob', 'acme'];
const free = (name) => name;
const apart = (text) => {
  const boxes = readBoard(text)
    .board.items.filter((i) => i.kind !== 'Frame')
    .map(itemBox);
  return boxes.every((a, i) =>
    boxes.every((b, j) => i === j || a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y),
  );
};

// proves: board_proposed
test('a board from a graph holds the views that suit it and a note of what was counted, each citing the graph', () => {
  const d = boardFromGraph(NOTE, 'team');
  assert.equal(d.name, 'team_views');
  assert.equal(d.on, 'team');
  const { board, problems } = readBoard(d.text);
  assert.deepEqual(problems, []);
  assert.deepEqual(
    board.items.filter((i) => i.kind === 'View').map((i) => i.more.view),
    ['force', 'matrix', 'treemap'],
  );
  assert.match(board.items.find((i) => i.kind === 'Sticky').text, /3 things and 2 links, of kinds Company, Person/);
  assert.equal(d.cites.length, 4);
  assert.ok(d.cites.every((c) => /graph team/.test(c.said)));
  assert.ok(board.items.filter((i) => i.kind !== 'Frame').every((i) => /graph team/.test(i.more.cites)));
  assert.ok(apart(d.text), 'no item covers another');
  assert.match(boardFromGraph(NOTE, 'nowhere').refused, /nowhere/);
});

// proves: board_proposed
test('an answer is read as views and notes that rest on things sent, placed by the editor', () => {
  const answer = JSON.stringify({
    board: {
      name: 'who_knows',
      items: [
        { view: 'matrix', frame: 'Who knows whom', reason: 'shows each pair', read: ['ann', 'bob'], x: 9999 },
        { note: 'Ann links the two.', frame: 'Who knows whom', reason: 'two links from ann', read: ['ann'] },
        { view: 'ego', reason: 'round ann', read: ['ann'] },
      ],
    },
  });
  const r = boardDraftIn(`Here you are:\n${answer}`, SENT, 'team', free);
  const { board, problems } = readBoard(r.board.text);
  assert.deepEqual(problems, []);
  assert.equal(r.board.name, 'who_knows');
  assert.deepEqual(
    board.items.map((i) => i.kind),
    ['View', 'Frame', 'View', 'Sticky'],
  );
  assert.equal(board.items.find((i) => i.kind === 'Frame').text, 'Who knows whom');
  assert.ok(apart(r.board.text), 'the editor places the items: a place in the answer is not taken');
  assert.match(r.board.cites[1].said, /Read ann, bob: shows each pair/);
});

// proves: board_proposed
test('an answer with an item that cites nothing, or a thing not sent, is refused whole', () => {
  const one = (item) => boardDraftIn(JSON.stringify({ board: { items: [item] } }), SENT, 'team', free);
  assert.match(one({ view: 'matrix', reason: 'because' }).unread, /does not say what it read/);
  assert.match(one({ view: 'matrix', read: [] }).unread, /does not say what it read/);
  assert.match(one({ note: 'Cat runs it all.', read: ['cat'] }).unread, /not sent/);
  assert.match(one({ view: 'sideways', read: ['ann'] }).unread, /names a view/);
  assert.match(one({ view: 'matrix', note: 'both', read: ['ann'] }).unread, /not one view or one note/);
  assert.match(boardDraftIn('{"board": {"items": []}}', SENT, 'team', free).unread, /no board/);
  assert.match(boardDraftIn('{"board": {"items": [1]}, "also": 1}', SENT, 'team', free).unread, /no board/);
  assert.match(boardDraftIn('no json here', SENT, 'team', free).unread, /./);
});

// proves: board_proposed
test('nothing is asked without the person’s words, and a kept board is written at the end under a free name', () => {
  const base = { note: NOTE, notePath: 'Team.md', settings: {}, model: 'm', level: null };
  assert.match(boardMakeAsk(base, 'team', '  ').refused, /nothing is sent unasked/);
  const ask = boardMakeAsk(base, 'team', 'who knows whom?');
  assert.deepEqual(ask.choice, { graph: 'team', what: 'graph' });
  assert.equal(ask.answers.instructions, boardMakeInstructions());
  assert.match(ask.answers.read('{"board": {"items": [{"view": "force", "read": ["ann"]}]}}', SENT).board.name, /team/);
  const d = boardFromGraph(NOTE, 'team');
  const kept = withBoardKept(NOTE, d);
  assert.ok(kept.note.startsWith(NOTE.trimEnd()), 'every byte before it is kept');
  assert.deepEqual(boardNames(kept.note), ['team_views']);
  assert.equal(withBoardKept(kept.note, d).name, 'team_views_2', 'kept twice, it takes a free name');
});
