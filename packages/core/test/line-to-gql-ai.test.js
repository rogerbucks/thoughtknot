// Loose lines to GQL with AI (editor spec §47): line_to_gql_ai. A line code cannot convert is offered to an AI only
// while AI is on. It goes through the one text to graph contract, with the note's graph as context, so names are
// reused. The answer is read as text to graph reads it, then put on the line and checked there.
// Every send goes through a fake transport handed in, so no test reaches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmSend, prepareSend, sendPrepared } from '../src/ai.ts';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { lineFromProposal, lineOffer, lineToGqlAsk } from '../src/line-to-gql-ai.ts';
import { settingsFrom } from '../src/settings.ts';
import { textToGraphInstructions } from '../src/text-to-graph.ts';

const LOOSE = 'Alice manages the new hire, Bob, from March';
const NOTE = ['# Team', '', '```gql', '// graph: team', "(alice:Employee {name: 'Alice'}),", LOOSE, '```', ''].join(
  '\n',
);
const LINE = NOTE.split('\n').indexOf(LOOSE);
const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Internal',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
  keyName: '',
};
const ON = settingsFrom({ aiUse: 'on', aiPublic: 'note', aiModels: [LOCAL] });
const OFF = settingsFrom({ aiUse: 'off', aiModels: [LOCAL] });
const CLOCK = () => new Date('2026-11-24T14:00:00Z');
const base = (settings = ON) => ({ settings, model: 'Local', note: NOTE, notePath: 'Team.md', level: 'Internal' });
const ANSWER = {
  things: [
    { name: 'alice', kind: 'Employee', text: 'Alice', quote: 'Alice' },
    { name: 'bob', kind: 'Employee', text: 'Bob', quote: 'Bob' },
  ],
  links: [{ from: 'alice', type: 'MANAGES', to: 'bob', quote: 'Alice manages the new hire, Bob' }],
};
const replying = (answer) => {
  const sent = [];
  const transport = async (request) => {
    sent.push(request);
    const content = typeof answer === 'string' ? answer : JSON.stringify(answer);
    return { status: 200, text: JSON.stringify({ choices: [{ message: { content } }] }) };
  };
  return { sent, transport };
};

test('a line code cannot convert is offered to an AI only while AI is on; one code converts is offered by code', () => {
  assert.deepEqual(lineOffer(NOTE, LINE, true), { by: 'ai', graph: 'team' });
  assert.equal(lineOffer(NOTE, LINE, false), null, 'with AI off there is no offer code cannot keep');
  const plain = NOTE.replace(LOOSE, 'Alice likes Bob');
  const code = lineOffer(plain, LINE, false);
  assert.equal(code?.by, 'code');
  assert.match(code.gql, /\(alice\)-\[:LIKES\]->\(bob\)/);
  assert.equal(lineOffer(NOTE, LINE - 1, true), null, 'a valid line has no offer');
  // with AI off, the ask itself is refused too, so nothing can be sent
  const off = lineToGqlAsk(base(OFF), LINE);
  const prepared = 'refused' in off ? off : prepareSend(off);
  assert.ok('refused' in prepared);
});

test('the line goes through the text to graph contract with the graph, and the answer becomes the line', async () => {
  const made = lineToGqlAsk(base(), LINE);
  assert.ok(!('refused' in made), made.refused);
  assert.equal(made.answers.instructions, textToGraphInstructions(), 'the one contract, not a copy');
  const prepared = prepareSend(made);
  assert.ok(!('refused' in prepared), prepared.refused);
  // the line goes as the text, and the graph without the loose line goes with it, so alice is reused by name
  assert.match(prepared.body, /source-text\\n.*Alice manages the new hire/);
  assert.match(prepared.body, /alice:Employee/);
  const { sent, transport } = replying(ANSWER);
  const result = await sendPrepared(prepared, confirmSend(prepared), { transport, key: null, now: CLOCK });
  assert.equal(sent.length, 1);
  assert.ok('proposal' in result, result.failed ?? result.refused);
  // alice is matched, never added twice; bob and the link are new
  const out = lineFromProposal(NOTE, LINE, result.proposal);
  assert.ok('gql' in out, out.refused);
  assert.equal(out.gql, "(bob:Employee {name: 'Bob'}),\n(alice)-[:MANAGES]->(bob)");
  const world = readNote(gqlBlocks(out.note).map((b) => b.text)).world.team;
  assert.deepEqual(
    world.edges.map(([a, t, b]) => `${a} ${t} ${b}`),
    ['alice MANAGES bob'],
  );
});

/** Sends the loose line to a model that answers `answer`. */
async function send(answer) {
  const prepared = prepareSend(lineToGqlAsk(base(), LINE));
  assert.ok(!('refused' in prepared), prepared.refused);
  return sendPrepared(prepared, confirmSend(prepared), {
    transport: replying(answer).transport,
    key: null,
    now: CLOCK,
  });
}

test('an answer that cannot be read is refused with the reason, and the note is left unchanged', async () => {
  const made = await send({ things: [{ name: 'bob', kind: 'Employee', quote: 'not in the line' }], links: [] });
  assert.ok(!('proposal' in made), 'an answer quoting words the line does not hold is refused');
  // a proposal put on a line that is no longer loose is refused with the reason, and nothing changes
  const good = await send(ANSWER);
  assert.ok('proposal' in good);
  const fixed = NOTE.replace(LOOSE, "(bob:Person {name: 'Bob'})");
  const out = lineFromProposal(fixed, LINE, good.proposal);
  assert.ok('refused' in out);
  assert.ok(out.refused.length > 0);
});
