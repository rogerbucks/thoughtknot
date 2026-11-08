// Graph information pulled out of a repository (editor spec §48, github_repo_extract). A connected repository already
// holds some: graph blocks in its notes, its folders and its docs. They come back as a proposal over the graph, every
// change an addition. Nothing is written until a person accepts it (proposal_shown_not_applied). Each view marks the
// additions as any proposal's are, in 2D and 3D alike.
// - A graph block's things and links are proposed as written, each from the file it is in.
// - Each folder that holds a doc becomes a Folder, and each doc a Doc, joined by CONTAINS links.
// - A thing the graph already has is never proposed again, nor is a link to a thing neither side holds.
import { gqlBlocks } from './blocks.ts';
import { items } from './block-items.ts';
import { hops } from './estimates.ts';
import { readNote } from './drawing.ts';
import { basisOf } from './proposals-basis.ts';
import { makeProposal } from './proposals.ts';
import type { ChangeInput, Proposal } from './proposals.ts';
import { writtenIn } from './written-things.ts';
import { word } from './words.ts';

/** A file of the repository, as the host read it. */
export interface RepoText {
  path: string;
  text: string;
}

/** The most changes one pull proposes; past it, the rest are counted and left for another pull. */
export const REPO_EXTRACT_MOST = 300;

/** What was found: the proposal, or why there is none, and how many changes were left over past the most. */
export type RepoExtract = { proposal: Proposal; left: number } | { refused: string };

const WORD = /^[A-Za-z_]\w*$/;
const isDoc = (path: string) => /\.md$/i.test(path);
const hidden = (path: string) => path.split('/').some((p) => p.startsWith('.') || p === 'node_modules');
const quoted = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
/** A thing's key made from a path: its letters and digits, joined by underscores, after `head`. */
const keyOf = (head: string, path: string) =>
  `${head}_${
    path
      .replace(/\.md$/i, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'top'
  }`;

/** Proposes changes one at a time, keeping track of the things the graph has and those proposed. */
class Collector {
  readonly changes: ChangeInput[] = [];
  left = 0;
  private readonly keys: Set<string>;
  private readonly links: Set<string>;

  constructor(have: Iterable<string>, links: Iterable<readonly [string, string, string]>) {
    this.keys = new Set(have);
    this.links = new Set([...links].map((l) => l.join(' ')));
  }

  /** Whether the graph or the proposal already has this link. */
  linked(from: string, type: string, to: string): boolean {
    return this.links.has(`${from} ${type} ${to}`);
  }

  has(key: string): boolean {
    return this.keys.has(key);
  }

  /** A free key from `wanted`: itself, or with a number after it. */
  free(wanted: string): string {
    let key = wanted,
      n = 2;
    while (this.keys.has(key)) key = `${wanted}_${n++}`;
    return key;
  }

  add(gql: string, group: string, reason: string, writes: string[] = []): void {
    if (this.changes.length >= REPO_EXTRACT_MOST) {
      this.left++;
      return;
    }
    for (const k of writes) this.keys.add(k);
    for (const l of hops(gql)) this.links.add(l.join(' '));
    this.changes.push({ op: 'add', gql, group, reason });
  }
}

/** The things and links of one file's graph blocks, each item proposed unless the graph already has what it writes. */
function fromBlocks(file: RepoText, c: Collector): void {
  const group = word('repo.extract.group-blocks', { path: file.path });
  const reason = word('repo.extract.found-in', { path: file.path });
  for (const block of gqlBlocks(file.text)) {
    for (const item of items(block.text)) {
      const gql = block.text.slice(item.from, item.to).trim();
      if (!gql.startsWith('(')) continue;
      const writes = writtenIn(gql)
        .filter((w) => w.writes && !w.matched)
        .map((w) => w.variable?.name ?? '')
        .filter(Boolean);
      const links = hops(gql);
      // a thing the graph has is left as it is; a link needs both its ends
      if (writes.some((k) => c.has(k) || !WORD.test(k))) continue;
      if (!writes.length && !links.length) continue;
      const ends = links.flatMap(([from, , to]) => [from, to]).filter((k) => !writes.includes(k));
      if (!ends.every((k) => c.has(k)) || (!writes.length && links.every(([f, t, to]) => c.linked(f, t, to)))) continue;
      c.add(gql, group, reason, writes);
    }
  }
}

/** Each folder that holds a doc, and each doc, as things, with a CONTAINS link from each folder to what is in it. */
function fromFolders(docs: string[], c: Collector): void {
  const group = word('repo.extract.group-folders');
  const folders = new Map<string, string>();
  const folderKey = (folder: string): string => {
    const known = folders.get(folder);
    if (known) return known;
    const parent = folder.includes('/') ? folderKey(folder.slice(0, folder.lastIndexOf('/'))) : null;
    const key = c.free(keyOf('folder', folder));
    folders.set(folder, key);
    c.add(`(${key}:Folder {name: ${quoted(folder)}})`, group, word('repo.extract.folder', { folder }), [key]);
    if (parent) c.add(`(${parent})-[:CONTAINS]->(${key})`, group, word('repo.extract.folder', { folder }));
    return key;
  };
  for (const path of docs) {
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const key = c.free(keyOf('doc', path));
    const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
    c.add(`(${key}:Doc {name: ${quoted(name)}, path: ${quoted(path)}})`, group, word('repo.extract.doc', { path }), [
      key,
    ]);
    if (folder) c.add(`(${folderKey(folder)})-[:CONTAINS]->(${key})`, group, word('repo.extract.doc', { path }));
  }
}

/**
 * The graph information the repository's `files` hold, as a proposal over `graph` in `note`, by `by`. Nothing is
 * written: the proposal waits for a person to accept it. It is proposed as a step, which the editor declares. Refused
 * when the files hold nothing the graph lacks.
 */
export function repoGraphProposal(
  note: string,
  graph: string,
  files: readonly RepoText[],
  by = 'repository',
): RepoExtract {
  const g = readNote(gqlBlocks(note).map((b) => b.text)).world[graph];
  const c = new Collector(
    g ? g.nodes.keys() : [],
    (g?.edges ?? []).map((e) => [e[0], e[1], e[2]] as const),
  );
  const docs = files
    .filter((f) => isDoc(f.path) && !hidden(f.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const file of docs) fromBlocks(file, c);
  fromFolders(
    docs.map((f) => f.path),
    c,
  );
  if (!c.changes.length) return { refused: word('repo.extract.nothing') };
  const made = makeProposal({
    id: 'repository',
    graph,
    by: { name: by, kind: 'step' },
    read: docs.map((f) => f.path),
    basis: basisOf(note, graph),
    changes: c.changes,
  });
  return 'refused' in made ? made : { proposal: made, left: c.left };
}
