// The boards of a note as a list (editor spec §45, board_many). They are named, added, renamed, copied and removed.
// Each is a change to that board's block alone.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  boardAdded,
  boardCopied,
  boardListChanged,
  boardNames,
  boardRemoved,
  boardRenamed,
} from '../src/board-list.ts';

const NOTE = [
  '# Trip',
  '',
  '```gql',
  '// graph: trip',
  "(a:Place {name: 'Rome'})",
  '```',
  '',
  '```gql',
  '// graph: ideas · BOARD ON trip',
  "(n1:Sticky {x: 0, y: 0, text: 'Go'})",
  '```',
  '',
  'Some words after.',
  '',
  '```gql',
  '// graph: plan · BOARD',
  "(n1:Sticky {x: 5, y: 5, text: 'Book'})",
  '```',
  '',
].join('\n');

// proves: board_many
test('the boards of a note are named in the order written, and its graphs are not among them', () => {
  assert.deepEqual(boardNames(NOTE), ['ideas', 'plan']);
  assert.deepEqual(boardNames('# No boards\n'), []);
});

// proves: board_many
test('a new board is written at the end, empty, on the graph asked for, under a name nothing has', () => {
  const one = boardAdded(NOTE, 'trip');
  assert.equal(one.name, 'board');
  assert.ok(one.note.startsWith(NOTE.trimEnd()), 'every byte before it is kept');
  assert.ok(one.note.endsWith('```gql\n// graph: board · BOARD ON trip\n```\n'));
  const two = boardAdded(one.note, null);
  assert.equal(two.name, 'board_2');
  assert.ok(two.note.endsWith('```gql\n// graph: board_2 · BOARD\n```\n'));
  assert.deepEqual(boardNames(two.note), ['ideas', 'plan', 'board', 'board_2']);
});

// proves: board_many
test('a board is renamed in its own line only, and a name taken or not a name is refused', () => {
  const r = boardRenamed(NOTE, 'ideas', 'sparks');
  assert.equal(r.name, 'sparks');
  assert.equal(r.note, NOTE.replace('// graph: ideas · BOARD ON trip', '// graph: sparks · BOARD ON trip'));
  assert.match(boardRenamed(NOTE, 'ideas', 'plan').refused, /plan/);
  assert.match(boardRenamed(NOTE, 'ideas', 'trip').refused, /trip/, 'a graph has the name');
  assert.match(boardRenamed(NOTE, 'ideas', 'two words').refused, /two words/);
  assert.match(boardRenamed(NOTE, 'gone', 'x').refused, /gone/);
  assert.equal(boardRenamed(NOTE, 'ideas', 'ideas').note, NOTE, 'the same name changes nothing');
});

// proves: board_many
test('a copy holds the same items under a free name, at the end, and the board copied is untouched', () => {
  const r = boardCopied(NOTE, 'ideas');
  assert.equal(r.name, 'ideas_copy');
  assert.ok(r.note.startsWith(NOTE.trimEnd()));
  assert.ok(
    r.note.endsWith("```gql\n// graph: ideas_copy · BOARD ON trip\n(n1:Sticky {x: 0, y: 0, text: 'Go'})\n```\n"),
  );
  assert.equal(boardCopied(r.note, 'ideas').name, 'ideas_copy_2');
});

// proves: board_many
test('a removed board takes its block alone, leaves no gap, and the board before it comes in front', () => {
  const r = boardRemoved(NOTE, 'plan');
  assert.equal(r.name, 'ideas');
  assert.deepEqual(boardNames(r.note), ['ideas']);
  assert.ok(r.note.endsWith('Some words after.\n\n'));
  const first = boardRemoved(NOTE, 'ideas');
  assert.equal(first.name, 'plan');
  assert.ok(first.note.includes("(a:Place {name: 'Rome'})\n```\n\nSome words after."), 'one blank line is left');
  assert.equal(boardRemoved(first.note, 'plan').name, null, 'no board is left');
  assert.match(boardRemoved(NOTE, 'gone').refused, /gone/);
});

// proves: board_nested
test('a new board inside this one is made at the end, with a view of it on this board in free room', () => {
  const r = boardListChanged(NOTE, 'ideas', { kind: 'nest' });
  assert.equal(r.name, 'ideas', 'the board in front stays in front');
  assert.deepEqual(boardNames(r.note), ['ideas', 'plan', 'board']);
  assert.match(r.note, /\(view1:View \{x: \d+, y: \d+, board: 'board'\}\)/);
  assert.ok(r.note.endsWith('```gql\n// graph: board · BOARD ON trip\n```\n'), 'on the same graph');
  assert.match(boardListChanged(NOTE, 'gone', { kind: 'nest' }).refused, /gone/);
});
