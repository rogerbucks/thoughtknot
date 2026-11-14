// An AI reads a board and offers things, kinds and links (editor spec §45, board_ai_decompose):
// - It is asked for, and nothing is sent without the person's ask and the board items they chose.
// - Only those items and their connectors are sent, never the rest of the note. A private reviewer comes first.
// - The answer is a proposal, one change at a time, and nothing is written to the graph until a person accepts one.
import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmSend, prepareSend, sendPrepared } from '../src/ai.ts';
import { noteWithProposal } from '../src/ai-answer.ts';
import { boardAsk, boardReviewer } from '../src/board-ai.ts';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { ProposalReview } from '../src/proposals-review.ts';
import { settingsFrom } from '../src/settings.ts';
import { setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';

afterEach(() => setLanguage(SOURCE_LANGUAGE));

const TEAM = `// graph: team
(ann:Person {name: 'Ann'}),
(vault_secret:Person {name: 'Never sent to any model'})`;
const BOARD = `// graph: ideas · BOARD ON team
(s1:Sticky {x: 0, y: 0, text: 'Dana'}),
(s2:Sticky {x: 200, y: 0, text: 'Eli Ng'}),
(s3:Sticky {x: 400, y: 0, text: 'Kept off the request'}),
(s1)-[:CONNECTS]->(s2)`;
const NOTE = `# Team\n\n\`\`\`gql\n${TEAM}\n\`\`\`\n\n\`\`\`gql\n${BOARD}\n\`\`\`\n`;
const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Internal',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
  keyName: '',
  reach: 'private',
};
const CLOUD = { ...LOCAL, name: 'Cloud', endpoint: 'https://api.example.com/v1/chat/completions', reach: 'public' };
const BASE = {
  settings: settingsFrom({ aiUse: 'on', aiPublic: 'note', aiModels: [LOCAL] }),
  model: 'Local',
  note: NOTE,
  notePath: 'Team.md',
  level: 'Internal',
};
const CLOCK = () => new Date('2026-11-14T09:00:00Z');
const textsOf = (n) => gqlBlocks(n).map((b) => b.text);

const ANSWER = {
  things: [
    { item: 's1', kind: 'Person', name: 'Dana', certainty: 'likely', reason: 'a first name', read: ['s1'] },
    { item: 's2', kind: 'Person', name: 'Eli Ng', certainty: 'very-likely', reason: 'a full name', read: ['s2'] },
  ],
  links: [{ from: 's1', to: 's2', type: 'works with', certainty: 'likely', reason: 'joined', read: ['s1', 's2'] }],
};
const replying = (answer) => {
  const sent = [];
  const transport = async (request) => {
    sent.push(request);
    return { status: 200, text: JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }) };
  };
  return { sent, transport };
};
const prepare = (items = ['s1', 's2']) => {
  const ask = boardAsk(BASE, 'ideas', items, 'What do these notes name?');
  assert.ok(!('refused' in ask), ask.refused);
  const prepared = prepareSend(ask);
  assert.ok(!('refused' in prepared), prepared.refused);
  return prepared;
};

describe('an AI reads a board, asked and in part', () => {
  // proves: board_ai_decompose
  test('it is off until asked: no ask, no items, or items the board does not hold send nothing', () => {
    assert.match(boardAsk(BASE, 'ideas', ['s1'], '  ').refused, /unasked/);
    assert.match(boardAsk(BASE, 'ideas', [], 'Read').refused, /Choose the board items/);
    assert.match(boardAsk(BASE, 'ideas', ['zz'], 'Read').refused, /Choose the board items/);
    assert.match(boardAsk(BASE, 'nope', ['s1'], 'Read').refused, /no board nope/);
  });

  test('only the chosen items and their connector are sent, and nothing else of the note', () => {
    const { body } = prepare(['s1', 's2']);
    assert.match(body, /Dana/);
    assert.match(body, /Eli Ng/);
    assert.doesNotMatch(body, /Kept off the request/, 'an item not chosen is not sent');
    assert.doesNotMatch(body, /Never sent to any model/, 'the rest of the vault is not sent');
    assert.match(body, /CONNECTS/);
  });

  test('the private reviewer comes first, and a public one is not asked unless the vault allows it', () => {
    assert.equal(boardReviewer([CLOUD, LOCAL]).reach, 'private');
    assert.ok('none' in boardReviewer([CLOUD]), 'a public reviewer alone, with no consent, is none');
    assert.equal(boardReviewer([CLOUD], { publicAllowed: true, noteTextAllowed: false }).reach, 'public');
  });
});

describe('the answer is a proposal, taken whole or not at all', () => {
  test('things and links wait as changes with their certainty and reason, and the graph is as it was', async () => {
    const prepared = prepare();
    const { transport } = replying(ANSWER);
    const result = await sendPrepared(prepared, confirmSend(prepared), { transport, key: null, now: CLOCK });
    assert.ok('proposal' in result, result.failed);
    const { proposal } = result;
    assert.equal(proposal.provenance.by.kind, 'model');
    assert.deepEqual(
      proposal.changes.map((c) => c.gql),
      ["(dana:Person {name: 'Dana'})", "(eli_ng:Person {name: 'Eli Ng'})", '(dana)-[:WORKS_WITH]->(eli_ng)'],
    );
    assert.match(proposal.changes[0].reason, /read board items s1.*likely.*a first name/);
    const note = noteWithProposal(NOTE, proposal);
    assert.equal(typeof note, 'string', note.refused);
    assert.equal(textsOf(note)[0], TEAM, 'the graph is untouched');
    assert.equal(readNote(textsOf(note)).world.team.nodes.size, 2, 'nothing added yet');
    const block = textsOf(note).find((t) => t.includes('dana'));
    const accepted = ProposalReview.fromChangeSet(block).accept(note, [proposal.changes[0].id], { name: 'you' });
    assert.ok(accepted.ok, accepted.reason);
    const keys = [...readNote(textsOf(accepted.note)).world.team.nodes.keys()];
    assert.ok(keys.includes('dana') && !keys.includes('eli_ng'), 'only the accepted change is written');
  });

  test('an answer for an item not sent, with no certainty, or with something else too, is refused whole', async () => {
    const prepared = prepare(['s1']);
    const refused = async (answer) => {
      const { transport } = replying(answer);
      return sendPrepared(prepared, confirmSend(prepared), { transport, key: null, now: CLOCK });
    };
    const thing = (o) => ({
      things: [{ item: 's1', kind: 'Person', name: 'Dana', certainty: 'likely', reason: 'r', ...o }],
    });
    assert.match((await refused(thing({ item: 's2' }))).failed, /not sent/);
    assert.match((await refused(thing({ certainty: undefined }))).failed, /certainty/);
    assert.match((await refused(thing({ reason: undefined }))).failed, /rests on/);
    assert.match((await refused({ ...thing({}), edit: 'remove ann' })).failed, /something else/);
    assert.match((await refused({ things: [] })).failed, /nothing new/);
  });
});
