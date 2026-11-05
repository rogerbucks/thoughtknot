// A GitHub repository reached through the user's own GitHub command line, gh (editor spec §48, github_repo_access).
// It is the `RepoHost` the desktop app and Obsidian hand to the repository store (github-repo-store.ts). Each host runs
// gh its own way and hands in `run`. The core never starts a program, and never holds a token: gh signs in itself.
// - Every call is `gh api` on github.com, with fixed arguments and no shell.
// - The repository, branch and path are checked before they go into an address, so nothing read becomes a request.
// - Changes go only to the branch the store was given. The main branch is read to start that branch from, and is
//   written only when the user allowed it.
// - A body goes on standard input, never in an argument.
import type { RepoChange, RepoFile, RepoHost, RepoPull, RepoSent } from './github-repo-store.ts';
import { utf8 } from './ai-digest.ts';
import { word } from './words.ts';

/** What gh said: its exit code, and what it wrote. */
export interface GhOutput {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs gh with `args` and `input` on its standard input. The host runs it with no shell, and passes it no token. */
export type GhRun = (args: readonly string[], input?: string) => Promise<GhOutput>;

/** Every gh call: its API, on github.com alone. */
const API = ['api', '--hostname', 'github.com'];
const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/;
const SHA = /^[0-9a-f]{40}$/;

/** Whether `name` is a branch's name that is safe in an address: Git's rules, kept stricter. */
export function isBranchName(name: string): boolean {
  if (!BRANCH.test(name) || name.startsWith('-') || name.startsWith('/') || name.endsWith('/')) return false;
  if (name.endsWith('.lock') || name.endsWith('.')) return false;
  return name.split('/').every((p) => p !== '' && p !== '.' && p !== '..' && !p.startsWith('.'));
}

/** Throws unless `repo` is `owner/name`. */
function repoChecked(repo: string): string {
  if (!REPO.test(repo) || repo.split('/').some((p) => p === '.' || p === '..'))
    throw new Error(word('repo.bad-name', { repo }));
  return repo;
}

/** Throws unless `branch` is a safe branch name. */
function branchChecked(branch: string): string {
  if (!isBranchName(branch)) throw new Error(word('repo.gh.bad-branch', { branch }));
  return branch;
}

/** A file's path, each part encoded for an address; throws for an empty, `.` or `..` part. */
function pathIn(path: string): string {
  const parts = path.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) throw new Error(word('repo.gh.bad-path', { path }));
  return parts.map(encodeURIComponent).join('/');
}

const field = (v: unknown, name: string): unknown =>
  v && typeof v === 'object' ? (v as Record<string, unknown>)[name] : undefined;
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const notFound = (out: GhOutput) => /HTTP 404/.test(out.stderr);
const conflict = (out: GhOutput) => /HTTP (409|422)/.test(out.stderr);

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** UTF-8 text as Base64, as GitHub takes a file's contents. Written out here: the core has no browser or Node helpers. */
export function toBase64(s: string): string {
  const bytes = utf8(s);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = bytes.slice(i, i + 3);
    const n = (a << 16) | (b << 8) | c;
    const left = bytes.length - i;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    out += left > 1 ? B64[(n >> 6) & 63]! : '=';
    out += left > 2 ? B64[n & 63]! : '=';
  }
  return out;
}

/** UTF-8 bytes read as text; a byte that cannot start or carry on a character is read as U+FFFD. */
function fromUtf8(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i] ?? 0;
    const size = b < 0x80 ? 1 : b >= 0xf0 && b < 0xf8 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 0;
    const rest = bytes.slice(i + 1, i + size);
    if (!size || rest.length < size - 1 || rest.some((r) => (r & 0xc0) !== 0x80)) {
      out += '\ufffd';
      i++;
      continue;
    }
    const first = size === 1 ? b : b & (0xff >> (size + 1));
    out += String.fromCodePoint(rest.reduce((n, r) => (n << 6) | (r & 0x3f), first));
    i += size;
  }
  return out;
}

/** Base64, as GitHub gives a file's contents (lines and all), read back to UTF-8 text. */
export function fromBase64(b64: string): string {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const quad = [...clean.slice(i, i + 4)].map((c) => B64.indexOf(c));
    const n = ((quad[0] ?? 0) << 18) | ((quad[1] ?? 0) << 12) | ((quad[2] ?? 0) << 6) | (quad[3] ?? 0);
    bytes.push((n >> 16) & 255);
    if (quad.length > 2) bytes.push((n >> 8) & 255);
    if (quad.length > 3) bytes.push(n & 255);
  }
  return fromUtf8(bytes);
}

/**
 * The `RepoHost` gh gives. It starts the changes' branch from `mainBranch` the first time one is sent. It refuses to
 * send to the main branch itself unless `mainAllowed`, as the user said in settings.
 */
export function ghRepoHost(run: GhRun, mainBranch: string, mainAllowed = false): RepoHost {
  const main = branchChecked(mainBranch);
  /** gh's answer as JSON; null for a 404; throws for any other failure. */
  const call = async (method: string, endpoint: string, body?: unknown): Promise<unknown> => {
    const args = [...API, '--method', method, endpoint, ...(body === undefined ? [] : ['--input', '-'])];
    const out = await run(args, body === undefined ? undefined : JSON.stringify(body));
    if (out.code === 0) return out.stdout.trim() ? JSON.parse(out.stdout) : {};
    if (notFound(out)) return null;
    throw Object.assign(new Error(word('repo.gh.failed')), { conflict: conflict(out) });
  };
  const started = new Set<string>();
  /** Whether the branch is there yet; once it is, it is not asked again. */
  const exists = async (repo: string, branch: string): Promise<boolean> => {
    if (branch === main || started.has(`${repo} ${branch}`)) return true;
    if (!(await call('GET', `repos/${repo}/git/ref/heads/${branch}`))) return false;
    started.add(`${repo} ${branch}`);
    return true;
  };
  /** The branch to read: the chosen one, or main until the first change starts it, so the notes stay in view. */
  const readFrom = async (repo: string, branch: string) => ((await exists(repo, branch)) ? branch : main);
  const ensureBranch = async (repo: string, branch: string): Promise<void> => {
    if (await exists(repo, branch)) return;
    const from = text(field(field(await call('GET', `repos/${repo}/git/ref/heads/${main}`), 'object'), 'sha'));
    if (!SHA.test(from)) throw new Error(word('repo.gh.no-main', { branch: main }));
    await call('POST', `repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: from });
    started.add(`${repo} ${branch}`);
  };
  return {
    async files(repo, branch): Promise<RepoFile[]> {
      const from = await readFrom(repoChecked(repo), branchChecked(branch));
      const tree = await call('GET', `repos/${repo}/git/trees/${from}?recursive=1`);
      const entries = field(tree, 'tree');
      return (Array.isArray(entries) ? entries : [])
        .filter((e) => field(e, 'type') === 'blob')
        .map((e) => ({ path: text(field(e, 'path')), sha: text(field(e, 'sha')) }))
        .filter((f) => f.path && SHA.test(f.sha));
    },
    async read(repo, branch, path) {
      const at = pathIn(path);
      const from = await readFrom(repoChecked(repo), branchChecked(branch));
      const endpoint = `repos/${repo}/contents/${at}?ref=${from}`;
      const file = await call('GET', endpoint);
      const sha = text(field(file, 'sha'));
      if (!file || field(file, 'type') !== 'file' || !SHA.test(sha)) return null;
      return { text: fromBase64(text(field(file, 'content'))), sha };
    },
    async put(repo, branch, change: RepoChange): Promise<RepoSent> {
      repoChecked(repo);
      branchChecked(branch);
      if (branch === main && !mainAllowed) throw new Error(word('repo.main-unasked', { branch }));
      if (branch !== main) await ensureBranch(repo, branch);
      const body = {
        message: change.message,
        branch,
        ...(change.sha ? { sha: change.sha } : {}),
        ...(change.text === null ? {} : { content: toBase64(change.text) }),
      };
      try {
        const done = await call(
          change.text === null ? 'DELETE' : 'PUT',
          `repos/${repo}/contents/${pathIn(change.path)}`,
          body,
        );
        if (done === null) return { ok: false, conflict: true };
        return { ok: true, sha: change.text === null ? null : text(field(field(done, 'content'), 'sha')) || null };
      } catch (e) {
        if ((e as { conflict?: boolean }).conflict) return { ok: false, conflict: true };
        throw e;
      }
    },
    async pull(repo, pull: RepoPull) {
      branchChecked(pull.head);
      branchChecked(pull.base);
      const made = await call('POST', `repos/${repoChecked(repo)}/pulls`, pull);
      const number = field(made, 'number');
      if (typeof number !== 'number') throw new Error(word('repo.gh.failed'));
      return { number, url: text(field(made, 'html_url')) };
    },
  };
}
