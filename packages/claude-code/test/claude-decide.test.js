// Claude asks the person to decide (editor spec §49: claude_asks_decision, decision_person_only). A question shows its
// options beside the things they are tied to. Only the person answers: a press of the pane's button or `/graph pick`
// typed in the composer. Claude, a tool call, a hook, a plugin and Remote Control are refused. Claude gets back only the
// option picked and its reason, or that none was chosen.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gqlBlocks, readAsk, readNote } from '@thoughtknot/core';
import { Asking, pickArgs, pressFromPerson } from '../src/claude-decide.ts';
import { COMPOSER, modVault, writeNote } from './editor-mod-support.js';

const READER = `// graph: reader
(question:Question {name: 'Which device?'}),
(large_reader:Option {name: 'Large reader'}),
(small_reader:Option {name: 'Small reader'}),
(large_reader)-[:ANSWERS]->(question),
(small_reader)-[:ANSWERS]->(question)`;
const drawing = [...readNote([READER]).graphs.values()][0];
const ASK = readAsk(
  {
    question: 'Which reader?',
    options: [
      { label: 'Large', things: ['large_reader'] },
      { label: 'Small', things: ['small_reader'] },
    ],
  },
  drawing,
).ask;
const PRESS = { surface: 'desktop' };

function asking() {
  const answers = [];
  const q = new Asking(ASK, { graph: 'reader', note: '/v/reader.md' }, (a) => answers.push(a));
  return { q, answers };
}

describe('claude_asks_decision: options beside their things; Claude gets back only the pick and its reason', () => {
  test('each option is tied to the things it names in the graph', () => {
    assert.deepEqual(
      ASK.options.map((o) => [o.label, o.things]),
      [
        ['Large', ['large_reader']],
        ['Small', ['small_reader']],
      ],
    );
    assert.equal(gqlBlocks(`\`\`\`gql\n${READER}\n\`\`\``).length, 1);
  });

  test('the person’s press picks an option, and Claude is told only that and the reason they typed', () => {
    const { q, answers } = asking();
    q.reason = 'It fits a pocket.';
    assert.deepEqual(q.answer({ press: PRESS }, 1), { ok: true });
    assert.deepEqual(answers, [{ picked: 1, reason: 'It fits a pocket.' }]);
    assert.equal(q.said(answers[0]), 'You picked Small. Because: It fits a pocket.');
    assert.doesNotMatch(q.said(answers[0]), /small_reader|Which reader|\/v\//);
  });

  test('none of these is an answer too, and Claude is told none was chosen', () => {
    const { q, answers } = asking();
    assert.deepEqual(q.answer({ origin: COMPOSER }, null), { ok: true });
    assert.equal(q.said(answers[0]), 'You chose none of the options.');
  });

  test('/graph pick takes an option’s number, or none, and a reason after because', () => {
    assert.deepEqual(pickArgs('pick 2 because it is cheaper'), { n: 2, reason: 'it is cheaper' });
    assert.deepEqual(pickArgs('pick none'), { n: null });
    assert.deepEqual(pickArgs(' PICK 1 '), { n: 1 });
    assert.equal(pickArgs('pick'), null);
    assert.equal(pickArgs('edit plan.md'), null);
  });

  test('an option that is not there is refused, and the question still waits', () => {
    const { q, answers } = asking();
    assert.match(q.answer({ press: PRESS }, 5).why, /There is no option 6: pick one from 1 to 2/);
    assert.equal(answers.length, 0);
    assert.equal(q.answered, false);
  });

  test('a question is answered once: a second answer is refused', () => {
    const { q, answers } = asking();
    q.answer({ press: PRESS }, 0);
    assert.match(q.answer({ press: PRESS }, 1).why, /no question waiting/);
    assert.equal(answers.length, 1);
  });
});

describe('decision_person_only: only the person’s own input answers', () => {
  const NOT_THE_PERSON = [
    ['Claude, through a tool call', { origin: { kind: 'tool' } }],
    ['a hook', { origin: { kind: 'hook' } }],
    ['a plugin', { origin: { kind: 'plugin' } }],
    ['Remote Control', { origin: { kind: 'bridge' } }],
    ['a schedule', { origin: { kind: 'schedule' } }],
    ['no origin at all', { origin: undefined }],
    ['a press relayed by Remote Control', { press: { surface: 'desktop', origin: { kind: 'bridge' } } }],
    ['a press from no pane', { press: { surface: 'nowhere' } }],
    ['a press that is not one', { press: 'desktop' }],
  ];
  for (const [who, from] of NOT_THE_PERSON) {
    test(`an answer from ${who} is refused, and the question still waits`, () => {
      const { q, answers } = asking();
      const r = q.answer(from, 0);
      assert.equal(r.ok, false);
      assert.match(r.why, /^Only you can answer/);
      assert.equal(answers.length, 0);
      assert.equal(q.answered, false);
    });
  }

  test('the person’s press on each pane surface, and their typing in the composer, are taken', () => {
    for (const surface of ['desktop', 'vscode', 'mobile', 'terminal']) assert.equal(pressFromPerson({ surface }), true);
    const { q } = asking();
    assert.deepEqual(q.answer({ origin: COMPOSER }, 0, 'bigger text'), { ok: true });
  });
});

describe('the person’s answer is written into the note by node, as the mod writes no file itself', () => {
  const BIN = fileURLToPath(new URL('../bin/record-process.ts', import.meta.url));
  const run = (request) =>
    JSON.parse(execFileSync(process.execPath, [BIN], { input: JSON.stringify(request), encoding: 'utf8' }));
  const NOTE = `# Reader\n\n\`\`\`gql\n${READER}\n\`\`\`\n`;

  test('a decision is kept in the note’s judgement graph, and the graph it is about is untouched', () => {
    const where = modVault();
    const path = writeNote(where, 'reader.md', 'Public', NOTE);
    const said = run({
      kind: 'decision',
      path,
      graph: 'reader',
      ask: ASK,
      answer: { picked: 0 },
      by: '',
      at: '2026-11-05T09:00:00Z',
    });
    assert.deepEqual(said, { ok: true, text: 'Your answer is kept in the note as a decision.' });
    const blocks = gqlBlocks(readFileSync(path, 'utf8')).map((b) => b.text);
    assert.equal(blocks[0], READER);
    assert.match(blocks[1], /picked: 'Large', decided_by: 'you', asked_by: 'Claude'/);
  });

  test('a kept presentation is written as a graph of its steps', () => {
    const where = modVault();
    const path = writeNote(where, 'reader.md', 'Public', NOTE);
    const steps = [{ things: ['question'], links: [], caption: 'The question' }];
    const said = run({ kind: 'presentation', path, name: 'reader_tour', graph: 'reader', steps });
    assert.equal(said.ok, true);
    assert.match(readFileSync(path, 'utf8'), /\/\/ graph: reader_tour_presentation\n/);
  });

  test('a request that is not for a note writes nothing', () => {
    assert.equal(run({ kind: 'decision', path: '/etc/hosts' }).ok, false);
  });
});
