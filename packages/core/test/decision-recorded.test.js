// The person's pick kept in the note (editor spec §49: claude_asks_decision, decision_recorded). A question is checked
// against the graph it is about. Claude gets back only the pick and its reason. The pick is written as a decision typed
// by decision@1 in the note's judgement graph, reused when there is one. It passes the change-set check first.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { gqlBlocks, readNote } from '@thoughtknot/core';
import { answerForClaude, decisionItems, readAsk, readReason, recordDecision } from '../src/decision-recorded.ts';
import { STANDARD_SCHEMAS } from '../src/standard-schemas.ts';

const READER = `// graph: reader
(question:Question {name: 'Which device?'}),
(large_reader:Option {name: 'Large reader'}),
(small_reader:Option {name: 'Small reader'}),
(large_reader)-[:ANSWERS]->(question),
(small_reader)-[:ANSWERS]->(question)`;
const NOTE = `---\nclassification: Public\n---\n# Reader\n\n\`\`\`gql\n${READER}\n\`\`\`\n`;
const JUDGED = `${NOTE}\n\`\`\`gql\n// graph: judgements\n(agent_person_you:Person {name: 'you'})\n\`\`\`\n`;
const drawing = [...readNote([READER]).graphs.values()][0];
const ASK = {
  question: 'Which reader do we buy?',
  options: [
    { label: 'Large', things: ['large_reader'] },
    { label: 'Small', things: ['small_reader'] },
  ],
};
const AT = '2026-11-05T09:00:00Z';
const toRecord = (answer, by = 'Roger') => ({ graph: 'reader', ask: ASK, answer, by, asker: 'Claude', at: AT });
const judgementOf = (note) =>
  gqlBlocks(note)
    .map((b) => b.text)
    .find((t) => /^\/\/ graph: judgements/.test(t));

describe('claude_asks_decision: a question of two to six options, each tied to things in the graph', () => {
  test('a question is read with its options and the things each is tied to', () => {
    assert.deepEqual(readAsk(ASK, drawing), { ask: ASK });
  });

  test('one option, seven, an option tied to nothing, to a thing not in the graph, or a label twice is refused', () => {
    const one = { ...ASK, options: ASK.options.slice(0, 1) };
    assert.match(readAsk(one, drawing).refused, /two to six options, and this one has 1/);
    const seven = { ...ASK, options: Array.from({ length: 7 }, (_, i) => ({ label: `O${i}`, things: ['question'] })) };
    assert.match(readAsk(seven, drawing).refused, /has 7/);
    const bare = { ...ASK, options: [ASK.options[0], { label: 'None', things: [] }] };
    assert.match(readAsk(bare, drawing).refused, /Option 2 needs a label/);
    const away = { ...ASK, options: [ASK.options[0], { label: 'Kindle', things: ['kindle'] }] };
    assert.match(readAsk(away, drawing).refused, /Option 2 is tied to kindle, which is not in graph reader/);
    const twice = { ...ASK, options: [ASK.options[0], ASK.options[0]] };
    assert.match(readAsk(twice, drawing).refused, /Two options have the label Large/);
    assert.match(readAsk({ options: ASK.options }, drawing).refused, /A question needs words/);
  });

  test('Claude gets back only the option picked and its reason, or that none was chosen', () => {
    assert.equal(
      answerForClaude(ASK, { picked: 1, reason: 'It fits a pocket.' }),
      'You picked Small. Because: It fits a pocket.',
    );
    assert.equal(answerForClaude(ASK, { picked: 0 }), 'You picked Large.');
    assert.equal(answerForClaude(ASK, { picked: null }), 'You chose none of the options.');
  });

  test('a reason is text: empty is none, and one too long or not text is refused', () => {
    assert.deepEqual(readReason('  '), {});
    assert.deepEqual(readReason(' cheap '), { reason: 'cheap' });
    assert.match(readReason(4).refused, /A reason is text/);
    assert.match(readReason('x'.repeat(1001)).refused, /at most 1,000/);
  });
});

describe('decision_recorded: the pick is a decision@1 decision in the judgement graph, checked first', () => {
  test('a note with no judgement graph gets one after its last block, and the graph it is about is untouched', () => {
    const r = recordDecision(NOTE, toRecord({ picked: 1, reason: 'It fits a pocket.' }));
    assert.equal(r.ok, true, r.reason);
    const blocks = gqlBlocks(r.note).map((b) => b.text);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0], READER);
    assert.match(blocks[1], /^\/\/ graph: judgements\n/);
  });

  test('it holds the question, the options, the one picked, who decided, who asked, when and the reason', () => {
    const { note } = recordDecision(NOTE, toRecord({ picked: 1, reason: 'It fits a pocket.' }));
    const block = judgementOf(note);
    const g = readNote([block], undefined, STANDARD_SCHEMAS).world.judgements;
    const [q] = g.labelled('Question');
    const p = g.p(q);
    assert.equal(p.text, 'Which reader do we buy?');
    assert.equal(p.schema, 'decision@1');
    assert.equal(p.picked, 'Small');
    assert.equal(p.decided_by, 'Roger');
    assert.equal(p.asked_by, 'Claude');
    assert.equal(p.at, AT);
    assert.equal(p.reason, 'It fits a pocket.');
    const options = g.labelled('Option').map((o) => g.p(o));
    assert.deepEqual(
      options.map((o) => [o.label, o.things, o.picked]),
      [
        ['Large', 'large_reader', false],
        ['Small', 'small_reader', true],
      ],
    );
    assert.match(block, /_option_1\)-\[:ANSWERS\]->\(q_reader_/);
    assert.match(block, /_reason:Reason \{text: 'It fits a pocket\.'\}\)/);
    assert.match(block, /_reason\)-\[:FAVOURS\]->\(q_reader_\w+_option_2\)/);
    assert.match(block, /WAS_ATTRIBUTED_TO \{role: 'decided'\}\]->\(agent_person_Roger_/);
    assert.match(block, /WAS_ATTRIBUTED_TO \{role: 'asked'\}\]->\(agent_model_Claude_/);
  });

  test('it uses only the kinds and links decision@1 declares, besides the agents PROV names', () => {
    const { note } = recordDecision(NOTE, toRecord({ picked: 0, reason: 'bigger text' }));
    const typed = judgementOf(note).replace('// graph: judgements', '// graph: judgements · schema decision@1');
    const warned = readNote([typed], undefined, STANDARD_SCHEMAS).problems.map((p) => p.message);
    assert.ok(
      warned.every((m) => /\b(Person|Model|WAS_ATTRIBUTED_TO)\b/.test(m)),
      warned.join('\n'),
    );
  });

  test('a judgement block the note has is reused: appended to, its own lines kept', () => {
    const r = recordDecision(JUDGED, toRecord({ picked: 0 }));
    assert.equal(r.ok, true, r.reason);
    const blocks = gqlBlocks(r.note).map((b) => b.text);
    assert.equal(blocks.length, 2);
    assert.ok(blocks[1].startsWith("// graph: judgements\n(agent_person_you:Person {name: 'you'})"));
    assert.match(blocks[1], /:Question \{/);
  });

  test('none chosen is kept too, with no option picked and no reason favouring one', () => {
    const { note } = recordDecision(NOTE, toRecord({ picked: null, reason: 'Neither yet' }));
    const block = judgementOf(note);
    assert.match(block, /picked: ''/);
    assert.doesNotMatch(block, /picked: true/);
    assert.doesNotMatch(block, /FAVOURS/);
  });

  test('the decision passes the graph spec’s own change-set check against the judgement graph it joins', () => {
    const { items, decider } = decisionItems(toRecord({ picked: 1, reason: 'cheap' }));
    const { note } = recordDecision(NOTE, toRecord({ picked: 1, reason: 'cheap' }));
    // the judgement graph as it was before the decision: its agents alone
    const before = judgementOf(note)
      .split(/,\n/)
      .filter((l) => !items.includes(l.trim()))
      .join(',\n');
    const { basisOf } = { basisOf: (b) => gs.canon(readNote([b]).world.judgements).slice(0, 16) };
    const set = `// graph: judgements · CHANGE SET d · against sha-256-64:${basisOf(before)} · by ${decider}\n${items.join(',\n')}`;
    const failed = gs.checkChangeset([...STANDARD_SCHEMAS, READER, before], set, {}).results.filter(([, ok]) => !ok);
    assert.deepEqual(failed, []);
  });

  test('a decision that fails the check is refused with why, and nothing is written', () => {
    // a shared schema the check cannot load: the check fails, so the note must not change
    const broken = ['// graph: decision · SCHEMA decision@1\n(decision_schema:GraphMeta {graph: '];
    const r = recordDecision(NOTE, toRecord({ picked: 0 }), broken);
    assert.equal(r.ok, false);
    assert.match(r.reason, /^Your answer was not kept in the note: /);
  });
});
