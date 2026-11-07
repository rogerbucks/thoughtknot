// Fewer runner minutes (Roger, 7 Nov 2026): the laptop checks a push first, and pull requests build no macOS or Windows
// app on GitHub. Main, the nightly and a release still build every system, so CI stays the gate for main (ES§13,
// ci_runs_what_changed). Checked here:
// - The pre-push hook runs the build, the lint, the type check and the tests the change reaches.
// - On a Mac, a change the desktop workflow builds also builds the macOS app, unsigned; elsewhere it does not.
// - Without Rust it warns and does not stop the push. Its paths are the desktop workflow's own.
// - The desktop workflow builds Linux alone on a pull request, and every system on main and when the nightly calls it.
// - The phone workflow builds the iOS simulator app off pull requests only.
// - The app builds run only for a change to what they build; a release tag builds every system.
// - A newer push cancels a pull request's older run; a run on main or the nightly is never cancelled.
// - The build status runs for a pull request's checks alone, and skips a CI run that was cancelled.
// - The hook can be skipped in an emergency, and on a change that reaches everything it runs the whole suite gently.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SUITE_MEMORY_MB, SUITE_SHARDS, desktopPaths, matches, prePushPlan } from '../scripts/pre-push.mjs';
import { ROOT, jobs, read } from './repository/repo.js';

const plan = (files, platform = 'darwin', cargo = true) =>
  prePushPlan({ files, platform, cargo, base: 'abc123' }).steps.map(([label]) => label);

describe('the pre-push hook', () => {
  test('always runs the build, the lint, the type check and the tests the change reaches, from where it left main', () => {
    const { steps } = prePushPlan({ files: ['README.md'], platform: 'linux', cargo: false, base: 'abc123' });
    assert.deepEqual(
      steps.map(([, ...cmd]) => cmd.join(' ')),
      ['npm run build', 'npm run lint', 'npm run typecheck', 'npm run test:changed -- --base abc123'],
    );
  });

  test('a change that reaches everything runs the whole suite in CI’s six parts, one after another', () => {
    const { steps } = prePushPlan({ files: ['package.json'], platform: 'linux', cargo: false, base: 'b', whole: true });
    const parts = steps.filter(([label]) => label.startsWith('the whole suite'));
    assert.equal(parts.length, SUITE_SHARDS);
    assert.equal(parts[0].slice(1).join(' '), 'npm run test:ai -- --test-concurrency=3 --test-shard=1/6');
    assert.ok(!steps.some(([l]) => l === 'tests the change reaches'));
    assert.equal(SUITE_MEMORY_MB, '8192', 'the ceiling CI gives each of its machines');
    assert.match(read('scripts/pre-push.mjs'), /THOUGHTKNOT_TEST_MEMORY_MB: SUITE_MEMORY_MB/);
    const py = prePushPlan({
      files: ['python/graph_spec/x.py'],
      platform: 'linux',
      cargo: false,
      base: 'b',
      whole: true,
    });
    assert.equal(py.steps.at(-1)[0], 'Python tests');
  });

  test('is skipped in an emergency with THOUGHTKNOT_SKIP_PRE_PUSH=1, and says so', () => {
    const r = spawnSync(process.execPath, ['scripts/pre-push.mjs'], {
      cwd: ROOT,
      input: '',
      encoding: 'utf8',
      env: { ...process.env, THOUGHTKNOT_SKIP_PRE_PUSH: '1' },
    });
    assert.equal(r.status, 0);
    assert.match(r.stderr, /skipped/);
    assert.match(read('README.md'), /THOUGHTKNOT_SKIP_PRE_PUSH=1 git push/);
    assert.match(read('README.md'), /git push --no-verify/);
  });

  test('builds the macOS app on a Mac when the change is one the desktop workflow builds', () => {
    assert.ok(plan(['packages/app/src/app-start.ts']).includes('macOS app: bundle, unsigned'));
    assert.ok(plan(['packages/core/src/render/render-tilt.ts']).includes('macOS app: compile'));
    assert.ok(!plan(['README.md']).some((l) => l.startsWith('macOS')), 'not for words alone');
    assert.ok(!plan(['packages/app/src/app-start.ts'], 'linux').some((l) => l.startsWith('macOS')), 'not off a Mac');
  });

  test('without Rust it warns, loudly, and does not stop the push', () => {
    const p = prePushPlan({ files: ['packages/app/x.ts'], platform: 'darwin', cargo: false, base: 'b' });
    assert.ok(!p.steps.some(([l]) => l.startsWith('macOS')));
    assert.match(p.warnings.join('\n'), /macOS app was not built/);
  });

  test('reads its paths from the desktop workflow, and matches them as GitHub does', () => {
    const paths = desktopPaths();
    assert.ok(paths.includes('packages/app/**'));
    assert.ok(paths.includes('.github/workflows/desktop-app.yml'));
    assert.ok(matches('packages/core/src/**', 'packages/core/src/a/b.ts'));
    assert.ok(!matches('packages/core/src/**', 'packages/core/test/a.js'));
    assert.ok(matches('scripts/desktop-build.mjs', 'scripts/desktop-build.mjs'));
    assert.ok(!matches('scripts/desktop-build.mjs', 'scripts/desktop-buildXmjs'));
  });

  test('is the hook git runs', () => {
    assert.match(read('.githooks/pre-push'), /node scripts\/pre-push\.mjs/);
  });

  test('finds Rust and the Tauri tool where rustup and cargo install them, when they are there', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoughtknot-hook-'));
    try {
      mkdirSync(join(dir, '.cargo', 'bin'), { recursive: true });
      // the hook up to the line that starts node, then its PATH
      const head = read('.githooks/pre-push').replace(/^exec node .*$/m, 'echo "$PATH"');
      const run = (home) =>
        spawnSync('sh', ['-c', head], { env: { HOME: home, PATH: '/usr/bin:/bin' }, encoding: 'utf8' }).stdout.split(
          ':',
        );
      assert.ok(run(dir).includes(join(dir, '.cargo', 'bin')), 'cargo’s own folder, when it is there');
      assert.ok(!run(join(dir, 'none')).includes(join(dir, 'none', '.cargo', 'bin')), 'and not when it is not');
      if (existsSync('/opt/homebrew/opt/rustup/bin')) assert.ok(run(dir).includes('/opt/homebrew/opt/rustup/bin'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runner minutes on GitHub', () => {
  const desktop = read('.github/workflows/desktop-app.yml');
  const mobile = read('.github/workflows/mobile-app.yml');
  // a pull request's own run: the nightly, called when a wave's pull request closes, is not one
  const PR_RUN = /contains\(fromJSON\('\["opened","synchronize","reopened"\]'\), github\.event\.action\)/;

  test('a pull request builds the desktop app on Linux alone; main and the nightly build every system', () => {
    const build = jobs(desktop).build.join('\n');
    const os = build.match(/^ {8}os: (.+)$/m)[1];
    assert.match(os, PR_RUN);
    assert.match(os, /fromJSON\('\["ubuntu-24\.04"\]'\)/);
    assert.match(os, /fromJSON\('\["ubuntu-24\.04","macos-latest","windows-latest"\]'\)/);
  });

  test('the iOS simulator app is built off pull requests only', () => {
    const ios = jobs(mobile)['ios-simulator'].join('\n');
    assert.match(ios.match(/^ {4}if: (.+)$/m)[1], new RegExp(`^\\$\\{\\{ !${PR_RUN.source} \\}\\}$`));
  });

  test('the app builds run for a change to what they build, the packages manifest and lock, or their workflow', () => {
    for (const [text, own] of [
      [desktop, '.github/workflows/desktop-app.yml'],
      [mobile, '.github/workflows/mobile-app.yml'],
    ]) {
      for (const key of ['push', 'pull_request']) {
        const paths = text.split(new RegExp(`\\n {2}${key}:\\n`))[1].match(/^ {4}paths:\n((?: {6}- .*\n)+)/m)[1];
        for (const p of ["'packages/app/**'", "'package.json'", "'package-lock.json'", `'${own}'`])
          assert.ok(paths.includes(`- ${p}`), `${own} ${key}: ${p}`);
        assert.doesNotMatch(paths, /docs|wiki|\.md'/, 'words alone build nothing');
      }
      assert.match(text, /^ {4}tags: \['\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+'\]$/m, 'a release tag builds every system');
    }
  });

  test('a newer push cancels a pull request’s older app build, and nothing on main or the nightly is ever cancelled', () => {
    for (const text of [desktop, mobile])
      assert.match(text, /^ {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m);
    for (const f of ['dependency-review', 'dependabot-merge', 'lock-conversations']) {
      const text = read(`.github/workflows/${f}.yml`);
      assert.match(
        text,
        new RegExp(
          `^ {2}group: ${f}-\\$\\{\\{ github\\.event\\.pull_request\\.number \\|\\| github\\.run_id \\}\\}$`,
          'm',
        ),
      );
      assert.match(text, /^ {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m);
    }
    assert.match(read('.github/workflows/stuck-prs.yml'), /^ {2}cancel-in-progress: false$/m);
  });

  test('the build status runs for the checks of a pull request alone, and skips a run that was cancelled', () => {
    const update = jobs(read('.github/workflows/build-status.yml')).update.join('\n');
    assert.match(
      update,
      /github\.event_name != 'workflow_run'\n\s+\|\| \(github\.event\.workflow_run\.event == 'pull_request' && github\.event\.workflow_run\.conclusion != 'cancelled'\)/,
    );
  });
});
