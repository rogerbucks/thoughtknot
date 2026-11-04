// Text to graph in the skill (editor spec §47, text_to_graph_skill). The conversation's model makes the graph from the
// library's instructions and message. The library reads its answer and proposes the block. Nothing is written before the
// person approves that graph for that note (cowork_same_bytes). The script is run as Cowork runs it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gqlBlocks, noteWithTextGraphApplied, readNote, sha256, textGraphProposal } from '@thoughtknot/core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'packages/cowork/bin/thoughtknot.ts');
const TEXT = 'Acme Ltd hired Alice Smith. She runs the Berlin office.';
const NOTE = '---\nclassification: Public\n---\n# Team\n\nNotes from the meeting.\n';
const WITH_GRAPH = `${NOTE}\n\`\`\`gql\n// graph: team\n(acme:Company {name: 'Acme', aliases: 'Acme Ltd'})\n\`\`\`\n`;
const ANSWER = {
  things: [
    { name: 'acme', kind: 'Company', text: 'Acme Ltd', quote: 'Acme Ltd' },
    { name: 'alice', kind: 'Employee', text: 'Alice Smith', quote: 'Alice Smith' },
    { name: 'berlin', kind: 'Office', text: 'Berlin office', quote: 'the Berlin office' },
  ],
  links: [
    { from: 'acme', type: 'HIRED', to: 'alice', quote: 'hired Alice Smith' },
    { from: 'alice', type: 'RUNS', to: 'berlin', quote: 'She runs the Berlin office' },
  ],
};

/** A folder with the note, the text and the answer as files, and the script run on them as Cowork runs it. */
function folder(note, answer = ANSWER) {
  const dir = mkdtempSync(join(tmpdir(), 'tk-text-graph-'));
  const files = { note: join(dir, 'Team.md'), text: join(dir, 'text.txt'), answer: join(dir, 'answer.json') };
  writeFileSync(files.note, note);
  writeFileSync(files.text, TEXT);
  writeFileSync(files.answer, typeof answer === 'string' ? answer : JSON.stringify(answer));
  const run = (...args) =>
    JSON.parse(
      execFileSync(process.execPath, [SCRIPT, 'text-to-graph', files.note, '--text', files.text, ...args], {
        encoding: 'utf8',
      }),
    );
  return { dir, files, run, done: () => rmSync(dir, { recursive: true, force: true }) };
}

// text_to_graph_skill
test('the skill proposes the same block the library gives for shared cases, and writes only after approval', () => {
  for (const note of [NOTE, WITH_GRAPH]) {
    const f = folder(note);
    try {
      const asked = f.run();
      assert.equal(asked.read, true);
      assert.match(asked.instructions, /You make a graph, written in GQL in a note/);
      assert.match(asked.message, /source-text\nAcme Ltd hired Alice Smith/);
      const proposed = f.run('--answer', f.files.answer);
      assert.ok(proposed.approve, JSON.stringify(proposed));
      // the block the library writes for the same answer, as the editor would accept it
      const graph = note === NOTE ? 'notes' : 'team';
      const read = textGraphProposal(note, graph, TEXT, JSON.stringify(ANSWER), 'conversation');
      const library = noteWithTextGraphApplied(note, read.proposal);
      assert.equal(proposed.now, gqlBlocks(library).at(-1).text);
      assert.equal(readFileSync(f.files.note, 'utf8'), note, 'a proposal writes nothing');
      // a wrong approval, or none, writes nothing
      assert.equal(f.run('--answer', f.files.answer, '--approve', sha256('another')).written, false);
      assert.equal(readFileSync(f.files.note, 'utf8'), note);
      const done = f.run('--answer', f.files.answer, '--approve', proposed.approve);
      assert.equal(done.written, true);
      const after = readFileSync(f.files.note, 'utf8');
      assert.equal(after, library);
      const g = readNote(gqlBlocks(after).map((b) => b.text)).world[graph];
      assert.ok(g.has('alice', 'Employee'));
      if (note === WITH_GRAPH) {
        assert.deepEqual(
          proposed.matched.map((m) => [m.name, m.thing]),
          [['acme', 'acme']],
        );
      }
    } finally {
      f.done();
    }
  }
});

test('an answer the library refuses is a refusal with its reason, and the note is left as it was', () => {
  const f = folder(NOTE, { things: [{ name: 'alice', kind: 'Employee', quote: 'Bob Jones' }] });
  try {
    const proposed = f.run('--answer', f.files.answer);
    assert.match(proposed.refused, /gives no words of the text/);
    assert.equal(proposed.approve, undefined);
    assert.equal(readFileSync(f.files.note, 'utf8'), NOTE);
  } finally {
    f.done();
  }
});

test('a note the gate refuses gives no instructions and reads nothing', () => {
  const f = folder(NOTE.replace('Public', 'Secret'));
  try {
    const asked = f.run();
    assert.equal(asked.read, false);
    assert.equal(asked.instructions, undefined);
    assert.equal(asked.message, undefined);
  } finally {
    f.done();
  }
});
