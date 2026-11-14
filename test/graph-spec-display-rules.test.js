// Rules on how things look live in the editor's requirements, not in the graph spec (editor spec §51,
// spec_display_rules_here). The spec keeps only the data a view needs. A judgement is corrected by a new one that
// supersedes it. The old one is kept in the judgement graph, folded away: it is no longer current.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import gs from '@thoughtknot/graph-spec';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SPEC = read('../requirements/graph-spec.gql');
const EDITOR = read('../requirements/editor-requirements.md');

/** Each graph-spec rule as [id, its statement and quote]. */
const rules = [...SPEC.matchAll(/:Requirement \{id: '(req:[^']+)'(.*)$/gm)].map((m) => [m[1], m[2]]);
/** Words that say how something looks. */
const LOOKS = /\b(shown|shows|show|colou?r|drawn|draw|looks?|displayed?)\b/i;
/** Rules that use such a word for something else (by number, after `req:`), each with why it is data, not a look. */
const NOT_A_LOOK = {
  '17.safeguards': 'shown means proved: switched off, a case fails',
  '20.combine': 'shown means stated in the data: a dependence the graph records',
  '25.never-refused': 'drawn is one of the things a gap never stops, not how it looks',
  '25.three-states': 'the report keeps three states apart, data a view reads',
  '27.appearance': 'says where appearance data lives, the style graph, not how it looks',
};

describe('spec_display_rules_here: the graph spec keeps only the data a view needs', () => {
  test('no graph-spec rule says how something must look', () => {
    assert.ok(rules.length > 200, `${rules.length} rules read`);
    const looks = rules.filter(([id, text]) => LOOKS.test(text) && !(id.slice(4) in NOT_A_LOOK)).map(([id]) => id);
    assert.deepEqual(looks, []);
    // a rule kept out must still be in the spec, so the list cannot go stale
    const ids = new Set(rules.map(([id]) => id));
    for (const n of Object.keys(NOT_A_LOOK)) assert.ok(ids.has(`req:${n}`), `${n} is still a rule`);
  });

  test('the display rules that left the spec are the editor’s', () => {
    for (const gone of ['local-id-shown', 'gentle-words', 'likelihood-range', 'altitude-defined', 'corrected-shown'])
      assert.ok(!SPEC.includes(`'req:27.${gone}'`), `req:27.${gone} has left the spec`);
    const rule = (id) => new RegExp(`\\(${id}:Requirement \\{[^\\n]*rule: '([^\\n]*)'\\}\\)`).exec(EDITOR)?.[1] ?? '';
    assert.match(rule('spec_display_rules_here'), /local id with its graph/);
    assert.match(rule('spec_display_rules_here'), /marked as corrected/);
    assert.match(rule('spec_gentle_words'), /likelihood word always shows its range/);
    assert.match(rule('spec_gentle_words'), /altitude is defined in one plain sentence/);
  });
});

describe('spec_display_rules_here: a correcting judgement replaces the old one, which stays folded away', () => {
  const block = (extra) =>
    [
      '// graph: work_judgements',
      'INSERT',
      "(old:Decision {statement: 'Ship in May'}),",
      `(new:Decision {statement: 'Ship in June'})${extra}`,
    ].join('\n');
  const current = (text) => Object.keys(gs.review(gs.worldFromStore(gs.read([text])), 'work_judgements')).sort();

  test('a new judgement that supersedes the old one is the current one', () => {
    assert.deepEqual(current(block('')), ['new', 'old']);
    assert.deepEqual(current(block(',\n(new)-[:SUPERSEDES]->(old)')), ['new']);
  });

  test('the old judgement is kept in the graph, folded away, never deleted', () => {
    const w = gs.worldFromStore(gs.read([block(',\n(new)-[:SUPERSEDES]->(old)')]));
    const g = w.work_judgements;
    assert.deepEqual(g.labelled('Decision').sort(), ['new', 'old']);
    assert.equal(g.p('old').statement, 'Ship in May');
  });
});
