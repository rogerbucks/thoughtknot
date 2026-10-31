// OPS-14: versions.json lists only versions that were released. Obsidian reads it to pick a compatible release, so an
// entry with no release behind it points to nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const read = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const compare = (a, b) =>
  a
    .split('.')
    .map(Number)
    .reduce((d, n, i) => d || n - Number(b.split('.')[i]), 0);

test('the newest version in versions.json is the one in manifest.json', () => {
  const newest = Object.keys(read('versions.json')).sort(compare).at(-1);
  assert.equal(newest, read('manifest.json').version);
});

test('every version before the manifest’s has a git tag, when tags are present', (t) => {
  const tags = execFileSync('git', ['tag', '--list'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  if (!tags.length) return t.skip('no tags in this clone');
  const current = read('manifest.json').version;
  const missing = Object.keys(read('versions.json')).filter((v) => v !== current && !tags.includes(v));
  assert.deepEqual(missing, [], 'versions.json lists a version that was never tagged');
});
