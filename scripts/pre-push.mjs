#!/usr/bin/env node
// The checks a push runs on the laptop first, so GitHub's runners do less (Roger, 7 Nov 2026). git runs it as the
// pre-push hook (.githooks/pre-push) once `git config core.hooksPath .githooks` is set, as the README says.
//
// It runs what CI's lint and test jobs run, on the change alone. That is the build, the lint, the type check and the
// tests the change reaches (scripts/changed-tests.mjs). On a Mac, a change the desktop app's workflow would build also builds the
// macOS app, unsigned. Pull requests no longer build macOS on GitHub; main and the nightly still do, so CI stays the
// gate for main. A check that fails stops the push.
//
// The macOS build needs Rust and the Tauri tool. Where they are missing it says so, loudly, and does not stop the push:
// main's run builds macOS either way.
//
// In an emergency, skip it: `git push --no-verify`, or THOUGHTKNOT_SKIP_PRE_PUSH=1 for a tool that cannot pass the flag.
//
// Usage: git runs it, with the refs being pushed on stdin.
//        node scripts/pre-push.mjs --list [<path>…]   only print the plan, for these paths or the change since main.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEYS } from './desktop-build.mjs';
import { withoutGitHookEnv } from './git-env.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ZERO = /^0+$/;

/**
 * A change that reaches everything runs the whole suite in CI's six parts, one after another, three test files at a
 * time. The browser tests drive the Mac's own Chrome, which takes far more memory than CI's. Run whole, the suite went
 * over run-ceiling's 4 GB on a 10-core Mac (7 Nov 2026). Three files at a time, a part took about two and a half minutes.
 */
export const SUITE_SHARDS = 6;
export const SUITE_CONCURRENCY = 3;
/**
 * The memory ceiling, in MB, of each part. It is the 8192 CI's workflow gives each of its machines. run-ceiling's
 * default of 4096 was too little on the Mac: a part reached 4.6 GB with Chrome's pages open (7 Nov 2026). A part over
 * 8 GB is a leak to chase, not a ceiling to raise.
 */
export const SUITE_MEMORY_MB = '8192';

/** The paths that wake the desktop app's workflow, read from it, so the two never drift apart. */
export function desktopPaths(workflow = readFileSync(join(ROOT, '.github/workflows/desktop-app.yml'), 'utf8')) {
  const pr = workflow.split(/\n {2}pull_request:\n/)[1] ?? '';
  // the list under the pull request's `paths:`, up to the first line that is not one of its items
  const block = (pr.match(/^ {4}paths:\n((?: {6}- .*\n)+)/m) ?? [])[1] ?? '';
  return [...block.matchAll(/^ {6}- '([^']+)'$/gm)].map((m) => m[1]);
}

/** True when `file` matches the glob `pattern`, as GitHub reads a paths filter: `**` crosses folders, `*` does not. */
export function matches(pattern, file) {
  const re = pattern
    .split('**')
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
    .join('.*');
  return new RegExp(`^${re}$`).test(file);
}

/**
 * What the hook runs for a change to `files`, pushed from `platform` (as process.platform names it), measured from
 * `base`. Each step is [label, command, ...args]. `cargo` says whether Rust and the Tauri tool are installed.
 */
export function prePushPlan({ files, platform, base, cargo, whole = false, paths = desktopPaths() }) {
  const steps = [
    ['build', 'npm', 'run', 'build'],
    ['lint', 'npm', 'run', 'lint'],
    ['type check', 'npm', 'run', 'typecheck'],
    ...(whole
      ? Array.from({ length: SUITE_SHARDS }, (_, i) => [
          `the whole suite, part ${i + 1} of ${SUITE_SHARDS}`,
          'npm',
          'run',
          'test:ai',
          '--',
          `--test-concurrency=${SUITE_CONCURRENCY}`,
          `--test-shard=${i + 1}/${SUITE_SHARDS}`,
        ])
      : [['tests the change reaches', 'npm', 'run', 'test:changed', '--', '--base', base]]),
  ];
  if (whole && files.some((f) => f.startsWith('python/'))) steps.push(['Python tests', 'npm', 'run', 'test:ai:py']);
  const warnings = [];
  const desktop = files.some((f) => paths.some((p) => matches(p, f)));
  if (desktop && platform === 'darwin') {
    if (cargo) {
      steps.push(
        ['macOS app: compile', 'node', 'scripts/desktop-build.mjs', 'compile'],
        // the .app alone: a disk image needs Finder scripted, and that waits on a prompt
        ['macOS app: bundle, unsigned', 'node', 'scripts/desktop-build.mjs', 'bundle', 'app'],
      );
    } else {
      warnings.push(
        'The macOS app was not built: Rust or the Tauri tool is missing (`cargo tauri --version`). ' +
          'Main still builds it on GitHub. docs/app-signing.md and the desktop workflow name the versions.',
      );
    }
  }
  return { steps, warnings };
}

/**
 * The environment of the step `label`. git's hook variables are taken out (scripts/git-env.mjs): GIT_DIR from a
 * worktree's push let a test's `git config` in a folder of its own write to the real .git/config (8 Nov 2026). The
 * hook's own git calls keep them. A local build never signs, whatever keys the shell holds.
 */
export function stepEnv(label, env = process.env) {
  const out = withoutGitHookEnv(env);
  for (const k of Object.values(KEYS).flat()) delete out[k];
  if (label.startsWith('the whole suite')) out.THOUGHTKNOT_TEST_MEMORY_MB = SUITE_MEMORY_MB;
  return out;
}

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

/** Where the pushed commits left main, and every file they change. Deleted refs push nothing and are skipped. */
function pushed(stdin) {
  const tips = stdin
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter((f) => f.length === 4 && !ZERO.test(f[1]))
    .map((f) => f[1]);
  let main = 'origin/main';
  try {
    git('rev-parse', '--verify', '--quiet', main);
  } catch {
    main = 'HEAD';
  }
  const files = new Set();
  let base = main;
  for (const tip of tips) {
    base = git('merge-base', main, tip);
    for (const f of git('diff', '--name-only', base, tip).split('\n').filter(Boolean)) files.add(f);
  }
  return { base, files: [...files], any: tips.length > 0 };
}

function hasCargoTauri() {
  return spawnSync('cargo', ['tauri', '--version'], { stdio: 'ignore' }).status === 0;
}

/** Whether changed-tests.mjs would run the whole suite for this change. */
function reachesEverything(base) {
  const out = spawnSync(process.execPath, ['scripts/changed-tests.mjs', '--list', '--base', base], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out.status !== 0 || /^whole suite:/m.test(out.stdout);
}

function main() {
  if (process.env.THOUGHTKNOT_SKIP_PRE_PUSH === '1') {
    console.error('pre-push: skipped (THOUGHTKNOT_SKIP_PRE_PUSH=1). CI still checks the pull request.');
    return 0;
  }
  const args = process.argv.slice(2);
  const list = args[0] === '--list';
  let change;
  if (list && args.length > 1) change = { base: 'origin/main', files: args.slice(1), any: true };
  else if (list) change = pushed(`x ${git('rev-parse', 'HEAD')} x 0`);
  else change = pushed(readFileSync(0, 'utf8'));
  if (!change.any) return 0;

  const plan = prePushPlan({
    ...change,
    platform: process.platform,
    cargo: hasCargoTauri(),
    whole: reachesEverything(change.base),
  });
  if (list) {
    for (const [label, ...cmd] of plan.steps) console.log(`${label}: ${cmd.join(' ')}`);
    for (const w of plan.warnings) console.log(`warning: ${w}`);
    return 0;
  }
  for (const [label, cmd, ...rest] of plan.steps) {
    console.error(`pre-push: ${label}`);
    const r = spawnSync(cmd, rest, { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], env: stepEnv(label) });
    if (r.status !== 0) {
      console.error(`pre-push: ${label} failed, so nothing was pushed. Fix it and push again.`);
      return 1;
    }
  }
  for (const w of plan.warnings) console.error(`pre-push: WARNING: ${w}`);
  console.error('pre-push: every check passed');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
