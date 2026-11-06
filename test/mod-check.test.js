// Requirement: security_policy (spec §13).
// CODE-4: the /graph mod is checked by the Claude Code CLI, and the release check fails when that CLI is missing.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkMod } from '../scripts/mod-check.mjs';
import { read } from './repository/repo.js';

const made = [];
/** A stand-in CLI: answers --version, and fails the plugin subcommand named in `failing`. */
function fakeCli(failing = '') {
  const dir = mkdtempSync(join(tmpdir(), 'mod-check-'));
  made.push(dir);
  const file = join(dir, 'fake-claude');
  writeFileSync(file, `#!/bin/sh\n[ -n "${failing}" ] && [ "$2" = "${failing}" ] && exit 1\nexit 0\n`);
  chmodSync(file, 0o755);
  return file;
}
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

const missing = '/nonexistent/claude';
const NO_STAND_IN = process.platform === 'win32' && 'Windows runs the stand-in CLI, a script, only through a shell';

describe('mod-check', () => {
  test('passes when validate and test both pass', { skip: NO_STAND_IN }, () => {
    assert.deepEqual(checkMod({ claude: fakeCli(), build: false }), { problems: [], skipped: false });
  });
  test('names each step that failed', { skip: NO_STAND_IN }, () => {
    const v = checkMod({ claude: fakeCli('validate'), build: false });
    assert.equal(v.problems.length, 1);
    assert.match(v.problems[0], /validate/);
    const t = checkMod({ claude: fakeCli('test'), build: false });
    assert.match(t.problems[0], /test/);
  });
  test('a missing CLI is skipped by default', () => {
    assert.deepEqual(checkMod({ claude: missing }), { problems: [], skipped: true });
  });
  test('a missing CLI fails when it is required', () => {
    const r = checkMod({ claude: missing, require: true });
    assert.equal(r.skipped, false);
    assert.match(r.problems[0], /not installed/);
  });
  test('the release check requires it, with a pinned CLI', () => {
    const yml = read('.github/workflows/release-check.yml');
    assert.match(yml, /node scripts\/mod-check\.mjs --require/);
    assert.match(yml, /npm ci --prefix tools\/claude-cli/);
    assert.match(read('tools/claude-cli/package.json'), /"@anthropic-ai\/claude-code": "\d+\.\d+\.\d+"/);
  });
  test("the mod's types contract names every state key the mod stores", () => {
    const keys = [
      ...read('packages/claude-code/mod/hooks/register.tsx').matchAll(/plugin: 'thoughtknot', key: '(\w+)'/g),
    ];
    assert.ok(keys.length >= 3);
    for (const [, key] of keys)
      assert.match(read('packages/claude-code/mod/types/index.d.ts'), new RegExp(`\\b${key}:`));
  });
});
