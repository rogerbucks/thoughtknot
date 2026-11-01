// SEC-2 (security_policy): SECURITY.md's promises rest on GitHub settings. So they are checked before every release
// and each week. The job reads with a token that may see them, and fails without it. It is the same in all three
// workflows.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, jobs, permissionValues, read, runCommands, stripComment } from './repository/repo.js';
import { WANTED } from '../scripts/public-readiness.mjs';
import { graphRead } from '../scripts/repo-profile.mjs';

const steps = (lines) => lines.map(stripComment).filter((l) => l.trim() && l !== '    needs: on-main');
const wanted = (name) => WANTED.find((s) => s.name === name);
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

  test('auto-merge and branch clean-up are read through GraphQL when REST leaves them out for a read-only token', () => {
    // SECURITY_ALERTS_TOKEN reads REST without these two fields, so the weekly check failed on them (SEC-2)
    const asked = [];
    const query = (repo, name) => (asked.push(`${repo} ${name}`), name === 'autoMergeAllowed');
    assert.equal(
      wanted('allow_auto_merge').read('o/n', false, () => ({}), query),
      true,
    );
    assert.equal(
      wanted('delete_branch_on_merge').read('o/n', false, () => ({}), query),
      false,
    );
    assert.deepEqual(asked, ['o/n autoMergeAllowed', 'o/n deleteBranchOnMerge']);
    assert.equal(
      wanted('allow_auto_merge').read('o/n', false, () => ({ allow_auto_merge: false }), query),
      false,
    );
    assert.equal(asked.length, 2, 'REST is used when it has the field');
    const sent = [];
    const read = graphRead(
      (args) => (sent.push(args), { data: { repository: { autoMergeAllowed: true } } }),
      (f) => f(),
    );
    assert.equal(read('rogerbucks/thoughtknot', 'autoMergeAllowed'), true);
    assert.deepEqual(sent, [
      ['graphql', '-f', 'query={repository(owner:"rogerbucks",name:"thoughtknot"){autoMergeAllowed}}'],
    ]);
  });
});
