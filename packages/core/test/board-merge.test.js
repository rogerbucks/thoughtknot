// Merging two versions of a board edited apart (editor spec §45, board_offline_merge). A change only one side made is
// taken. A clash keeps both sides and is flagged, so neither is silently picked.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { CLASH, mergeBoards } from '../src/board-merge.ts';

const BASE = `// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'One'}),
(b:Sticky {x: 200, y: 0, text: 'Two'})`;
const edit = (text, change) => boardEdit(text, change).text;
const items = (text) => readBoard(text).board.items;

describe('merging boards', () => {
  test('takes a change only one side made, and both sides’ changes to different things', () => {
    const ours = edit(BASE, { kind: 'text', id: 'a', text: 'Mine' });
    const theirs = edit(BASE, { kind: 'text', id: 'b', text: 'Theirs' });
    const merged = mergeBoards(BASE, ours, theirs);
    assert.equal(merged.clashes.length, 0);
    assert.deepEqual(items(merged.text).map((i) => i.text), ['Mine', 'Theirs']);
  });

  test('keeps both sides of a clash and flags it', () => {
    const ours = edit(BASE, { kind: 'text', id: 'a', text: 'Mine' });
    const theirs = edit(BASE, { kind: 'text', id: 'a', text: 'Theirs' });
    const merged = mergeBoards(BASE, ours, theirs);
    assert.equal(merged.clashes.length, 1);
    const texts = items(merged.text).map((i) => i.text);
    assert.ok(texts.includes('Mine') && texts.includes('Theirs'));
    assert.ok(items(merged.text).some((i) => i.more[CLASH] !== undefined));
  });
});
