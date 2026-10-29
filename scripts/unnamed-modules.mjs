#!/usr/bin/env node
// The guard on core modules with no test of their own (spec §13, test_conventions: CODE-7). A module reached only
// through other modules' tests has its lines run, but its answers never asserted, so a wrong branch in it can pass.
//
// A module of the core (packages/core/src) has a test of its own when a test file is named after it. CONTRIBUTING.md
// names them so: `zoom.ts` by `zoom.test.js` or `zoom-limits.test.js`. The test sits in the core's tests. For a module
// of the display layer it may sit in the Obsidian plugin's tests, which draw with it.
//
// Those of more than 100 lines with none are held in test/unnamed-modules.json, a ratchet. Any other module of more than
// 100 lines with no test of its own fails: a new one, or one that grew. One on the list that gains its test, or goes,
// fails too until the list is lowered with --tighten. So the list is worked down and never grows. A module of 100 lines
// or fewer may go without one.
//
// Usage: node scripts/unnamed-modules.mjs            lists each module to add to or take off the list; exits 1 if any.
//        node scripts/unnamed-modules.mjs --tighten  takes off the list each module that has its test now or is gone.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ALLOWANCE = 'test/unnamed-modules.json';
/** The most lines a new module may have and still go without a test of its own. */
export const MOST_LINES = 100;

const name = (file) => basename(file).replace(/\.(test\.)?(ts|tsx|js|mjs)$/, '');

/** Whether a test file is named after module `m`: the same name, or that name and a dash. */
const namedFor = (m, tests) => tests.some((t) => t === m || t.startsWith(`${m}-`));

/**
 * The core modules with no test of their own, as {file, lines}. They are read from the core's files ({file: text}) and
 * the test files of the core and of the plugin.
 */
export function unnamedModules(modules, { core, plugin }) {
  const coreTests = core.map(name),
    pluginTests = plugin.map(name);
  return Object.entries(modules)
    .filter(([file]) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts'))
    .filter(([file]) => {
      const m = name(file);
      if (namedFor(m, coreTests)) return false;
      return !(file.startsWith('packages/core/src/display/') && namedFor(m, pluginTests));
    })
    .map(([file, text]) => ({ file, lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0) }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

/** The modules to add to the list, new and long with no test (`over`), and those to take off it (`under`). */
export function compareAllowance(found, allowance) {
  const listed = new Set(allowance),
    unnamed = new Set(found.map((f) => f.file));
  return [
    ...found.filter((f) => !listed.has(f.file) && f.lines > MOST_LINES).map((f) => ({ ...f, over: true })),
    ...allowance.filter((file) => !unnamed.has(file)).map((file) => ({ file, over: false })),
  ].sort((a, b) => a.file.localeCompare(b.file));
}

/** The list with each module that now has its test, or is gone, taken off; nothing is ever added. */
export const tightened = (found, allowance) => {
  const unnamed = new Set(found.map((f) => f.file));
  return allowance.filter((file) => unnamed.has(file)).sort();
};

const git = () => execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** The core modules of the repository as committed with no test of their own. */
export function repositoryModules() {
  const files = git();
  const tests = (dir) => files.filter((f) => f.startsWith(dir) && /\.test\.(js|mjs)$/.test(f));
  const modules = files.filter((f) => f.startsWith('packages/core/src/'));
  return unnamedModules(Object.fromEntries(modules.map((f) => [f, read(f)])), {
    core: tests('packages/core/test/'),
    plugin: tests('packages/obsidian/test/'),
  });
}

function main(args) {
  const found = repositoryModules(),
    allowance = JSON.parse(read(ALLOWANCE));
  if (args.includes('--tighten')) {
    writeFileSync(join(ROOT, ALLOWANCE), `${JSON.stringify(tightened(found, allowance), null, 2)}\n`);
    return 0;
  }
  const differ = compareAllowance(found, allowance);
  for (const d of differ)
    console.log(
      d.over
        ? `${d.file}: ${d.lines} lines and no test named after it: add one`
        : `${d.file}: has its test now, or is gone: run node scripts/unnamed-modules.mjs --tighten`,
    );
  return differ.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
