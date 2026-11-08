// Sending a note to a GitHub repository from an app (editor spec §48). This holds the settings each app keeps. It holds
// the one list of gh calls an app may run, and what the show-before-send screen says. Every app uses the same three.
// - The settings name the picked repositories, the branch changes go on, and the highest level a repository may hold.
// - `ghCallRefusal` is the list of gh calls an app may run: `gh api` on github.com, the seven calls `ghRepoHost` makes,
//   and nothing else. The desktop app's Rust keeps the same list (src-tauri/src/gh.rs). One file of cases tests both.
// - `sendNoteToRepo` reads the repository's copy first, shows what changes, and sends only when the user says yes.
import type { RepoHost, RepoOutgoing } from './github-repo-store.ts';
import { githubRepoStorage, openRepoReview } from './github-repo-store.ts';
import { isBranchName } from './github-repo-gh.ts';
import { lineDiff, type DiffLine } from './line-diff.ts';
import { word } from './words.ts';

/** How an app sends notes to GitHub, as the user set it. */
export interface RepoSettings {
  /** The repositories the user picked, each `owner/name`. No other is reached. */
  repos: string[];
  /** The branch changes go on. */
  branch: string;
  /** The repository's main branch, which a new branch starts from. */
  mainBranch: string;
  /** The folder of the repository the notes go in; '' for the top. */
  folder: string;
  /** The highest classification a repository may be sent. */
  allowed: string;
  /** True only when the user said changes may go straight onto the main branch. */
  mainAllowed: boolean;
}

/** The branch changes go on until the user picks another. Never the main branch. */
export const REPO_BRANCH_DEFAULT = 'thoughtknot/graphs';

const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const isRepo = (r: string) => REPO.test(r) && !r.split('/').some((p) => p === '.' || p === '..');
const text = (v: unknown, fallback: string) => (typeof v === 'string' ? v.trim() : fallback);

/** The repositories in what the user typed: one a line, or split by commas or spaces. Duplicates dropped. */
export function repoListFrom(typed: string): string[] {
  const all = typed.split(/[\s,]+/).filter(Boolean);
  return all.filter((r, i) => all.findIndex((s) => s.toLowerCase() === r.toLowerCase()) === i);
}

/** Settings as saved, read back: anything missing or of the wrong kind takes its default. `levels` lowest first. */
export function repoSettingsFrom(saved: unknown, levels: readonly string[]): RepoSettings {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
  const repos = Array.isArray(s.repos) ? repoListFrom(s.repos.filter((r) => typeof r === 'string').join(' ')) : [];
  const allowed = text(s.allowed, '');
  return {
    repos,
    branch: text(s.branch, REPO_BRANCH_DEFAULT),
    mainBranch: text(s.mainBranch, 'main') || 'main',
    folder: text(s.folder, ''),
    allowed: levels.includes(allowed) ? allowed : (levels[0] ?? ''),
    mainAllowed: s.mainAllowed === true,
  };
}

/** What is wrong with the settings, each said in words; none when a note can be sent. */
export function repoSettingsProblems(s: RepoSettings, levels: readonly string[]): string[] {
  const out: string[] = [];
  if (!s.repos.length) out.push(word('repo.settings.no-repos'));
  for (const r of s.repos.filter((r) => !isRepo(r))) out.push(word('repo.bad-name', { repo: r }));
  if (!isBranchName(s.branch)) out.push(word('repo.gh.bad-branch', { branch: s.branch }));
  if (!isBranchName(s.mainBranch)) out.push(word('repo.gh.bad-branch', { branch: s.mainBranch }));
  if (s.branch.toLowerCase() === s.mainBranch.toLowerCase() && !s.mainAllowed)
    out.push(word('repo.main-unasked', { branch: s.branch }));
  if (!levels.includes(s.allowed)) out.push(word('repo.allowed-not-set', { allowed: s.allowed }));
  return out;
}

// ---- the gh calls an app may run ----

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const BRANCH_PART = /^[A-Za-z0-9_.-]+$/;
// what encodeURIComponent leaves, and its %XX
const PATH_PART = /^(?:[A-Za-z0-9_.!~*'()-]|%[0-9A-Fa-f]{2})+$/;

/** Whether `parts` are a branch's name: the rule `isBranchName` keeps, part by part. */
const branchOf = (parts: string[]) =>
  parts.length > 0 && parts.every((p) => BRANCH_PART.test(p) && !p.includes('..')) && isBranchName(parts.join('/'));

/** Whether `parts` are a file's path, each part encoded, none `.` or `..`, even encoded. */
const pathOf = (parts: string[]) =>
  parts.length > 0 &&
  parts.every((p) => {
    if (!PATH_PART.test(p)) return false;
    let plain: string;
    try {
      plain = decodeURIComponent(p);
    } catch {
      return false;
    }
    return plain !== '.' && plain !== '..' && !plain.includes('/') && !plain.includes('\\');
  });

/** Whether `rest` of an address after `repos/owner/name/`, with its `query`, is a call for `method`. */
function callAllowed(method: string, rest: string[], query: string | null): boolean {
  const [area, ...tail] = rest;
  if (method === 'GET') {
    if (area === 'git' && tail[0] === 'ref' && tail[1] === 'heads') return query === null && branchOf(tail.slice(2));
    if (area === 'git' && tail[0] === 'trees') return query === 'recursive=1' && branchOf(tail.slice(1));
    if (area === 'contents') return !!query?.startsWith('ref=') && branchOf(query.slice(4).split('/')) && pathOf(tail);
    return false;
  }
  if (query !== null) return false;
  if (method === 'POST')
    return (area === 'git' && tail.length === 1 && tail[0] === 'refs') || (area === 'pulls' && !tail.length);
  if (method === 'PUT' || method === 'DELETE') return area === 'contents' && pathOf(tail);
  return false;
}

/** The most an app sends gh on its standard input: 8 MiB, past any note an app keeps. */
export const GH_INPUT_MOST = 8 * 1024 * 1024;

/**
 * Why gh may not be run with `args` and `input`, or null when it may. Allowed is only `gh api --hostname github.com
 * --method M address`, with `--input -` and a body exactly when M sends one, at an address `ghRepoHost` asks. With
 * `picked`, the repository must be one of them.
 */
export function ghCallRefusal(
  args: readonly string[],
  input?: string | null,
  picked?: readonly string[],
): string | null {
  const refused = word('repo.gh.refused');
  const [api, h, host, m, method, address, ...more] = args;
  if (api !== 'api' || h !== '--hostname' || host !== 'github.com' || m !== '--method') return refused;
  if (typeof method !== 'string' || typeof address !== 'string') return refused;
  const sends = method !== 'GET';
  if (sends ? more.length !== 2 || more[0] !== '--input' || more[1] !== '-' : more.length !== 0) return refused;
  if (sends !== (typeof input === 'string') || (input?.length ?? 0) > GH_INPUT_MOST) return refused;
  const at = address.indexOf('?');
  const path = at === -1 ? address : address.slice(0, at);
  const query = at === -1 ? null : address.slice(at + 1);
  const [repos, owner = '', name = '', ...rest] = path.split('/');
  if (repos !== 'repos' || !NAME.test(owner) || !NAME.test(name) || [owner, name].some((p) => p === '.' || p === '..'))
    return refused;
  if (!callAllowed(method, rest, query)) return refused;
  const repo = `${owner}/${name}`.toLowerCase();
  if (picked && !picked.some((p) => p.toLowerCase() === repo))
    return word('repo.not-picked', { repo: `${owner}/${name}` });
  return null;
}

// ---- the show-before-send screen ----

/** What the show-before-send screen shows: its question, what goes where, and the lines that change. */
export interface OutgoingShown {
  title: string;
  rows: [label: string, value: string][];
  /** The lines that change, or null when too many to show line by line (then `count` says how many lines go). */
  diff: DiffLine[] | null;
  count: number;
}

/** What `out` is, for the user to read before it goes. `before` is the repository's copy, null when there is none. */
export function outgoingShown(out: RepoOutgoing, before: string | null): OutgoingShown {
  const rows: [string, string][] = [[word('repo.send.repo'), out.repo]];
  if (out.pull)
    return {
      title: word('repo.review.title'),
      rows: [
        ...rows,
        [word('repo.review.from'), out.pull.head],
        [word('repo.review.into'), out.pull.base],
        [word('repo.review.name'), out.pull.title],
      ],
      diff: [],
      count: 0,
    };
  const change = out.change;
  const after = change?.text ?? '';
  rows.push([word('repo.send.branch'), out.branch]);
  if (change) {
    rows.push([word('repo.send.file'), change.path]);
    rows.push([word('repo.send.message'), change.message]);
  }
  const diff = lineDiff(before ?? '', after);
  return {
    title: word(before === null ? 'repo.send.title-new' : 'repo.send.title'),
    rows,
    diff,
    count: after === '' ? 0 : after.replace(/\n$/, '').split('\n').length,
  };
}

/** Everything a send needs, from the app. */
export interface RepoSendOptions {
  host: RepoHost;
  settings: RepoSettings;
  /** The repository to send to: one of `settings.repos`. */
  repo: string;
  /** The classifications set, lowest first, and the level a note with none counts as. */
  levels: readonly string[];
  unlabelled: string;
  /** Shows the screen, and says whether the user pressed Send. */
  show: (shown: OutgoingShown) => Promise<boolean>;
}

/** What a send did: the version it left, or why nothing was sent. */
export type RepoSendOutcome = { ok: true; message: string } | { ok: false; reason: string };

const storeOf = (o: RepoSendOptions, before: () => string | null) => {
  const s = o.settings;
  const options = {
    host: o.host,
    repo: o.repo,
    picked: s.repos,
    branch: s.branch,
    mainBranch: s.mainBranch,
    mainAllowed: s.mainAllowed,
    folder: s.folder,
    levels: o.levels,
    allowed: s.allowed,
    unlabelled: o.unlabelled,
    confirm: (out: RepoOutgoing) => o.show(outgoingShown(out, before())),
  };
  return { options, store: githubRepoStorage(options) };
};

/**
 * Sends the note at `path` with `text` to the repository: read there first, shown, and sent only on yes. It goes
 * against the copy shown, so a change made there in between is refused, never written over.
 */
export async function sendNoteToRepo(o: RepoSendOptions, path: string, text: string): Promise<RepoSendOutcome> {
  try {
    let before: string | null = null;
    const { store } = storeOf(o, () => before);
    const there = await store.read(path);
    before = there?.text ?? null;
    if (before === text) return { ok: false, reason: word('repo.send.same') };
    const done = await store.write(path, text, { expected: there?.version ?? null });
    if (!done.ok) return { ok: false, reason: done.reason };
    return { ok: true, message: word('repo.send.done', { branch: o.settings.branch, repo: o.repo }) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Asks for the branch's changes to be merged into main, as a pull request: shown first, opened only on yes. */
export async function askRepoReview(o: RepoSendOptions, title: string): Promise<RepoSendOutcome> {
  try {
    const { options } = storeOf(o, () => null);
    const done = await openRepoReview(options, title);
    if (!done.ok) return done;
    return { ok: true, message: word('repo.review.done', { number: done.number, url: done.url }) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
