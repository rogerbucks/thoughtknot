// A preview of the looks AI suggestions would give (editor spec §59, ai_suggest_preview). In reading view the waiting
// suggestions are laid over the graph, and a look only a suggestion gives is drawn dashed and marked suggested. The
// note is never changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestedPreview, SUGGESTED_TOKEN } from '../src/ai-suggestions-preview.ts';
import { noteWithProposal } from '../src/ai-answer.ts';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { ProposalReview } from '../src/proposals-review.ts';
import { makeProposal } from '../src/proposals.ts';
import { basisOf } from '../src/proposals-basis.ts';
import { readStyle } from '../src/style.ts';

const WORK = `// graph: work
(login:Task {name: 'Fix the login page'}),
(docs:Task {name: 'Write the help pages'}),
(old:Task {name: 'Old bug', category: 'bug'}),
(login)-[:NEEDS]->(docs)`;
const STYLE = `// graph: work_style · STYLE work
(bugs:Look {when: 'category == "bug"', kind: 'Task', badge: 'flag', means: 'A bug'})`;
const NOTE = `# Work\n\n\`\`\`gql\n${WORK}\n\`\`\`\n\n\`\`\`gql\n${STYLE}\n\`\`\`\n`;
const textsOf = (note) => gqlBlocks(note).map((b) => b.text);

const SUGGESTED = makeProposal({
  id: 'ai-20261103T090000Z',
  graph: 'work',
  by: { name: 'Local', kind: 'model' },
  at: '2026-11-03T09:00:00Z',
  basis: basisOf(NOTE, 'work'),
  changes: [
    {
      op: 'set',
      thing: 'login',
      key: 'category',
      value: "'bug'",
      group: "category 'bug'",
      reason: 'likely, read login: broken',
    },
    {
      op: 'set',
      thing: 'docs',
      key: 'category',
      value: "'docs'",
      group: "category 'docs'",
      reason: 'likely, read docs: help',
    },
  ],
});

// ai_suggest_preview
test('the preview draws suggested looks dashed and marked, and the note is unchanged', () => {
  const note = noteWithProposal(NOTE, SUGGESTED);
  assert.equal(typeof note, 'string');
  const held = note;
  const review = new ProposalReview(SUGGESTED);
  const { reading, marks } = review.show(note);
  const base = readNote(textsOf(note));
  const { style } = readStyle(reading.texts, 'work', reading);
  const shown = suggestedPreview(style, base.world.work, reading.world.work, reading.graphs.get('work'), marks);
  // the suggested bug is drawn as a bug would be, dashed and said to be suggested; the bug already there is as it was
  const login = shown.things.get('login');
  assert.equal(login.badge, 'flag');
  assert.equal(login.line, 'dashed');
  assert.equal(login.suggested, true);
  assert.deepEqual(login.means, ['suggested, not applied', 'A bug']);
  assert.ok(login.tokens.includes(SUGGESTED_TOKEN));
  const old = shown.things.get('old');
  assert.equal(old.suggested, undefined);
  assert.equal(old.line, undefined);
  // a suggestion that gives no look draws no look
  assert.equal(shown.things.has('docs'), false);
  assert.deepEqual(shown.legend.at(-1), {
    token: SUGGESTED_TOKEN,
    line: 'dashed',
    means: 'Suggested by an AI, not applied: a dashed line',
  });
  // nothing is saved: the note and its graph are as they were
  assert.equal(note, held);
  assert.equal(readNote(textsOf(note)).world.work.p('login').category, undefined);
});
