// The graph spec's text is whole again (editor spec §51, spec_text_restored). The spec came into the repository by a
// paste. It cut rules' words at an apostrophe, left a stray mark and dropped apostrophes from decision names. Each
// repair was read from the owner's original and is listed in requirements/graph-spec-erratum.json. This holds them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SPEC = read('../requirements/graph-spec.gql');
const MODEL = read('../python/graph_spec/conformance/Standards/Graph spec model.md');
const ERRATUM = JSON.parse(read('../requirements/graph-spec-erratum.json'));
const unescaped = (text) => text.replace(/\\'/g, "'");
const quotes = [...SPEC.matchAll(/\((\w+):(?:Requirement|Wording) \{[^\n]*?quote: '((?:[^'\\]|\\.)*)'/g)].map((m) => ({
  rule: m[1],
  quote: unescaped(m[2]),
}));
const decisions = [...SPEC.matchAll(/:Decision \{id: 'note:((?:[^'\\]|\\.)*)\.decision'/g)].map((m) => unescaped(m[1]));

describe('spec_text_restored', () => {
  test("no rule's words are cut short at an apostrophe", () => {
    assert.ok(quotes.length >= 200, `${quotes.length} quotes`);
    const cut = quotes.filter(({ quote }) => {
      const at = MODEL.indexOf(quote);
      return at >= 0 && /^['’]/.test(MODEL.slice(at + quote.length));
    });
    assert.deepEqual(
      cut.map((q) => q.rule),
      [],
    );
  });

  test('no rule carries a stray bold or code mark', () => {
    const stray = quotes.filter(({ quote }) => quote.split('**').length % 2 === 0 || quote.split('`').length % 2 === 0);
    assert.deepEqual(
      stray.map((q) => q.rule),
      [],
    );
  });

  test('the erratum lists each repair, and each is in place', () => {
    assert.ok(ERRATUM.repairs.length >= 10);
    const text = unescaped(SPEC);
    for (const { where, was, now, why } of ERRATUM.repairs) {
      assert.ok(where && why, `${now}: says where and why`);
      assert.ok(text.includes(now), `${where}: reads "${now}"`);
      if (where.startsWith('a decision'))
        assert.ok(decisions.includes(now) && !decisions.includes(was), `${was} is now ${now}`);
      else assert.ok(!quotes.some((q) => q.quote === was), `${where} no longer reads "${was}"`);
    }
  });
});
