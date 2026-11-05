// Sending a note to a GitHub repository from an app (editor spec §48, github_repo_access, github_repo_writes_reviewed).
// - The settings read back safely, and say what is wrong in words.
// - An app may run only the gh calls the repository host makes: the cases in fixtures/gh-calls.json, which the
//   desktop app's Rust reads too.
// - Nothing goes until the user has seen what changes and pressed Send. A note above the allowed level never goes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REPO_BRANCH_DEFAULT,
  askRepoReview,
  ghCallRefusal,
  ghRepoHost,
  outgoingShown,
  repoListFrom,
  repoSettingsFrom,
  repoSettingsProblems,
  sendNoteToRepo,
} from '../src/index.ts';
import { fakeGitHub } from './fake-github.js';

const LEVELS = ['Public', 'Internal', 'Confidential', 'Restricted'];
const CASES = JSON.parse(readFileSync(new URL('./fixtures/gh-calls.json', import.meta.url), 'utf8')).cases;
const settings = (more = {}) => repoSettingsFrom({ repos: ['ada/graphs'], ...more }, LEVELS);
const PUBLIC = '---\nclassification: Public\n---\n# Trip\n';

describe('the settings an app keeps', () => {
  test('read back with safe defaults: no repository, a branch of its own, the lowest level', () => {
    assert.deepEqual(repoSettingsFrom(undefined, LEVELS), {
      repos: [],
      branch: REPO_BRANCH_DEFAULT,
      mainBranch: 'main',
      folder: '',
      allowed: 'Public',
      mainAllowed: false,
    });
    const odd = repoSettingsFrom({ repos: 'ada/graphs', allowed: 'Secret', mainAllowed: 'yes' }, LEVELS);
    assert.deepEqual([odd.repos, odd.allowed, odd.mainAllowed], [[], 'Public', false]);
  });

  test('a typed list of repositories is split, and each said once', () => {
    assert.deepEqual(repoListFrom('ada/graphs, bob/notes\nADA/graphs  '), ['ada/graphs', 'bob/notes']);
  });

  test('each problem is said: no repository, a bad name, a bad branch, main unasked', () => {
    assert.deepEqual(repoSettingsProblems(settings(), LEVELS), []);
    const bad = repoSettingsProblems({ ...settings(), repos: ['nope'], branch: 'main', mainBranch: 'main' }, LEVELS);
    assert.equal(bad.length, 2);
    assert.match(bad[0], /owner\/name/);
    assert.match(bad[1], /main branch/);
    assert.match(repoSettingsProblems({ ...settings(), repos: [] }, LEVELS)[0], /Pick a repository/);
    assert.equal(repoSettingsProblems({ ...settings(), branch: 'main', mainAllowed: true }, LEVELS).length, 0);
  });
});

describe('the gh calls an app may run', () => {
  for (const c of CASES)
    test(`${c.allowed ? 'runs' : 'refuses'}: gh ${c.args.join(' ')}`, () => {
      assert.equal(ghCallRefusal(c.args, c.input) === null, c.allowed);
    });

  test('every call the repository host makes is one of them', async () => {
    const seen = [];
    const files = new Map();
    const run = async (args, input) => {
      seen.push([args, input]);
      const [, , , , method, address] = args;
      if (address.includes('/git/ref/heads/'))
        return { code: 0, stdout: JSON.stringify({ object: { sha: 'a'.repeat(40) } }), stderr: '' };
      if (address.includes('/git/trees/')) return { code: 0, stdout: '{"tree":[]}', stderr: '' };
      if (method === 'GET')
        return files.has(address)
          ? { code: 0, stdout: files.get(address), stderr: '' }
          : { code: 1, stdout: '', stderr: 'HTTP 404' };
      if (address.endsWith('/pulls'))
        return { code: 0, stdout: '{"number":7,"html_url":"https://github.com/ada/graphs/pull/7"}', stderr: '' };
      return { code: 0, stdout: JSON.stringify({ content: { sha: 'b'.repeat(40) } }), stderr: '' };
    };
    const host = ghRepoHost(run, 'main');
    const o = {
      host,
      settings: settings(),
      repo: 'ada/graphs',
      levels: LEVELS,
      unlabelled: 'Restricted',
      show: async () => true,
    };
    assert.equal((await sendNoteToRepo(o, 'Trip notes/My trip.md', PUBLIC)).ok, true);
    assert.equal((await askRepoReview(o, 'Graphs')).ok, true);
    assert.ok(seen.length >= 4);
    for (const [args, input] of seen)
      assert.equal(ghCallRefusal(args, input ?? null, ['ada/graphs']), null, args.join(' '));
  });

  test('with the picked list, another repository is refused by name', () => {
    const args = ['api', '--hostname', 'github.com', '--method', 'GET', 'repos/eve/other/git/ref/heads/main'];
    assert.equal(ghCallRefusal(args, null, ['Ada/Graphs', 'eve/other']), null);
    assert.match(ghCallRefusal(args, null, ['ada/graphs']), /eve\/other is not one you picked/);
  });

  test('a body past the most is refused', () => {
    const args = [
      'api',
      '--hostname',
      'github.com',
      '--method',
      'PUT',
      'repos/ada/graphs/contents/a.md',
      '--input',
      '-',
    ];
    assert.notEqual(ghCallRefusal(args, 'x'.repeat(8 * 1024 * 1024 + 1)), null);
  });
});

describe('a note sent: shown first, sent only on yes', () => {
  const sending = (gh, more = {}) => {
    const shown = [];
    const o = {
      host: gh,
      settings: settings(),
      repo: 'ada/graphs',
      levels: LEVELS,
      unlabelled: 'Restricted',
      show: async (s) => (shown.push(s), more.answer ?? true),
      ...more,
    };
    return { o, shown };
  };

  test('the screen says where it goes and every line that changes; Send writes it on the branch', async () => {
    const gh = fakeGitHub({ 'a.md': '---\nclassification: Public\n---\n# Old\n' });
    const { o, shown } = sending(gh);
    const done = await sendNoteToRepo(o, 'a.md', PUBLIC);
    assert.equal(done.ok, true);
    assert.match(done.message, /thoughtknot\/graphs of ada\/graphs/);
    assert.equal(shown.length, 1);
    assert.equal(shown[0].title, 'Send this change to GitHub?');
    assert.deepEqual(Object.fromEntries(shown[0].rows), {
      Repository: 'ada/graphs',
      Branch: 'thoughtknot/graphs',
      File: 'a.md',
      'Commit message': 'Change a.md',
    });
    assert.deepEqual(
      shown[0].diff.filter((l) => l.kind !== 'keep').map((l) => `${l.kind} ${l.text}`),
      ['remove # Old', 'add # Trip'],
    );
    assert.equal(gh.branch('ada/graphs', 'thoughtknot/graphs').get('a.md'), PUBLIC);
  });

  test('Cancel sends nothing', async () => {
    const gh = fakeGitHub();
    const { o } = sending(gh, { answer: false });
    const done = await sendNoteToRepo(o, 'a.md', PUBLIC);
    assert.equal(done.ok, false);
    assert.match(done.reason, /chose not to send/);
    assert.equal(gh.commits.length, 0);
  });

  test('a note above the allowed level, or holding a key, is refused before anything is shown', async () => {
    for (const text of [
      '---\nclassification: Confidential\n---\n# x\n',
      '# x\n',
      `---\nclassification: Public\n---\n${['gh', 'p_'].join('')}${'A'.repeat(36)}\n`,
    ]) {
      const gh = fakeGitHub();
      const { o, shown } = sending(gh);
      const done = await sendNoteToRepo(o, 'a.md', text);
      assert.equal(done.ok, false, text);
      assert.equal(shown.length, 0);
      assert.equal(gh.commits.length, 0);
    }
  });

  test('the same text as the repository holds sends nothing, and says so', async () => {
    const gh = fakeGitHub({ 'a.md': PUBLIC });
    const { o, shown } = sending(gh);
    const done = await sendNoteToRepo(o, 'a.md', PUBLIC);
    assert.deepEqual([done.ok, shown.length], [false, 0]);
    assert.match(done.reason, /Nothing to send/);
  });

  test('a new note says so in its question', () => {
    const shown = outgoingShown(
      { repo: 'ada/graphs', branch: 'b', change: { path: 'n.md', text: 'one\ntwo\n', sha: null, message: 'Add n.md' } },
      null,
    );
    assert.equal(shown.title, 'Send this new note to GitHub?');
    assert.equal(shown.count, 2);
  });

  test('a review asked for shows its branches and title, and opens only on yes', async () => {
    const gh = fakeGitHub();
    const { o, shown } = sending(gh);
    const done = await askRepoReview(o, 'Graphs for the trip');
    assert.equal(done.ok, true);
    assert.deepEqual(Object.fromEntries(shown[0].rows), {
      Repository: 'ada/graphs',
      'From branch': 'thoughtknot/graphs',
      'Into branch': 'main',
      Title: 'Graphs for the trip',
    });
    const no = sending(fakeGitHub(), { answer: false });
    assert.equal((await askRepoReview(no.o, 'x')).ok, false);
  });
});
