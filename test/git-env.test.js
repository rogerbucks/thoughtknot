// git exports GIT_DIR and its kin to a hook. On 8 Nov 2026 a push from a worktree ran a test that ran git in a folder
// of its own. It wrote to the real .git/config, and git broke in every checkout. The pre-push hook is part of how CI
// runs what changed (ES§13, ci_runs_what_changed). Checked here:
// - The env a child gets carries none of git's repository variables, and keeps those that only reach a remote.
// - run-ceiling, which every npm test script runs through, hands its command no GIT_DIR.
// - The scratch repository a test makes stays in its own folder when GIT_DIR names another repository.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withoutGitHookEnv } from '../scripts/git-env.mjs';
import { ROOT } from './repository/repo.js';

const HOOK_VARIABLES = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_QUARANTINE_PATH',
  'GIT_CONFIG_PARAMETERS',
];

/** A bare repository standing in for the real one, and its config as it was made. */
function decoy() {
  const dir = mkdtempSync(join(tmpdir(), 'thoughtknot-decoy-'));
  execFileSync('git', ['init', '-q', '--bare', dir], { env: withoutGitHookEnv(process.env) });
  return { dir, config: readFileSync(join(dir, 'config'), 'utf8'), done: () => rmSync(dir, { recursive: true }) };
}

describe('git’s hook variables', () => {
  test('are taken out of a child’s env, save those that only say how to reach a remote or a person', () => {
    const env = Object.fromEntries([...HOOK_VARIABLES, 'GIT_EDITOR', 'GIT_SSH_COMMAND', 'HOME'].map((k) => [k, 'x']));
    assert.deepEqual(Object.keys(withoutGitHookEnv(env)).sort(), ['GIT_EDITOR', 'GIT_SSH_COMMAND', 'HOME']);
  });

  test('do not reach the command run-ceiling runs', () => {
    const out = spawnSync(
      process.execPath,
      ['scripts/run-ceiling.mjs', 'node', '-e', 'console.log(JSON.stringify(Object.keys(process.env)))'],
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GIT_DIR: '/nowhere', GIT_INDEX_FILE: '/nowhere/index' } },
    );
    assert.equal(out.status, 0, out.stderr);
    const keys = JSON.parse(out.stdout);
    assert.ok(!keys.includes('GIT_DIR') && !keys.includes('GIT_INDEX_FILE'), keys.join(' '));
  });

  test('do not turn a test’s scratch repository into the one GIT_DIR names', () => {
    const real = decoy();
    try {
      const script =
        "import { repository } from './test/repository/scratch-repository.js';" +
        "const r = repository([{ 'a.txt': 'a' }]); console.log(r.git('rev-parse', '--git-dir')); r.done();";
      const out = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, GIT_DIR: real.dir, GIT_WORK_TREE: real.dir },
      });
      assert.equal(out.status, 0, out.stderr);
      assert.equal(out.stdout.trim(), '.git', 'the scratch repository is its own');
      assert.equal(readFileSync(join(real.dir, 'config'), 'utf8'), real.config, 'the other repository is untouched');
    } finally {
      real.done();
    }
  });
});
