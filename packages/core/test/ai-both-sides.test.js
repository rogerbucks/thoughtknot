// Asked to judge an idea, AI gives the case against as well as the case for. That is editor spec §74, ai_both_sides,
// and ethos rule r_other_side. The cases come back as SUPPORTS and CONTRADICTS links. The person keeps or drops them
// one by one, and nothing is added to the graph until a case is kept.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmSend, prepareSend, sendPrepared } from '../src/ai.ts';
import { judgeAsk, judgeInstructions } from '../src/ai-both-sides.ts';
import { noteWithProposal } from '../src/ai-answer.ts';
import { ProposalReview } from '../src/proposals-review.ts';
import { settingsFrom } from '../src/settings.ts';

const GRAPH = [
  '// graph: plan',
  "(move:Idea {name: 'Move the office to the city'}),",
  "(rent:Cost {name: 'City rent is high'}),",
  "(train:Fact {name: 'Most staff come by train'})",
].join('\n');
const NOTE = '# Plan\n\n```gql\n' + GRAPH + '\n```\n';
const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Confidential',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
  keyName: '',
};
const base = {
  settings: settingsFrom({ aiUse: 'on', aiPublic: 'note', aiModels: [LOCAL] }),
  model: 'Local',
  note: NOTE,
  notePath: 'Plan.md',
  level: 'Internal',
  choice: { graph: 'plan', what: 'graph' },
};
const FOR = {
  side: 'supports',
  case: 'Staff reach it by train',
  from: 'train',
  certainty: 'likely',
  reason: 'most come by train',
};
const AGAINST = {
  side: 'contradicts',
  case: 'It costs more',
  from: 'rent',
  certainty: 'very-likely',
  reason: 'rent is high',
};
const NEW = { side: 'contradicts', case: 'Parking is scarce', certainty: 'even-chance', reason: 'city centre' };

async function judged(cases) {
  const ask = judgeAsk(base, 'move', 'Is moving a good idea?');
  assert.ok(!('refused' in ask), ask.refused);
  const p = prepareSend(ask);
  assert.ok(!('refused' in p), p.refused);
  const content = JSON.stringify({ cases });
  const reply = { status: 200, text: JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }) };
  return sendPrepared(p, confirmSend(p), {
    transport: async () => reply,
    key: null,
    now: () => new Date('2026-11-12T15:00:00Z'),
  });
}

describe('asked to judge an idea, AI gives both sides (ai_both_sides)', () => {
  test('the model is told to give the case against as well as the case for', () => {
    assert.match(judgeInstructions('move'), /case for the idea and the case against it: at least one of each/);
  });

  test('a judge request returns links of both kinds: from things already there, or from a new Argument', async () => {
    const r = await judged([FOR, AGAINST, NEW]);
    assert.ok(r.proposal, r.failed);
    const gql = r.proposal.changes.map((c) => c.gql);
    assert.ok(
      gql.some((g) => /^\(train\)-\[:SUPPORTS .*\]->\(move\)$/.test(g)),
      gql.join('\n'),
    );
    assert.ok(gql.some((g) => /^\(rent\)-\[:CONTRADICTS .*\]->\(move\)$/.test(g)));
    assert.ok(gql.includes("(move_against_3:Argument {name: 'Parking is scarce'})"));
    assert.ok(gql.some((g) => /^\(move_against_3\)-\[:CONTRADICTS .*likelihood: 'even-chance'.*\]->\(move\)$/.test(g)));
  });

  test('an answer that gives only one side is refused whole', async () => {
    assert.match((await judged([FOR])).failed, /only one side/);
    assert.match((await judged([AGAINST, NEW])).failed, /only one side/);
  });

  test('each case is its own group, so the person keeps or drops them one by one, and nothing is added until kept', async () => {
    const r = await judged([FOR, AGAINST, NEW]);
    const groups = [...new Set(r.proposal.changes.map((c) => c.group))];
    assert.equal(groups.length, 3);
    assert.match(groups[0], /^For move, case 1/);
    assert.match(groups[1], /^Against move, case 2/);
    const note = noteWithProposal(NOTE, r.proposal);
    assert.equal(typeof note, 'string', note.refused);
    assert.ok(note.startsWith(NOTE.trimEnd().slice(0, NOTE.indexOf('```\n') + 3)), 'the graph block is as it was');
    const review = new ProposalReview(r.proposal);
    const shown = review.show(note);
    assert.ok(
      shown.rows.every((row) => row.state === 'pending'),
      'nothing is kept by itself',
    );
  });

  test('every case says how sure it is and why, and rests only on a thing that was sent', async () => {
    const { certainty, ...unsure } = AGAINST;
    assert.ok(certainty);
    assert.match((await judged([FOR, unsure])).failed, /how sure/);
    assert.match((await judged([FOR, { ...AGAINST, from: 'elsewhere' }])).failed, /not sent/);
  });

  test('the idea must be a thing of the graph, and the person must ask', () => {
    assert.match(judgeAsk(base, 'nowhere', 'Judge it').refused, /not a thing in the graph/);
    assert.match(judgeAsk(base, 'move', '  ').refused, /nothing is suggested unasked/);
  });
});
