// The words of the whiteboard's slice (editor spec §45). Each key is lower-case and dotted. Each wording is said in
// plain words. What a wording asks for, such as {count} or {how}, is what the code gives it.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_SLICE_SOURCE_WORDS as WORDS } from '../src/board-slice-source-words.ts';
import { word } from '../src/words.ts';

describe('the whiteboard words', () => {
  // proves: board_arranged_by_graph
  test('every key is lower-case and dotted, and every wording is a sentence or a name', () => {
    for (const [key, said] of Object.entries(WORDS)) {
      assert.match(key, /^[a-z0-9-]+(\.[a-z0-9-]+)+$/, key);
      for (const form of typeof said === 'string' ? [said] : Object.values(said))
        assert.ok(form.trim().length > 1 && !form.includes('  '), `${key} is worded`);
    }
  });

  test('the arrange words are all there, and the ones that count or name a shape ask for it', () => {
    for (const how of ['grid', 'tree', 'flow', 'cluster']) assert.ok(WORDS[`board.arrange.how.${how}`], how);
    assert.match(WORDS['board.arrange.done-as'].other, /\{count\}.*\{how\}/);
    assert.match(WORDS['board.arrange.selected'], /\{count\}/);
    assert.match(WORDS['board.arrange.undone'].other, /\{count\}/);
    for (const key of ['button', 'tip', 'undo', 'already']) assert.ok(WORDS[`board.arrange.${key}`], key);
  });

  test('one item arranged or put back is said as one item, not "1 items"', () => {
    assert.equal(word('board.arrange.done', { count: 1 }), 'Arranged 1 item by the graph.');
    assert.equal(word('board.arrange.done-as', { count: 1, how: 'grid' }), 'Arranged 1 item as a grid.');
    assert.equal(word('board.arrange.undone', { count: 1 }), 'Put 1 item back where it was.');
    assert.equal(word('board.arrange.undone', { count: 3 }), 'Put 3 items back where they were.');
  });
});
