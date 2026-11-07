// A GitHub repository reached through the user's own gh (editor spec §48, github_repo_access). Every call is `gh api`
// on github.com, with fixed arguments and a body on standard input. Changes go only to the chosen branch, started from
// main the first time. The store over it still passes the storage contract.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { githubRepoStorage, ghRepoHost, isBranchName, storageContract } from '../src/index.ts';
import { fromBase64, toBase64 } from '../src/github-repo-gh.ts';
import { blobSha, repoOptions } from './fake-github.js';

const MAIN_SHA = 'a'.repeat(40);

/** A stand-in for gh: it answers the few GitHub API calls the host makes, from branches of files in memory. */
function fakeGh(seed = {}, { truncated = false } = {}) {
  const branches = new Map([['main', new Map(Object.entries(seed))]]);
  const calls = [];
  const ok = (value) => ({ code: 0, stdout: JSON.stringify(value), stderr: '' });
  const status = (n) => ({ code: 1, stdout: '', stderr: `gh: Not Found (HTTP ${n})` });
  const answer = (method, endpoint, body) => {
    const url = new URL(endpoint, 'https://x/');
    const [, , repo1, repo2, area, ...rest] = url.pathname.split('/');
    if (`${repo1}/${repo2}` !== 'ada/graphs') return status(404);
    const tail = rest.map(decodeURIComponent).join('/');
    if (area === 'git' && rest[0] === 'ref') {
      const b = rest.slice(2).join('/');
      return branches.has(b) ? ok({ object: { sha: MAIN_SHA } }) : status(404);
    }
    if (area === 'git' && rest[0] === 'refs' && method === 'POST') {
      branches.set(body.ref.replace('refs/heads/', ''), new Map(branches.get('main')));
      return ok({});
    }
    if (area === 'git' && rest[0] === 'trees') {
      const files = branches.get(rest.slice(1).join('/'));
      if (!files) return status(404);
      const tree = [...files].map(([path, text]) => ({ path, type: 'blob', sha: blobSha(text) }));
      return ok({ tree: [...tree, { path: 'src', type: 'tree', sha: 'b'.repeat(40) }], truncated });
    }
    if (area === 'contents') {
      const files = branches.get(method === 'GET' ? url.searchParams.get('ref') : body.branch);
      if (!files) return status(404);
      const now = files.get(tail);
      if (method === 'GET')
        return now === undefined
          ? status(404)
          : ok({ type: 'file', sha: blobSha(now), content: Buffer.from(now).toString('base64') });
      if ((now === undefined ? undefined : blobSha(now)) !== body.sha) return status(409);
      if (method === 'DELETE') files.delete(tail);
      else files.set(tail, Buffer.from(body.content, 'base64').toString('utf8'));
      return ok(method === 'DELETE' ? { content: null } : { content: { sha: blobSha(files.get(tail)) } });
    }
    if (area === 'pulls' && method === 'POST')
      return ok({ number: 7, html_url: 'https://github.com/ada/graphs/pull/7' });
    return status(404);
  };
  const run = async (args, input) => {
    calls.push({ args: [...args], input });
    const at = args.indexOf('--method');
    return answer(args[at + 1], args[at + 2], input === undefined ? undefined : JSON.parse(input));
  };
  return { run, calls, branches };
}

const store = (gh, over = {}) => githubRepoStorage(repoOptions(ghRepoHost(gh.run, 'main'), over));

describe('notes kept in a GitHub repository through gh pass the storage contract', () => {
  for (const check of storageContract(() => store(fakeGh({ 'src/app.ts': 'code' })), {
    windows: process.platform === 'win32',
  }))
    test(check.name, check.run);
});

describe('gh is called only as asked (github_repo_access)', () => {
  test('every call is gh api on github.com with fixed arguments, and a body only on standard input', async () => {
    const gh = fakeGh({ 'README.md': '# hi' });
    const s = store(gh);
    assert.deepEqual(gh.calls, [], 'nothing until asked');
    await s.write('plan.md', 'the plan, with "quotes" and ünïcödé');
    for (const { args } of gh.calls) {
      assert.deepEqual(args.slice(0, 3), ['api', '--hostname', 'github.com']);
      assert.ok(!args.some((a) => /plan, with|token|Authorization/i.test(a)), 'no text or token in an argument');
    }
    const sent = gh.calls.find((c) => c.args.includes('PUT'));
    assert.deepEqual(JSON.parse(sent.input).branch, 'notes');
    assert.equal((await s.read('plan.md')).text, 'the plan, with "quotes" and ünïcödé');
  });

  test('the branch is started from main the first time, and main itself is never written', async () => {
    const gh = fakeGh({ 'a.md': 'a' });
    const s = store(gh);
    assert.deepEqual(await s.list(), ['a.md'], 'until the branch is started, main’s notes stay in view');
    await s.write('b.md', 'b');
    assert.ok(gh.calls.some((c) => c.args.includes('POST') && JSON.parse(c.input).ref === 'refs/heads/notes'));
    assert.deepEqual([...gh.branches.get('main').keys()], ['a.md']);
    assert.deepEqual([...gh.branches.get('notes').keys()], ['a.md', 'b.md']);
    const host = ghRepoHost(gh.run, 'main');
    await assert.rejects(
      host.put('ada/graphs', 'main', { path: 'c.md', text: 'c', sha: null, message: 'x' }),
      /main branch/,
    );
  });

  test('a repository, branch or path that could reach elsewhere is refused before gh runs', async () => {
    const gh = fakeGh();
    const host = ghRepoHost(gh.run, 'main');
    await assert.rejects(host.files('ada/graphs?x=1', 'notes'), /owner\/name/);
    await assert.rejects(host.files('ada/graphs', '../main'), /branch name/);
    await assert.rejects(host.read('ada/graphs', 'notes', 'a/../b.md'), /path/);
    assert.deepEqual(gh.calls, []);
    for (const bad of ['-x', 'a..b/../c', '.hidden', 'a/', 'x.lock', 'a b', 'a?b'])
      assert.equal(isBranchName(bad), false, bad);
    for (const good of ['notes', 'graphs/2026-11', 'claude/thread-1']) assert.equal(isBranchName(good), true, good);
  });

  test('a pull request is asked for with its body on standard input', async () => {
    const gh = fakeGh();
    const host = ghRepoHost(gh.run, 'main');
    const made = await host.pull('ada/graphs', { head: 'notes', base: 'main', title: 'Plan', body: 'Two graphs.' });
    assert.deepEqual(made, { number: 7, url: 'https://github.com/ada/graphs/pull/7' });
    assert.deepEqual(JSON.parse(gh.calls[0].input), {
      head: 'notes',
      base: 'main',
      title: 'Plan',
      body: 'Two graphs.',
    });
  });

  test('gh failing for any reason but a missing file is said, never taken for an empty repository', async () => {
    const host = ghRepoHost(async () => ({ code: 1, stdout: '', stderr: 'gh: not logged in' }), 'main');
    await assert.rejects(host.files('ada/graphs', 'notes'), /signed in/);
  });
});

test('a text goes to Base64 and back byte for byte, as GitHub keeps it', () => {
  for (const t of ['', 'a', 'ab', 'abc', 'ünïcödé · 漢字 · 😀\r\n', 'trailing  \n\n'])
    assert.equal(fromBase64(toBase64(t)), t, t);
  assert.equal(toBase64('ünï 😀'), Buffer.from('ünï 😀').toString('base64'));
  assert.equal(fromBase64('aGVs\nbG8=\n'), 'hello', 'GitHub breaks its Base64 into lines');
  assert.equal(fromBase64(Buffer.from([0x61, 0xff, 0x62]).toString('base64')), 'a\ufffdb', 'a stray byte is U+FFFD');
});

describe('a repository too large to list whole is never listed short (ARCH-15)', () => {
  test('a listing GitHub cut short is refused with a plain sentence', async () => {
    const s = store(fakeGh({ 'a.md': 'a' }, { truncated: true }));
    await assert.rejects(() => s.list(), /cut this repository’s file list short/);
  });
  test('a complete listing still works', async () => {
    const s = store(fakeGh({ 'a.md': 'a' }));
    assert.deepEqual(await s.list(), ['a.md']);
  });
});
