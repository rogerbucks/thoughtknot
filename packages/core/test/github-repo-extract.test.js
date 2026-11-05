// Graph information pulled out of a repository (editor spec §48, github_repo_extract). Graph blocks in its notes, its
// folders and its docs come back as a proposal over the graph. Every change is an addition, marked as one. Nothing is
// written until it is accepted.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { noteWithProposal } from '../src/ai-answer.ts';
import { REPO_EXTRACT_MOST, repoGraphProposal } from '../src/github-repo-extract.ts';
import { markOf } from '../src/proposals-marks.ts';

const NOTE = "# Plan\n\n```gql\n// graph: plan\n(api:Service {name: 'API'}),\n(db:Store {name: 'Database'})\n```\n";
const FILES = [
  { path: 'src/app.ts', text: 'export {}' },
  { path: 'README.md', text: '# Read me\n' },
  {
    path: 'docs/design/system.md',
    text: "```gql\n(api:Service {name: 'API'}),\n(web:App {name: 'Web'}),\n(web)-[:CALLS]->(api),\n(api)-[:READS]->(nowhere)\n```\n",
  },
  { path: '.github/notes.md', text: "```gql\n(hidden:Thing {name: 'x'})\n```\n" },
];

const thingsOf = (note) => [...readNote(gqlBlocks(note).map((b) => b.text)).world.plan.nodes.keys()].sort();

describe('graph information in a repository is proposed, never written (github_repo_extract)', () => {
  test('graph blocks, folders and docs come back as additions; the graph’s own things are not proposed again', () => {
    const found = repoGraphProposal(NOTE, 'plan', FILES);
    assert.ok('proposal' in found, JSON.stringify(found));
    const { changes } = found.proposal;
    assert.ok(changes.every((c) => markOf(c) === 'add'));
    const added = changes.map((c) => c.gql);
    assert.ok(added.includes("(web:App {name: 'Web'})"));
    assert.ok(added.includes('(web)-[:CALLS]->(api)'));
    assert.ok(!added.some((g) => g.startsWith('(api:')), 'the graph has api already');
    assert.ok(!added.some((g) => g.includes('nowhere')), 'a link to a thing nobody has is left out');
    assert.ok(!added.some((g) => g.includes('hidden')), 'a hidden folder is not read');
    assert.ok(added.includes("(folder_docs_design:Folder {name: 'docs/design'})"));
    assert.ok(added.includes('(folder_docs)-[:CONTAINS]->(folder_docs_design)'));
    assert.ok(added.includes("(doc_README:Doc {name: 'README', path: 'README.md'})"));
    assert.ok(added.includes('(folder_docs_design)-[:CONTAINS]->(doc_docs_design_system)'));
    assert.deepEqual(found.proposal.provenance.read, ['README.md', 'docs/design/system.md']);
  });

  test('the proposal is written beside the graph as a change set; the graph holds only its own things until accepted', () => {
    const found = repoGraphProposal(NOTE, 'plan', FILES);
    const written = noteWithProposal(NOTE, found.proposal);
    assert.equal(typeof written, 'string', JSON.stringify(written));
    assert.ok(written.startsWith(NOTE.trimEnd().slice(0, -3)));
    assert.deepEqual(thingsOf(written), ['api', 'db']);
  });

  test('a repository with nothing new is said so, and a huge one is cut at the most, the rest counted', () => {
    const nothing = repoGraphProposal(NOTE, 'plan', [{ path: 'src/a.ts', text: '' }]);
    assert.match(nothing.refused, /nothing the graph does not have/);
    const many = Array.from({ length: REPO_EXTRACT_MOST + 20 }, (_, i) => ({ path: `n${i}.md`, text: '' }));
    const cut = repoGraphProposal(NOTE, 'plan', many);
    assert.equal(cut.proposal.changes.length, REPO_EXTRACT_MOST);
    assert.equal(cut.left, 20);
  });
});
