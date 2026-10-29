// SEC-2: SECURITY.md's promises rest on GitHub settings, so they are checked before every release and each week. The
// job reads with a token that may see them, and fails without it. It is the same in all three workflows.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, jobs, permissionValues, read, runCommands, stripComment } from './repository/repo.js';

const steps = (lines) => lines.map(stripComment).filter((l) => l.trim() && l !== '    needs: on-main');
const job = (file) => jobs(read(`.github/workflows/${file}`)).settings;

describe('the settings check', () => {
  test('compares GitHub’s settings with the wanted ones, reading with SECURITY_ALERTS_TOKEN, and fails without it', () => {
    const text = job('settings-check.yml').join('\n');
    assert.ok(runCommands(text).some((r) => /node scripts\/public-readiness\.mjs --settings$/m.test(r)));
    assert.doesNotMatch(text, /--apply/, 'it never changes a setting');
    assert.match(text, /GH_TOKEN: \$\{\{ secrets\.SECURITY_ALERTS_TOKEN \}\}/);
    assert.match(text, /\[ -n "\$GH_TOKEN" \] \|\| \{ echo "::error::[^"]*"; exit 1; \}/);
  });

  test('runs each week and by hand, reading only', () => {
    const text = read('.github/workflows/settings-check.yml');
    assert.match(
      block(text.split('\n'), 'on', 0).join('\n'),
      /schedule:\s*\n\s*- cron: '[^']+'\s*\n\s*workflow_dispatch:/,
    );
    assert.deepEqual(permissionValues(block(text.split('\n'), 'permissions', 0)), ['read']);
    assert.equal(block(job('settings-check.yml'), 'permissions', 4), null);
  });

  test('runs before every stable release, which waits for it, and in the dry run, step for step alike', () => {
    const release = jobs(read('.github/workflows/release.yml'));
    assert.match(block(release.release, 'needs', 4).join('\n'), /\bsettings\b/);
    assert.deepEqual(steps(job('release.yml')), steps(job('settings-check.yml')));
    assert.deepEqual(steps(job('release-check.yml')), steps(job('settings-check.yml')));
  });
});
