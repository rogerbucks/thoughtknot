// A stand-in for GitHub as a host reaches it with its own sign-in, for the tests of graphs kept in a repository
// (editor spec §48). The storage contract's run uses it too (test/storage-contract.test.js).
import { createHash } from 'node:crypto';

/** Git's blob id of a text, as GitHub gives it. */
export const blobSha = (text) => {
  const bytes = Buffer.from(text, 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
};

/**
 * A stand-in for GitHub, reached as a host reaches it with its own sign-in: branches of files in memory, each put a
 * commit. `calls` keeps every call made, and `commits` every commit by branch.
 */
export function fakeGitHub(seed = {}) {
  const branches = new Map(),
    calls = [],
    commits = [],
    pulls = [];
  const on = (repo, branch) => {
    const key = `${repo}@${branch}`;
    if (!branches.has(key)) branches.set(key, new Map(Object.entries(seed)));
    return branches.get(key);
  };
  return {
    calls,
    commits,
    pulls,
    branch: on,
    files: async (repo, branch) => {
      calls.push(['files', repo, branch]);
      return [...on(repo, branch)].map(([path, text]) => ({ path, sha: blobSha(text) }));
    },
    read: async (repo, branch, path) => {
      calls.push(['read', repo, branch, path]);
      const text = on(repo, branch).get(path);
      return text === undefined ? null : { text, sha: blobSha(text) };
    },
    put: async (repo, branch, change) => {
      calls.push(['put', repo, branch, change.path]);
      const files = on(repo, branch);
      const now = files.has(change.path) ? blobSha(files.get(change.path)) : null;
      if (now !== change.sha) return { ok: false, conflict: true };
      if (change.text === null) files.delete(change.path);
      else files.set(change.path, change.text);
      commits.push({ repo, branch, ...change });
      return { ok: true, sha: change.text === null ? null : blobSha(change.text) };
    },
    pull: async (repo, pull) => {
      calls.push(['pull', repo, pull.head, pull.base]);
      pulls.push({ repo, ...pull });
      return { number: pulls.length, url: `https://github.com/${repo}/pull/${pulls.length}` };
    },
  };
}

/** A store on `notes` of `ada/graphs`, picked, with every change let go, unless `over` says otherwise. */
export function repoOptions(host, over = {}) {
  return {
    host,
    repo: 'ada/graphs',
    picked: ['ada/graphs'],
    branch: 'notes',
    mainBranch: 'main',
    confirm: () => true,
    levels: ['Public', 'Internal', 'Secret'],
    allowed: 'Internal',
    unlabelled: 'Internal',
    ...over,
  };
}
