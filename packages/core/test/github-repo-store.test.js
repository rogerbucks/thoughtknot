// Graphs kept in a GitHub repository (editor spec §48). A saved change becomes a commit on the chosen branch, or a pull
// request. It never lands on the main branch unless the user chose that (github_repo_writes_reviewed). Nothing is
// fetched or sent until asked. Only the picked repositories are reached, and no token is written. A note above the
// classification the repository is allowed is refused with the reason (github_repo_access).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { githubRepoStorage, openRepoReview } from '../src/index.ts';
import { fakeGitHub, repoOptions } from './fake-github.js';

describe('a saved change becomes a commit on the chosen branch, or a pull request (github_repo_writes_reviewed)', () => {
  test('a write is one commit on the chosen branch, and the main branch is left as it was', async () => {
    const gh = fakeGitHub({ 'README.md': '# Graphs\n' });
    const store = githubRepoStorage(repoOptions(gh));
    const made = await store.write('plan.md', '```gql\n(a)-[:TO]->(b)\n```\n', { author: 'ada' });
    assert.equal(made.ok, true);
    assert.deepEqual(
      gh.commits.map((c) => [c.branch, c.path, c.message, c.author]),
      [['notes', 'plan.md', 'Add plan.md', 'ada']],
    );
    assert.equal(gh.branch('ada/graphs', 'main').has('plan.md'), false);
  });

  test('the main branch is refused unless the user said changes may go there', () => {
    const gh = fakeGitHub();
    assert.throws(() => githubRepoStorage(repoOptions(gh, { branch: 'main' })), /main branch/);
    assert.throws(() => githubRepoStorage(repoOptions(gh, { branch: 'MAIN' })), /main branch/);
    assert.deepEqual(gh.calls, []);
    const allowed = githubRepoStorage(repoOptions(gh, { branch: 'main', mainAllowed: true }));
    assert.equal(typeof allowed.write, 'function');
  });

  test('the changes on the branch are asked to merge as a pull request, shown first', async () => {
    const gh = fakeGitHub(),
      shown = [];
    const options = repoOptions(gh, { confirm: (out) => (shown.push(out), true) });
    const done = await openRepoReview(options, 'Plan the launch', 'Two graphs changed.');
    assert.deepEqual(done, { ok: true, number: 1, url: 'https://github.com/ada/graphs/pull/1' });
    assert.deepEqual(gh.pulls, [
      { repo: 'ada/graphs', head: 'notes', base: 'main', title: 'Plan the launch', body: 'Two graphs changed.' },
    ]);
    assert.equal(shown[0].pull.base, 'main');
    const onMain = await openRepoReview({ ...options, branch: 'main', mainAllowed: true }, 'x');
    assert.match(onMain.ok ? '' : onMain.reason, /main branch already/);
    const noPull = await openRepoReview({ ...options, host: { ...gh, pull: undefined } }, 'x');
    assert.match(noPull.ok ? '' : noPull.reason, /cannot open a pull request/);
  });

  test('a change made on GitHub meanwhile is never written over', async () => {
    const gh = fakeGitHub({ 'n.md': 'one' });
    const store = githubRepoStorage(repoOptions(gh));
    const read = await store.read('n.md');
    gh.branch('ada/graphs', 'notes').set('n.md', 'theirs');
    const done = await store.write('n.md', 'mine', { expected: read.version });
    assert.equal(done.ok, false);
    assert.equal(done.current.text, 'theirs');
    assert.equal(gh.commits.length, 0);
  });
});

describe('access: asked first, picked repositories only, no token, classification held (github_repo_access)', () => {
  test('nothing is fetched or sent until a note is listed, read or saved', async () => {
    const gh = fakeGitHub({ 'a.md': 'a' });
    const store = githubRepoStorage(repoOptions(gh));
    assert.deepEqual(gh.calls, []);
    await store.list();
    assert.deepEqual(gh.calls, [['files', 'ada/graphs', 'notes']]);
  });

  test('only the picked repositories are reached: another is refused before the host is asked', () => {
    const gh = fakeGitHub();
    assert.throws(() => githubRepoStorage(repoOptions(gh, { repo: 'bob/other' })), /not one you picked/);
    assert.throws(() => githubRepoStorage(repoOptions(gh, { repo: '../x', picked: ['../x'] })), /owner\/name/);
    assert.deepEqual(gh.calls, []);
  });

  test('what will be sent is shown first, and nothing goes when the user says no', async () => {
    const gh = fakeGitHub(),
      shown = [];
    const store = githubRepoStorage(repoOptions(gh, { confirm: (out) => (shown.push(out), false) }));
    const done = await store.write('n.md', 'the plan');
    assert.match(done.ok ? '' : done.reason, /chose not to send/);
    assert.deepEqual(shown, [
      {
        repo: 'ada/graphs',
        branch: 'notes',
        change: { path: 'n.md', text: 'the plan', sha: null, message: 'Add n.md' },
      },
    ]);
    assert.equal(
      gh.calls.some(([call]) => call === 'put'),
      false,
    );
  });

  test('a note holding a token is refused, and the store takes no token of its own', async () => {
    const gh = fakeGitHub();
    const store = githubRepoStorage(repoOptions(gh));
    // the token is put together as the test runs, so no secrets scan finds one written in the repository
    const done = await store.write('n.md', `key: ${'ghp'}_${'abcdefghij'.repeat(3)}012345\n`);
    assert.match(done.ok ? '' : done.reason, /Take it out of the note first/);
    assert.equal(gh.commits.length, 0);
    for (const key of Object.keys(repoOptions(gh))) assert.doesNotMatch(key, /token|secret|password|key/i);
  });

  test('a note above the classification the repository is allowed is refused with the reason', async () => {
    const gh = fakeGitHub();
    const store = githubRepoStorage(repoOptions(gh, { allowed: 'Public', unlabelled: 'Internal' }));
    const secret = await store.write('s.md', '---\nclassification: Secret\n---\nplan\n');
    assert.match(secret.ok ? '' : secret.reason, /is Secret, and this repository may hold notes up to Public only/);
    const unlabelled = await store.write('u.md', 'plan\n');
    assert.match(unlabelled.ok ? '' : unlabelled.reason, /is Internal/);
    const odd = await store.write('o.md', '---\nclassification: [a, b]\n---\n');
    assert.match(odd.ok ? '' : odd.reason, /cannot be read/);
    assert.equal((await store.write('p.md', '---\nclassification: Public\n---\nplan\n')).ok, true);
    assert.deepEqual(
      gh.commits.map((c) => c.path),
      ['p.md'],
    );
    assert.throws(() => githubRepoStorage(repoOptions(gh, { allowed: 'Top' })), /not one of your classifications/);
  });
});
