// An AI edit is the smallest change that does the job (editor spec §74, ai_smallest_edit; ethos rule r_own_voice). A
// proposal may change or remove only a few of the things the person wrote. One that rewrites past the cap is refused
// whole, saying why. The same proposal passes when the person asked for a rewrite. Adding never counts against the cap.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmSend, prepareSend, sendPrepared } from '../src/ai.ts';
import { INSTRUCTIONS } from '../src/ai-request.ts';
import { REWRITE_MOST, editInstructions, rewritesIn } from '../src/ai-edit-size.ts';
import { settingsFrom } from '../src/settings.ts';

const THINGS = Array.from({ length: 12 }, (_, i) => `(t${i}:Task {name: 'Task ${i}', note: 'mine'})`);
const NOTE = '# Tasks\n\n```gql\n// graph: tasks\n' + THINGS.join(',\n') + '\n```\n';
const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Confidential',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
  keyName: '',
};
const ON = settingsFrom({ aiUse: 'on', aiPublic: 'note', aiModels: [LOCAL] });
const ask = (over = {}) => ({
  settings: ON,
  model: 'Local',
  note: NOTE,
  notePath: 'Tasks.md',
  level: 'Internal',
  choice: { graph: 'tasks', what: 'graph' },
  question: 'Tidy the names.',
  ...over,
});
const reply = (changes) => ({
  status: 200,
  text: JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ changes }) } }] }),
});
const renames = (n) =>
  Array.from({ length: n }, (_, i) => ({ op: 'set', thing: `t${i}`, key: 'name', value: `Renamed ${i}` }));

async function send(over, changes) {
  const p = prepareSend(ask(over));
  assert.ok(!('refused' in p), p.refused);
  const transport = async () => reply(changes);
  const result = await sendPrepared(p, confirmSend(p), {
    transport,
    key: null,
    now: () => new Date('2026-11-12T14:00:00Z'),
  });
  return { p, result };
}

describe('an AI edit is the smallest change that does the job (ai_smallest_edit)', () => {
  test('only changing or removing what the person wrote counts; adding a thing, a link or a new property does not', () => {
    const had = (thing, key) => key === 'name' || key === 'note';
    assert.equal(rewritesIn(renames(3), had), 3);
    assert.equal(
      rewritesIn(
        [
          { op: 'add-thing', name: 'new_one', kind: 'Task', properties: {} },
          { op: 'add-link', from: 't0', type: 'BEFORE', to: 't1' },
          { op: 'set', thing: 't0', key: 'status', value: 'open' },
          { op: 'remove-thing', thing: 't2' },
          { op: 'remove-link', from: 't0', type: 'BEFORE', to: 't1' },
        ],
        had,
      ),
      2,
    );
  });

  test('a proposal that rewrites past the cap is refused whole, saying why and how to ask for more', async () => {
    const { result } = await send({}, renames(REWRITE_MOST + 1));
    assert.ok(!result.proposal, 'nothing is proposed from an answer that rewrites past the cap');
    assert.match(result.failed, new RegExp(`${REWRITE_MOST + 1}\\b`));
    assert.match(result.failed, new RegExp(`at most ${REWRITE_MOST}\\b`));
    assert.match(result.failed, /rewrite/i);
    assert.equal(result.record.outcome, 'failed');
  });

  test('up to the cap passes, and so does any number of additions', async () => {
    assert.ok((await send({}, renames(REWRITE_MOST))).result.proposal);
    const adds = Array.from({ length: 20 }, (_, i) => ({ op: 'add-thing', name: `n${i}`, kind: 'Task' }));
    assert.ok((await send({}, adds)).result.proposal);
  });

  test('the same proposal passes when the person asked for a rewrite', async () => {
    const { result } = await send({ rewrite: true }, renames(12));
    assert.ok(result.proposal, result.failed);
    assert.equal(result.proposal.changes.length, 12);
  });

  test('the model is told the cap, and told when the person asked for a rewrite; what is shown is what is sent', () => {
    assert.match(INSTRUCTIONS, /smallest change/);
    assert.match(INSTRUCTIONS, new RegExp(`at most ${REWRITE_MOST}\\b`));
    assert.equal(editInstructions(false), INSTRUCTIONS);
    assert.match(editInstructions(true), /asked for a rewrite/);
    const plain = prepareSend(ask());
    const asked = prepareSend(ask({ rewrite: true }));
    assert.equal(JSON.parse(plain.body).messages[0].content, INSTRUCTIONS);
    assert.equal(JSON.parse(asked.body).messages[0].content, editInstructions(true));
    assert.notEqual(plain.body, asked.body, 'a yes to one is never a yes to the other');
  });

  test('an answer of another shape, such as suggestions, keeps its own reader and is not held to the edit cap', () => {
    const answers = { instructions: 'Suggest.', read: () => renames(12) };
    const p = prepareSend(ask({ answers, rewrite: false }));
    assert.equal(p.edit, undefined);
  });
});
