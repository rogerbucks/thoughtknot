// Text to graph has one contract (editor spec §47, text_to_graph_one_contract). The instructions to the model and the
// reading of its answer live once, in the library. The editor's action sends them, and the skill hands them to the
// conversation's model; neither holds a copy of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  confirmSend,
  prepareSend,
  sendPrepared,
  settingsFrom,
  textGraphMessage,
  textGraphProposal,
  textToGraphAsk,
  textToGraphInstructions,
} from '@thoughtknot/core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEXT = 'Acme Ltd hired Alice Smith. She runs the Berlin office.';
const NOTE = `# Team\n\n\`\`\`gql\n// graph: team\n(acme:Company {name: 'Acme', aliases: 'Acme Ltd'})\n\`\`\`\n`;
const ANSWER = JSON.stringify({
  things: [
    { name: 'acme_ltd', kind: 'Company', text: 'Acme Ltd', quote: 'Acme Ltd' },
    { name: 'alice', kind: 'Employee', text: 'Alice Smith', quote: 'Alice Smith' },
  ],
  links: [{ from: 'acme_ltd', type: 'HIRED', to: 'alice', quote: 'hired Alice Smith' }],
});
const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Internal',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
  keyName: '',
};
const BASE = {
  settings: settingsFrom({ aiUse: 'on', aiModels: [LOCAL] }),
  model: 'Local',
  note: NOTE,
  notePath: 'Team.md',
  level: 'Internal',
};

/** The source files under `dir` with any of `ends`, as text by path. */
const sources = (dir, ends) =>
  readdirSync(join(ROOT, dir), { recursive: true })
    .map(String)
    .filter((p) => ends.some((e) => p.endsWith(e)) && !p.includes('node_modules'))
    .map((p) => [join(dir, p), readFileSync(join(ROOT, dir, p), 'utf8')]);

// text_to_graph_one_contract
test('the editor action and the skill take the same prompt and answer schema from the library, and neither holds a copy of its own', async () => {
  // the editor sends the library's instructions and message; the skill hands the conversation exactly those
  const prepared = prepareSend(textToGraphAsk(BASE, 'team', TEXT));
  assert.ok(!('refused' in prepared), prepared.refused);
  const [system, user] = JSON.parse(prepared.body).messages;
  const skill = textGraphMessage(NOTE, 'team', TEXT);
  assert.equal(system.content, skill.instructions);
  assert.equal(user.content, skill.message);
  assert.equal(skill.instructions, textToGraphInstructions());
  // the same answer is read the same way by both
  const transport = async () => ({
    status: 200,
    text: JSON.stringify({ choices: [{ message: { content: ANSWER } }] }),
  });
  const sent = await sendPrepared(prepared, confirmSend(prepared), { transport, key: null });
  assert.ok('proposal' in sent, sent.failed);
  const read = textGraphProposal(NOTE, 'team', TEXT, ANSWER, 'conversation');
  assert.deepEqual(
    sent.proposal.changes.map((c) => [c.gql, c.reason]),
    read.proposal.changes.map((c) => [c.gql, c.reason]),
  );
  // neither door holds a line of the instructions: they import them
  const lines = textToGraphInstructions()
    .split('\n')
    .map((l) => l.slice(0, 40));
  const doors = [
    ...sources('packages/obsidian/src', ['.ts']),
    ...sources('packages/cowork/src', ['.ts']),
    ...sources('packages/cowork/bin', ['.ts']),
    ...sources('packages/cowork/skill', ['.md']),
  ];
  assert.ok(doors.length > 3);
  for (const [path, text] of doors)
    for (const l of lines) assert.ok(!text.includes(l), `${path} holds its own copy of "${l}"`);
  const editor = readFileSync(join(ROOT, 'packages/obsidian/src/ai/send-dialog.ts'), 'utf8');
  assert.match(editor, /textToGraphAsk/);
  const skillSource = readFileSync(join(ROOT, 'packages/cowork/src/text-graph.ts'), 'utf8');
  assert.match(skillSource, /textGraphMessage/);
  assert.match(skillSource, /textGraphProposal/);
});
