// The blobs of a repository's history, read a group at a time (scripts/history-blobs.mjs). So the history check's
// memory stays bounded, however long the history grows.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { READ_MOST, blobGroups, historyBlobs } from '../scripts/history-blobs.mjs';

const dir = mkdtempSync(join(tmpdir(), 'history-blobs-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
g('init', '-q', '-b', 'main');
g('config', 'user.name', 'Some One');
g('config', 'user.email', '1234+someone@users.noreply.github.com');
const sizes = { 'a.txt': 10, 'b.txt': 20, 'c.txt': 30 };
for (const [file, n] of Object.entries(sizes)) {
  writeFileSync(join(dir, file), 'x'.repeat(n));
  g('add', '.');
  g('commit', '-q', '-m', `Add ${file}`);
}
const objects = g('rev-list', '--objects', 'HEAD')
  .split('\n')
  .filter(Boolean)
  .map((l) => l.split(' ')[0]);

test('only blobs are read, never the trees or commits', () => {
  const read = [...historyBlobs(dir, objects)];
  assert.equal(read.length, 3);
  assert.deepEqual(
    read.map((b) => b.body.length).sort((p, q) => p - q),
    [10, 20, 30],
  );
});

test('the blobs come in groups no larger than asked, and a larger one in a group of its own', () => {
  const groups = blobGroups(dir, objects, 25);
  assert.equal(groups.flat().length, 3, 'every blob is in a group');
  assert.ok(groups.length >= 2, 'more than one group');
  assert.deepEqual([...historyBlobs(dir, objects, 25)].length, 3, 'read a group at a time, each blob once');
  assert.equal(blobGroups(dir, objects).length, 1, 'by default, a small history is one group');
  assert.ok(READ_MOST <= 128_000_000, 'a group is held to a bounded size');
});
