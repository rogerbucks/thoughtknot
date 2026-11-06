// SEC-26 (security_daily, security_release_gate): the lint tools carry no minimatch that a crafted pattern can slow.
// Versions from 7.0.0 to before 11.0.1 have the flaw. The overrides in package.json lift the three tools that used
// them to 11. The 3.x copies ESLint itself needs are older than the flaw. npm audit in CI and the release check
// (security-alerts.mjs) are the class rule: they fail on any advisory a lock file carries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJSON } from './repository/repo.js';

/** The [major, minor, patch] of a version. */
const parts = (version) => version.split(/[.-]/).slice(0, 3).map(Number);

/** Whether version a comes before version b. */
const before = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};

test('no locked minimatch falls in the range the advisory names', () => {
  const lock = readJSON('package-lock.json');
  const found = Object.entries(lock.packages)
    .filter(([path]) => path.endsWith('node_modules/minimatch'))
    .map(([path, { version }]) => ({ path, version }));
  assert.ok(found.length > 0, 'the lock holds minimatch');
  const flawed = found.filter(({ version }) => !before(version, '7.0.0') && before(version, '11.0.1'));
  assert.deepEqual(flawed, []);
});
