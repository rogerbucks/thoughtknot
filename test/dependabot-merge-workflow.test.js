// The workflow that turns auto-merge on for a Dependabot pull request, so it merges once CI is green like every other
// pull request (AGENTS.md). Dependabot is one source of security fixes (spec §66, soc_detection_sources), and a fix
// nobody merges lands nowhere. Read as text, by indentation, as policy.test.js reads the others.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, exists, jobs, permissionValues, read, runCommands, stripComment, usesRefs } from './repository/repo.js';

const FLOW = '.github/workflows/dependabot-merge.yml';

describe('the workflow that turns auto-merge on for a Dependabot pull request', () => {
  const text = exists(FLOW) ? read(FLOW) : '';
  const lines = text.split('\n');

  test('runs when a pull request opens, reopens or is pushed to, and on nothing else', () => {
    const on = block(lines, 'on', 0)?.join('\n') ?? '';
    assert.match(on, /pull_request:\s*\n\s*types: \[opened, reopened, synchronize\]/);
    assert.doesNotMatch(on, /pull_request_target|schedule|push/);
  });

  test('acts only on Dependabot’s own pull requests in this repository, never on a fork’s', () => {
    const job = jobs(text).merge?.join('\n') ?? '';
    assert.match(job, /if: github\.event\.pull_request\.user\.login == 'dependabot\[bot\]'/);
    assert.match(job, /github\.repository == 'rogerbucks\/thoughtknot'/);
  });

  test('defaults to read-only; its one job may merge and write pull requests, checks out no code and runs none', () => {
    assert.deepEqual(permissionValues(block(lines, 'permissions', 0) ?? []), ['read']);
    assert.deepEqual(Object.keys(jobs(text)), ['merge']);
    const given = (block(jobs(text).merge, 'permissions', 4) ?? [])
      .slice(1)
      .map((l) => stripComment(l).trim())
      .filter(Boolean);
    assert.deepEqual([...given].sort(), ['contents: write', 'pull-requests: write']);
    assert.deepEqual(usesRefs(text), []);
  });

  test('turns auto-merge on as a merge commit, never squash or rebase, and merges nothing itself', () => {
    const run = runCommands(text).join('\n');
    assert.match(run, /gh pr merge --auto --merge "\$PR"/);
    assert.doesNotMatch(run, /--squash|--rebase|--admin/);
    assert.doesNotMatch(run, /\$\{\{/);
  });
});
