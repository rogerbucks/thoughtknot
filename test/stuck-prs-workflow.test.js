// The workflow that flags a stuck auto-merge pull request, so the session watching it wakes. It is stuck on a conflict
// with main, or on a required check that never ran on its head.
// Read as text, by indentation, as policy.test.js reads the others.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, exists, jobs, permissionValues, read, runCommands, usesRefs } from './repository/repo.js';

const STUCK = '.github/workflows/stuck-prs.yml';

describe('the workflow that flags a stuck auto-merge pull request', () => {
  const text = exists(STUCK) ? read(STUCK) : '';
  const lines = text.split('\n');

  test('runs after each push to main and each half hour, never on a pull request’s own event', () => {
    const on = block(lines, 'on', 0)?.join('\n') ?? '';
    assert.match(on, /push:\s*\n\s*branches: \[main\]/);
    assert.match(on, /cron: '\*\/30 \* \* \* \*'/);
    assert.doesNotMatch(on, /pull_request/);
  });

  test('may write pull request labels and comments and nothing else, and checks out no code', () => {
    assert.deepEqual(permissionValues(block(lines, 'permissions', 0) ?? []), ['read']);
    assert.deepEqual(Object.keys(jobs(text)), ['flag']);
    assert.deepEqual(permissionValues(block(jobs(text).flag, 'permissions', 4) ?? []), ['write']);
    assert.match(jobs(text).flag.join('\n'), /pull-requests: write/);
    assert.deepEqual(usesRefs(text), []);
  });

  test('flags only a ready auto-merge pull request that conflicts, once, and clears the flag when it is gone', () => {
    const run = runCommands(text).join('\n');
    assert.match(run, /select\(\.auto_merge != null and \(\.draft \| not\)\)/);
    assert.match(run, /"\$state" = dirty \] && \[ "\$labelled" = false \]/);
    assert.match(run, /-X DELETE "repos\/\$REPO\/issues\/\$n\/labels\/merge-conflict"/);
    assert.doesNotMatch(run, /\$\{\{/);
  });

  test('flags a green auto-merge pull request whose head misses CodeQL or dependency-review, once the head is 20 minutes old and nothing runs', () => {
    const run = runCommands(text).join('\n');
    assert.match(run, /commits\/\$sha\/check-runs/);
    assert.match(run, /any\(\.check_runs\[\]; \.status != "completed"\) then "running"/);
    assert.match(run, /index\("CodeQL"\) and index\("dependency-review"\)/);
    assert.match(
      run,
      /"\$state" = blocked \] && \[ "\$checks" = missing \] && \[ \$\(\(now - pushed\)\) -gt 1200 \] && \[ "\$flagged" = false \]/,
    );
    assert.match(run, /labels\[\]=checks-missing/);
    assert.match(run, /merge main into the branch and push/);
    assert.match(run, /-X DELETE "repos\/\$REPO\/issues\/\$n\/labels\/checks-missing"/);
    assert.doesNotMatch(
      run,
      /update-branch/,
      'a push with the workflow token starts no check, so it never updates the branch itself',
    );
  });
});
