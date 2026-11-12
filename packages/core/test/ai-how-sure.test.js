// Every AI suggestion says in words how sure it is and what it rests on. That is editor spec §74,
// ai_says_how_sure, and ethos rule r_how_sure. An edit or a suggestion without a certainty word, or without what it rests on, is refused with its whole
// answer. The words are the likelihood words a claim in a graph uses (graph spec §20, certainty_in_words).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { CERTAINTY_WORDS } from '../src/ai-how-sure.ts';
import { INSTRUCTIONS, changesIn } from '../src/ai-request.ts';
import { suggestInstructions, suggestionsIn } from '../src/ai-suggestions.ts';

const { RANGE } = createRequire(import.meta.url)('../../graph-spec/src/rules/certainty.js');
const edit = (c) => changesIn(JSON.stringify({ changes: [c] }));
const open = { things: ['login', 'docs'], now: () => undefined, linked: () => false };
const suggest = (s) =>
  suggestionsIn(JSON.stringify({ suggestions: [s] }), { kind: 'value', key: 'category' }, open, ['login', 'docs']);

describe('every AI suggestion says how sure it is and what it rests on (ai_says_how_sure)', () => {
  test('the words are the likelihood words of a claim in a graph, least likely first', () => {
    assert.deepEqual(
      [...CERTAINTY_WORDS],
      Object.keys(RANGE).filter((w) => w !== 'cannot-judge'),
    );
  });

  test('an edit says how sure it is and why, and the review shows both in words', () => {
    const [c] = edit({ op: 'remove-thing', thing: 'docs', certainty: 'very-likely', reason: 'no longer used' });
    assert.equal(c.reason, 'very likely (80–95%): no longer used');
  });

  test('an edit without a certainty word, with a made-up one, or without a reason is refused whole', () => {
    assert.match(edit({ op: 'remove-thing', thing: 'docs', reason: 'old' }).unread, /change 1 does not say how sure/);
    assert.match(edit({ op: 'remove-thing', thing: 'docs', certainty: '90%', reason: 'old' }).unread, /how sure/);
    assert.match(edit({ op: 'remove-thing', thing: 'docs', certainty: 'likely' }).unread, /what it rests on/);
    assert.match(edit({ op: 'remove-thing', thing: 'docs', certainty: 'likely', reason: '  ' }).unread, /rests on/);
    const two = changesIn(
      JSON.stringify({
        changes: [
          { op: 'remove-thing', thing: 'docs', certainty: 'likely', reason: 'old' },
          { op: 'remove-thing', thing: 'login' },
        ],
      }),
    );
    assert.match(two.unread, /change 2/);
  });

  test('a suggestion without a certainty word, or naming nothing it read and giving no reason, is refused', () => {
    assert.match(suggest({ thing: 'login', value: 'bug', read: ['login'] }).unread, /no certainty word/);
    assert.match(suggest({ thing: 'login', value: 'bug', certainty: 'likely' }).unread, /what it rests on/);
    assert.ok(Array.isArray(suggest({ thing: 'login', value: 'bug', certainty: 'likely', read: ['login'] })));
    assert.ok(Array.isArray(suggest({ thing: 'login', value: 'bug', certainty: 'likely', reason: 'a broken page' })));
  });

  test('the model is told the same words, for edits and for suggestions', () => {
    for (const told of [INSTRUCTIONS, suggestInstructions({ kind: 'value', key: 'category' })])
      assert.ok(told.includes(CERTAINTY_WORDS.join(', ')), told);
    assert.match(INSTRUCTIONS, /"reason" is what it rests on/);
  });
});
