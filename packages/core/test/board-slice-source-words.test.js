// The words of the whiteboard's slice (editor spec §45). Each key is lower-case and dotted. Each wording is said in
// plain words. What a wording asks for, such as {count} or {how}, is what the code gives it.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_SLICE_SOURCE_WORDS as WORDS } from '../src/board-slice-source-words.ts';

describe('the whiteboard words', () => {
  // proves: board_arranged_by_graph
  test('every key is lower-case and dotted, and every wording is a sentence or a name', () => {
    for (const [key, said] of Object.entries(WORDS)) {
      assert.match(key, /^[a-z0-9-]+(\.[a-z0-9-]+)+$/, key);
      assert.ok(said.trim().length > 1 && !said.includes('  '), `${key} is worded`);
    }
  });

  test('the arrange words are all there, and the ones that count or name a shape ask for it', () => {
    for (const how of ['grid', 'tree', 'flow', 'cluster']) assert.ok(WORDS[`board.arrange.how.${how}`], how);
    assert.match(WORDS['board.arrange.done-as'], /\{count\}.*\{how\}/);
    assert.match(WORDS['board.arrange.selected'], /\{count\}/);
    assert.match(WORDS['board.arrange.undone'], /\{count\}/);
    for (const key of ['button', 'tip', 'undo', 'already']) assert.ok(WORDS[`board.arrange.${key}`], key);
  });
});
