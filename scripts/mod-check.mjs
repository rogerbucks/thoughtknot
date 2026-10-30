#!/usr/bin/env node
// CODE-4: checks the /graph mod (packages/claude-code/mod) with the Claude Code CLI, which is the only thing that can
// load its hooks. It builds the mod's bundles, which are not committed, then runs `claude plugin validate` and
// `claude plugin test` on it. The release check runs it with --require. A missing CLI then fails the release at once,
// so a broken hook cannot ship because someone forgot the manual check.
//
// Usage:
//   node scripts/mod-check.mjs             check the mod; skip, with a note, when the CLI is not installed.
//   node scripts/mod-check.mjs --require   the same, but a missing CLI is a failure.
//   --claude <command>                     the CLI to run instead of `claude`.
//   --no-build                             skip the build, for a mod that is already built.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MOD = 'packages/claude-code/mod';

/** Runs a command to its end, with its output shown. True when it exited 0. */
function run(cmd, args, cwd = ROOT) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  return r.status === 0;
}

/** True when the command can be started at all. */
export function installed(cmd) {
  const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

/**
 * The steps that failed, as words; an empty list means the mod is fine. `skipped` is true when the CLI was absent and
 * that was allowed.
 */
export function checkMod({ claude = 'claude', require = false, build = true, root = ROOT } = {}) {
  if (!installed(claude)) {
    return require
      ? { problems: [`the Claude Code CLI (\`${claude}\`) is not installed, and this check needs it`], skipped: false }
      : { problems: [], skipped: true };
  }
  const problems = [];
  if (build && !run('npm', ['run', 'build', '--workspace', '@thoughtknot/claude-code'], root)) {
    problems.push('the mod did not build');
    return { problems, skipped: false };
  }
  if (!run(claude, ['plugin', 'validate', MOD], root)) problems.push('`claude plugin validate` failed');
  if (!run(claude, ['plugin', 'test', MOD], root)) problems.push('`claude plugin test` failed');
  return { problems, skipped: false };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--claude');
  const { problems, skipped } = checkMod({
    claude: at >= 0 ? args[at + 1] : 'claude',
    require: args.includes('--require'),
    build: !args.includes('--no-build'),
  });
  if (skipped) console.log('mod-check: the Claude Code CLI is not installed, so the mod was not checked here.');
  for (const p of problems) console.error(`mod-check: ${p}`);
  process.exit(problems.length ? 1 : 0);
}
