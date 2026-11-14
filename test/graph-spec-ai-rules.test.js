// The graph spec's rules for AI change sets agree (editor spec §51, spec_ai_rules_agree). One rule says what a change
// set may remove. Who proposed it is stated in one place. That a proposal and its accepting decision each record the
// proposer once is proved in packages/core/test/proposals-judgement-attributed.test.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SPEC = readFileSync(new URL('../requirements/graph-spec.gql', import.meta.url), 'utf8');
/** Each graph-spec rule as [id, statement]. */
const rules = [...SPEC.matchAll(/:Requirement \{id: 'req:([^']+)'[^}]*?statement: '((?:[^'\\]|\\.)*)'/g)].map((m) => [
  m[1],
  m[2],
]);

describe('spec_ai_rules_agree: the rules for AI change sets do not disagree', () => {
  test('one rule says what a change set may remove', () => {
    assert.ok(rules.length > 200, `${rules.length} rules read`);
    const says = rules
      .filter(([, text]) => /\bchange sets?\b[^.]*\b(may|never) (remove|add)/i.test(text))
      .map(([id]) => id);
    assert.deepEqual(says, ['24.cs-adds']);
    const [, text] = rules.find(([id]) => id === '24.cs-adds');
    assert.match(text, /never removes or changes a record or a cache/);
    assert.match(text, /may remove or change any other thing or link/);
  });

  test('no other rule lets a change set remove a record or a cache, or forbids removing any other thing', () => {
    const others = rules.filter(([id, text]) => id !== '24.cs-adds' && /\bchange sets?\b[^.]*\bremov/i.test(text));
    for (const [id, text] of others) {
      assert.doesNotMatch(text, /(never|not) remov\w* (any|a|an) (thing|link)\b/i, `${id} forbids removing a thing`);
      assert.doesNotMatch(
        text,
        /may remove (a|any) (record|cache)/i,
        `${id} lets a change set remove a record or cache`,
      );
    }
  });

  test('who proposed a thing is stated once, in the change-set header', () => {
    const says = rules.filter(([, text]) => /who proposed/i.test(text));
    assert.ok(says.length >= 1);
    for (const [id, text] of says) assert.match(text, /change-set header/, `${id} says where the proposer is kept`);
    // and no rule keeps the proposer anywhere else
    const elsewhere = rules.filter(([, text]) => /proposed_by|proposer/i.test(text) && !/change-set header/.test(text));
    assert.deepEqual(
      elsewhere.map(([id]) => id),
      [],
    );
  });
});
