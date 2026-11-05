// Graphs kept in a GitHub repository (editor spec §48, github_repo_store, github_repo_writes_reviewed,
// github_repo_access). A repository the user picks is one more backend of the one storage interface (storage_contract).
// Its notes are plain `.md` files beside the repository's code and other files. The core reaches no network: the host
// hands in a `RepoHost` that reads and writes with its own GitHub sign-in. So no token passes through here. The store:
// - reaches only the repositories the user picked, and asks nothing of the host until a note is listed, read or saved;
// - writes each change as a commit on the branch the user chose, never the main branch unless the user said so;
// - shows each change before it is sent, and sends nothing the user turns down;
// - refuses a note that holds a credential, and one above the classification the repository is allowed.
import { credentialsIn } from './ai-ceiling.ts';
import { classificationOf } from './claude-gate.ts';
import { formatList } from './locale-formats.ts';
import { notePath, refusal, REFUSED } from './note-storage.ts';
import type { NoteStorage, StoredNote, WriteOptions, WriteOutcome } from './note-storage.ts';
import { word } from './words.ts';

/** A file on a branch: its path in the repository and the id of its contents (Git's blob id). */
export interface RepoFile {
  path: string;
  sha: string;
}

/** One change to one file, sent as one commit. `text` null removes the file; `sha` null makes a new one. */
export interface RepoChange {
  path: string;
  text: string | null;
  /** The blob the change replaces: the host refuses it when the file on the branch is no longer this. */
  sha: string | null;
  message: string;
  author?: string;
}

/** A change sent: the new blob id (null once removed), or a refusal because the file moved on meanwhile. */
export type RepoSent = { ok: true; sha: string | null } | { ok: false; conflict: true };

/** A pull request asked for: from the branch the changes are on into the main branch. */
export interface RepoPull {
  head: string;
  base: string;
  title: string;
  body: string;
}

/**
 * What the host does with its own GitHub sign-in. Each call names the repository and branch, so a host can check them
 * too. The core never sees a token.
 */
export interface RepoHost {
  /** Every file on the branch. */
  files(repo: string, branch: string): Promise<RepoFile[]>;
  /** One file's text and blob id, or null when the branch has none at that path. */
  read(repo: string, branch: string, path: string): Promise<{ text: string; sha: string } | null>;
  /** Commits one change on the branch, against the blob it names. */
  put(repo: string, branch: string, change: RepoChange): Promise<RepoSent>;
  /** Opens a pull request, if the host can. */
  pull?(repo: string, pull: RepoPull): Promise<{ number: number; url: string }>;
}

/** What is about to be sent, shown to the user first (github_repo_access). */
export interface RepoOutgoing {
  repo: string;
  branch: string;
  /** A commit's change, or a pull request asked for. */
  change?: RepoChange;
  pull?: RepoPull;
}

/** How a repository is kept: which, on which branch, and what may go to it. */
export interface RepoStoreOptions {
  host: RepoHost;
  /** The repository, `owner/name`. */
  repo: string;
  /** The repositories the user picked. Any other is refused before anything is asked of the host. */
  picked: readonly string[];
  /** The branch the changes go on, as the user chose. */
  branch: string;
  /** The repository's main branch. */
  mainBranch: string;
  /** True only when the user said changes may go straight onto the main branch. */
  mainAllowed?: boolean;
  /** The folder of the repository the notes sit in; '' or not given: the top. */
  folder?: string;
  /** Shows what will be sent, and says whether the user let it go. */
  confirm: (out: RepoOutgoing) => boolean | Promise<boolean>;
  /** The classifications set, lowest first. */
  levels: readonly string[];
  /** The highest classification this repository may be sent. */
  allowed: string;
  /** The level a note with no classification counts as. */
  unlabelled: string;
}

/** Why a change to a repository was refused, said the same way by every host. */
export const REPO_REFUSED = {
  declined: () => word('repo.declined'),
  credential: (held: string[]) => word('repo.credential', { held: formatList(held) }),
  above: (level: string, allowed: string) => word('repo.above', { level, allowed }),
  unknown: () => word('repo.unknown-level'),
} as const;

const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const rank = (levels: readonly string[], level: string) => levels.findIndex((l) => same(l, level));

/** The options checked before anything is asked: the repository picked and well named, the branch not main unasked. */
function checked(o: RepoStoreOptions): void {
  if (!REPO.test(o.repo) || o.repo.split('/').some((p) => p === '.' || p === '..'))
    throw new Error(word('repo.bad-name', { repo: o.repo }));
  if (!o.picked.some((p) => same(p, o.repo))) throw new Error(word('repo.not-picked', { repo: o.repo }));
  if (!o.branch.trim()) throw new Error(word('repo.no-branch'));
  if (same(o.branch, o.mainBranch) && !o.mainAllowed) throw new Error(word('repo.main-unasked', { branch: o.branch }));
  if (rank(o.levels, o.allowed) === -1) throw new Error(word('repo.allowed-not-set', { allowed: o.allowed }));
}

/** Why `text` may not go to the repository, or null when it may. */
export function repoRefusal(
  text: string,
  o: Pick<RepoStoreOptions, 'levels' | 'allowed' | 'unlabelled'>,
): string | null {
  const held = credentialsIn(text);
  if (held.length) return REPO_REFUSED.credential(held);
  const given = classificationOf(text);
  if (given.kind === 'unknown') return REPO_REFUSED.unknown();
  const level = given.kind === 'given' ? given.level : o.unlabelled;
  const at = rank(o.levels, level);
  if (at === -1 || at > rank(o.levels, o.allowed)) return REPO_REFUSED.above(level, o.allowed);
  return null;
}

/** The folder the notes sit in, as a prefix: '' or `docs/graphs/`. */
function prefixOf(folder = ''): string {
  const trimmed = folder.replace(/^\/+|\/+$/g, '');
  if (!trimmed) return '';
  notePath(`${trimmed}/x.md`);
  return `${trimmed}/`;
}

/** A note's path, if `path` in the repository is one inside the folder; null for any other file. */
function noteIn(path: string, prefix: string): string | null {
  if (!path.startsWith(prefix)) return null;
  try {
    return notePath(path.slice(prefix.length));
  } catch {
    return null;
  }
}

/** The commit message a change goes in with: what it did to which note. */
const messageFor = (path: string, text: string | null, had: boolean): string =>
  word(text === null ? 'repo.commit.removed' : had ? 'repo.commit.changed' : 'repo.commit.made', { path });

/**
 * Notes kept in a GitHub repository, through the host's sign-in. Nothing is asked of the host until the first call.
 * Throws at once for a repository not picked, or for the main branch when the user did not allow it.
 */
export function githubRepoStorage(options: RepoStoreOptions): NoteStorage {
  checked(options);
  const { host, repo, branch } = options;
  const prefix = prefixOf(options.folder);
  const at = async (path: string): Promise<StoredNote | null> => {
    const file = await host.read(repo, branch, prefix + notePath(path));
    return file && { text: file.text, version: file.sha };
  };
  const send = async (path: string, text: string | null, opts: WriteOptions): Promise<WriteOutcome> => {
    const current = await at(path);
    const reason = text === null && !current ? REFUSED.missing : refusal(current, opts);
    if (reason) return { ok: false, reason, current };
    const why = text === null ? null : repoRefusal(text, options);
    if (why) return { ok: false, reason: why, current };
    const change: RepoChange = {
      path: prefix + path,
      text,
      sha: current?.version ?? null,
      message: messageFor(path, text, !!current),
      ...(opts.author === undefined ? {} : { author: opts.author }),
    };
    if (!(await options.confirm({ repo, branch, change })))
      return { ok: false, reason: REPO_REFUSED.declined(), current };
    const sent = await host.put(repo, branch, change);
    if (!sent.ok) return { ok: false, reason: REFUSED.changed, current: await at(path) };
    return { ok: true, version: sent.sha };
  };
  return {
    list: async () =>
      (await host.files(repo, branch))
        .map((f) => noteIn(f.path, prefix))
        .filter((p): p is string => p !== null)
        .sort(),
    read: (path) => at(path),
    write: (path, text, opts = {}) => send(notePath(path), text, opts),
    remove: (path, opts = {}) => send(notePath(path), null, opts),
  };
}

/** A pull request opened, or why not. */
export type PullOutcome = { ok: true; number: number; url: string } | { ok: false; reason: string };

/**
 * Asks for the chosen branch to be merged into the main branch, as a pull request. It is shown to the user first
 * (github_repo_writes_reviewed). Refused when the changes are on the main branch already, or the host cannot.
 */
export async function openRepoReview(options: RepoStoreOptions, title: string, body = ''): Promise<PullOutcome> {
  checked(options);
  const { host, repo, branch, mainBranch } = options;
  if (same(branch, mainBranch)) return { ok: false, reason: word('repo.pull-on-main') };
  if (!host.pull) return { ok: false, reason: word('repo.pull-unsupported') };
  const pull: RepoPull = { head: branch, base: mainBranch, title, body };
  if (!(await options.confirm({ repo, branch, pull }))) return { ok: false, reason: REPO_REFUSED.declined() };
  return { ok: true, ...(await host.pull(repo, pull)) };
}
