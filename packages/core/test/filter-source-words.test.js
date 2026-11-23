// The words of the Filter panel, its queries asked in words and those saved by name (editor spec ES§25 and ES§75).
// Each key is lower-case and dotted. What a wording asks for, such as {name}, is what the code gives it.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { FILTER_SOURCE_WORDS as WORDS } from '../src/filter-source-words.ts';

describe('the words of the Filter panel', () => {
  // proves: untangle_ask_filter
  test('every key is a filter key, lower-case and dotted, and every wording is a sentence or a name', () => {
    for (const [key, said] of Object.entries(WORDS)) {
      assert.match(key, /^filter(\.[a-z0-9-]+)+$/, key);
      // a word that counts has a form for one and a form for many
      for (const form of typeof said === 'string' ? [said] : Object.values(said))
        assert.ok(form.trim().length > 1 && !form.includes('  '), `${key} is worded`);
    }
  });

  // proves: ai_query_saved
  test('the words that act on a saved query name it, and a broken one says why', () => {
    for (const does of ['opened', 'done', 'renamed', 'removed', 'remove-ask', 'taken', 'parts', 'gone', 'unread'])
      assert.match(WORDS[`filter.saved-query.${does}`], /\{name\}/, does);
    assert.match(WORDS['filter.saved-query.gone'], /broken.*\{filter\}/);
  });

  // proves: ai_query_replay, ai_query_cache
  test('the words said when nothing is sent say so', () => {
    for (const key of ['filter.saved-query.opened', 'filter.replay.declined', 'filter.cache.reused'])
      assert.match(WORDS[key], /Nothing was sent\./, key);
    assert.match(WORDS['filter.replay.confirm'].other, /\{count\}.*in order.*\{prompts\}/);
  });

  // proves: ai_query_fuzzy, ai_query_stale
  test('words that fit no rule suggest a wording, and a stale rule names what is gone and offers Ask again', () => {
    assert.match(WORDS['filter.fuzzy.try'], /\{example\}.*\{properties\}/);
    assert.match(WORDS['filter.stale.kind'], /\{kind\}.*Ask again/);
    assert.match(WORDS['filter.stale.property'], /\{property\}.*Ask again/);
  });
});
