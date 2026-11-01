// Requirement: tests_first (spec §12).
// FLOW-4: one command writes every record a pull request carries, and CI names every stale one at once.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, RECORDS } from '../scripts/prepare-pr.mjs';
import { read, readJSON } from './repository/repo.js';

describe('prepare-pr', () => {
  test('writes the records in order, the tests-first one last, as it reads the commits', () => {
    const ran = [];
    const failed = prepare({ run: (...argv) => (ran.push(argv.join(' ')), 0) });
    assert.deepEqual(failed, []);
    assert.deepEqual(ran, [
      'plain-docs.mjs --update',
      'public-api.mjs --update',
      'notices.mjs',
      'tests-first.mjs --update',
    ]);
  });

  test('in check mode it runs each record’s own check and names every stale record, not just the first', () => {
    const ran = [];
    const failed = prepare({
      check: true,
      run: (...argv) => (ran.push(argv.join(' ')), argv[0] === 'notices.mjs' || argv[0] === 'public-api.mjs' ? 1 : 0),
    });
    assert.deepEqual(failed, ['public-api', 'notices']);
    assert.equal(ran.length, RECORDS.length);
    assert.ok(ran.includes('notices.mjs --check'));
  });

  test('is an npm script, named in AGENTS.md, and run by CI in check mode', () => {
    assert.equal(readJSON('package.json').scripts['prepare-pr'], 'node scripts/prepare-pr.mjs');
    assert.match(read('AGENTS.md'), /npm run prepare-pr/);
    assert.match(read('.github/workflows/ci.yml'), /npm run prepare-pr -- --check/);
  });

  test('a change to words alone gets no Claude review', () => {
    const yml = read('.github/workflows/claude-review.yml');
    assert.match(yml, /paths-ignore:[\s\S]*'\*\*\/\*\.md'[\s\S]*'docs\/\*\*'/);
  });
});
