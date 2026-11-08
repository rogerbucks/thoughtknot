// The graph spec holds a short glossary (editor spec §51, spec_glossary). Each term a newcomer would not know has one
// plain sentence in requirements/graph-spec-glossary.json. The file lists the rules that use the term, so a reader
// can follow the link both ways. This keeps that list exact. It also holds the glossary and the rules to the
// plain-language check. Sentences stay at 25 words or fewer, and filler words are out.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILLER, DOC_LIMITS, fillerIn } from '../scripts/plain-docs.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SPEC = read('../requirements/graph-spec.gql');
const GLOSSARY = JSON.parse(read('../requirements/graph-spec-glossary.json'));
const RULES = [...SPEC.matchAll(/:Requirement \{id: '([^']*)'[^\n]*?statement: '((?:[^'\\]|\\.)*)'/g)].map((m) => ({
  id: m[1],
  statement: m[2].replace(/\\'/g, "'"),
}));
const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;
const usedBy = (term) => {
  const rx = new RegExp(
    `(?<![\\w-])(?:${term.words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\w-])`,
    'i',
  );
  return RULES.filter((r) => rx.test(r.statement)).map((r) => r.id);
};

describe('spec_glossary', () => {
  test('the glossary is short, and each term has one plain sentence', () => {
    assert.ok(GLOSSARY.terms.length >= 20 && GLOSSARY.terms.length <= 60, `${GLOSSARY.terms.length} terms`);
    const names = GLOSSARY.terms.map((t) => t.term);
    assert.equal(new Set(names).size, names.length, 'no term twice');
    for (const t of GLOSSARY.terms) {
      for (const sentence of t.means.split(/(?<=[.!?])\s+/))
        assert.ok(wordCount(sentence) <= DOC_LIMITS.sentenceWords, `${t.term}: a sentence over 25 words`);
      assert.deepEqual(fillerIn(t.means), [], `${t.term}: no filler words`);
    }
  });

  test('each term links to the rules that use it, and to no others', () => {
    for (const t of GLOSSARY.terms) {
      const used = usedBy(t);
      assert.ok(used.length > 0, `${t.term} is used by a rule`);
      assert.deepEqual(t.usedIn, used, `${t.term}: usedIn is the rules that use it`);
    }
  });

  test('the rules read in plain words: a long statement is on the record, and the record only shrinks', () => {
    const long = RULES.filter((r) => wordCount(r.statement) > DOC_LIMITS.sentenceWords).map((r) => r.id);
    assert.deepEqual(
      long.filter((id) => !GLOSSARY.longRules.includes(id)),
      [],
      'a new rule statement over 25 words',
    );
    assert.deepEqual(
      GLOSSARY.longRules.filter((id) => !long.includes(id)),
      [],
      'a rule on the record is short now: take it off the list',
    );
    for (const r of RULES) assert.deepEqual(fillerIn(r.statement), [], `${r.id}: no filler words`);
    assert.ok(FILLER.length > 0);
  });
});
