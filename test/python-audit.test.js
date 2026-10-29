// SEC-10: every CI run holds the Python dependencies to the published advisories, as npm audit does the JavaScript
// ones. They are read by hash from the lock file. The release reads OSV over the same lock (security-alerts.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobs, read, runCommands } from './repository/repo.js';

test('CI’s Python job audits every locked dependency, extras included, by hash', () => {
  const runs = runCommands(jobs(read('.github/workflows/ci.yml')).python.join('\n')).join('\n');
  assert.match(
    runs,
    /uv export --locked --all-extras --no-emit-project --format requirements-txt -o "\$RUNNER_TEMP\/requirements\.txt"/,
  );
  assert.match(
    runs,
    /uvx pip-audit@\d+\.\d+\.\d+ --strict --require-hashes --disable-pip [^\n]*-r "\$RUNNER_TEMP\/requirements\.txt"/,
  );
  assert.match(
    read('scripts/security-alerts.mjs'),
    /python\/graph_spec\/uv\.lock/,
    'the release reads OSV over the lock',
  );
});
