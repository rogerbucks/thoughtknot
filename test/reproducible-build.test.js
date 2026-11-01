// SEC-6 (security_fix_rule): the store assets are the same however often they are built. The release and its dry run
// build twice, in clean checkouts. They fail when main.js, styles.css or the libraries' archive differ. The archive is
// the release's own step. The builds themselves run in the workflows, with the network npm ci needs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS, archiveCommand, differing } from '../scripts/reproducible-build.mjs';
import { block, jobs, read, runCommands } from './repository/repo.js';

describe('a reproducible build', () => {
  test('compares the store assets and the libraries’ archive, and names each that differs or is missing', () => {
    assert.deepEqual(ASSETS.slice(0, 2), ['main.js', 'styles.css']);
    assert.match(ASSETS[2], /^graph-spec-libraries-.*\.tar\.gz$/);
    const same = Object.fromEntries(ASSETS.map((f) => [f, 'a']));
    assert.deepEqual(differing(same, { ...same }), []);
    assert.deepEqual(differing(same, { ...same, 'main.js': 'b' }), ['main.js']);
    assert.deepEqual(differing(same, { 'main.js': 'a', 'styles.css': 'a' }), [ASSETS[2]]);
  });

  test('archives the libraries with the release’s own command, read from release.yml', () => {
    const cmd = archiveCommand(read('.github/workflows/release.yml'));
    assert.match(cmd, /^git archive --format=tar\.gz -o "graph-spec-libraries-\$GITHUB_REF_NAME\.tar\.gz"/);
    assert.ok(runCommands(read('.github/workflows/release.yml')).includes(cmd));
    assert.throws(() => archiveCommand('jobs: {}'), /no step that archives/);
  });

  test('runs before every release, which waits for it, and in the release check run by hand', () => {
    const release = jobs(read('.github/workflows/release.yml'));
    const run = 'node scripts/reproducible-build.mjs';
    assert.ok(runCommands(release.reproducible.join('\n')).includes(run));
    assert.match(block(release.release, 'needs', 4).join('\n'), /\breproducible\b/);
    assert.ok(runCommands(jobs(read('.github/workflows/release-check.yml')).reproducible.join('\n')).includes(run));
  });

  test('is documented so anyone can rebuild a tag and compare it', () => {
    assert.match(read('RELEASING.md'), /node scripts\/reproducible-build\.mjs/);
  });
});
