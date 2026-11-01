#!/usr/bin/env node
// The store assets are the same however often they are built (SEC-6). Only then can anyone confirm the store's main.js
// matches the source. So the release and its dry run build twice, in two clean checkouts of one commit. They fail when
// main.js, styles.css or the libraries' archive differ by a byte.
// The archive is made by the release's own step, read from release.yml, so the two can never drift apart.
//
// Usage:
//   node scripts/reproducible-build.mjs [REF]   build REF (HEAD when none) twice and compare; exit 1 on a difference.
// Each build installs with npm ci, so it needs the network the release has. The checkouts are removed afterwards.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The name the archive is given here, in place of the release's version. */
export const VERSION = 'reproducible';
/** The files compared: the store assets and the libraries' archive. */
export const ASSETS = ['main.js', 'styles.css', `graph-spec-libraries-${VERSION}.tar.gz`];

/** The release's command that archives the graph-spec libraries, read from the text of release.yml. */
export function archiveCommand(workflow) {
  const line = workflow
    .split('\n')
    .map((l) =>
      /^\s*run:\s*(git archive --format=tar\.gz -o "graph-spec-libraries-\$GITHUB_REF_NAME\.tar\.gz".*)$/.exec(l),
    )
    .find(Boolean);
  if (!line) throw new Error('release.yml has no step that archives the graph-spec libraries');
  return line[1];
}

/** The assets whose digests differ between two builds, or are missing from either. */
export function differing(a, b) {
  return ASSETS.filter((f) => !a[f] || !b[f] || a[f] !== b[f]);
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Installs and builds in `dir` as the release does, then returns each asset's digest. */
function build(dir, archive) {
  const run = (cmd, args, env = {}) =>
    execFileSync(cmd, args, { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...env } });
  run('npm', ['ci', '--no-audit', '--no-fund']);
  run('npm', ['run', 'build']);
  run('npm', ['run', 'build:layout']);
  run('bash', ['-c', archive], { GITHUB_REF_NAME: VERSION });
  return Object.fromEntries(ASSETS.map((f) => [f, sha256(join(dir, f))]));
}

function main(argv) {
  const ref = argv[0] ?? 'HEAD';
  const archive = archiveCommand(readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8'));
  const base = mkdtempSync(join(tmpdir(), 'reproducible-'));
  const dirs = ['first', 'second'].map((n) => join(base, n));
  const sums = [];
  try {
    for (const dir of dirs) {
      execFileSync('git', ['worktree', 'add', '--quiet', '--detach', dir, ref], { cwd: ROOT, stdio: 'inherit' });
      sums.push(build(dir, archive));
    }
  } finally {
    for (const dir of dirs) {
      try {
        execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, stdio: 'ignore' });
      } catch {
        // a checkout never made has nothing to remove
      }
    }
    rmSync(base, { recursive: true, force: true });
  }
  for (const f of ASSETS) console.log(`${sums[0][f] === sums[1][f] ? '✓' : '✗'} ${f} ${sums[0][f]}`);
  const differ = differing(sums[0], sums[1]);
  if (differ.length) {
    console.error(`Two builds of ${ref} differ: ${differ.join(', ')}. The build is not reproducible.`);
    return 1;
  }
  console.log(`Two clean builds of ${ref} are byte for byte the same.`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
