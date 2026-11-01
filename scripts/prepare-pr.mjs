#!/usr/bin/env node
// FLOW-4: the records a pull request must carry, written or checked in one command.
//
//   npm run prepare-pr           writes them: plain-docs, public-api and the notices, then the tests-first record.
//   npm run prepare-pr -- --check  writes nothing. It runs each record's own check and names every stale one at once.
//
// So a forgotten record is one message, not four failures one push apart. Commit what it changes, with the code it
// belongs to (AGENTS.md).
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Each record: its name, how to write it, how to check it. The tests-first record is last, as it reads the commits. */
export const RECORDS = [
  { name: 'plain-docs', write: ['plain-docs.mjs', '--update'], check: ['plain-docs.mjs'] },
  { name: 'public-api', write: ['public-api.mjs', '--update'], check: ['public-api.mjs'] },
  { name: 'notices', write: ['notices.mjs'], check: ['notices.mjs', '--check'] },
  { name: 'tests-first', write: ['tests-first.mjs', '--update'], check: ['tests-first.mjs', '--complete'] },
];

/** The records whose step failed, by name. `run` takes the script and its arguments and returns its exit status. */
export function prepare({ check = false, run, records = RECORDS } = {}) {
  const failed = [];
  for (const r of records) if (run(...(check ? r.check : r.write)) !== 0) failed.push(r.name);
  return failed;
}

const node = (script, ...args) =>
  spawnSync('node', [join(ROOT, 'scripts', script), ...args], { stdio: 'inherit' }).status;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const failed = prepare({ check, run: node });
  if (failed.length) {
    console.error(
      check
        ? `prepare-pr: out of date: ${failed.join(', ')}. Run npm run prepare-pr and commit what it changes.`
        : `prepare-pr: these steps failed: ${failed.join(', ')}.`,
    );
  } else if (!check) console.log('prepare-pr: done. Commit what changed, with the code it belongs to.');
  process.exit(failed.length ? 1 : 0);
}
