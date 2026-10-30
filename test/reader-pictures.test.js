// The command line that brings the pictures for readers up to date in a folder (editor spec §62,
// picture_outside_tools). It writes each picture and image line a note needs. Its check writes nothing, and fails while
// one is out of date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/reader-pictures.mjs', import.meta.url));
const NOTE =
  "# Team\n\n```gql\n// graph: team\n(ann:Person {name: 'Ann'}),\n(bob:Person {name: 'Bob'}),\n(ann)-[:ASKS]->(bob)\n```\n";

/** Runs the command line on `dir` with `args`: its exit code and what it said. */
const cli = (dir, ...args) => {
  const r = spawnSync(process.execPath, [SCRIPT, dir, ...args], { encoding: 'utf8' });
  return { code: r.status, said: r.stdout + r.stderr };
};

// proves: picture_outside_tools
test('the command line refreshes every out-of-date picture in a folder, and its check fails on one left out of date', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'thoughtknot-pictures-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'Work'));
  const note = join(dir, 'Work', 'Team.md'),
    picture = join(dir, 'Work', 'Team.team.thoughtknot.svg');
  writeFileSync(note, NOTE);
  assert.equal(cli(dir, '--check').code, 0, 'no picture line: nothing is out of date');
  assert.equal(cli(dir, '--add').code, 0);
  assert.ok(existsSync(picture));
  assert.match(readFileSync(note, 'utf8'), /\]\(Team\.team\.thoughtknot\.svg\)/);
  assert.equal(cli(dir, '--check').code, 0, 'in step');
  writeFileSync(note, readFileSync(note, 'utf8').replace("'Bob'", "'Robert'"));
  const checked = cli(dir, '--check');
  assert.equal(checked.code, 1, 'the check fails');
  assert.match(checked.said, /out of date: Work\/Team\.team\.thoughtknot\.svg/);
  assert.doesNotMatch(readFileSync(picture, 'utf8'), /Robert/, 'and writes nothing');
  assert.equal(cli(dir).code, 0);
  assert.match(readFileSync(picture, 'utf8'), /Robert/);
  assert.equal(cli(dir, '--check').code, 0);
});
