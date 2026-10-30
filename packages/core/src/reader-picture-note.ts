// Where a reader picture sits in a note, and whether it is up to date. That is editor spec §62: picture_for_readers,
// picture_kept_in_step, picture_where and picture_never_read. The picture is an SVG file named `<note>.<graph>.thoughtknot.svg`,
// linked by a plain Markdown image line straight after its gql block. The file name is the marker: Obsidian's reading
// view drops HTML comments before a plug-in sees the page. The file names itself as ThoughtKnot's in its metadata, with
// the fingerprint of the text it was drawn from. Only that is ever read from it: whether it is ours, and whether it is
// up to date. The graph is always read from the text.
//
// Host-free and pure: the host reads and writes the files. The Python reader mirrors it (graph_spec reader_picture.py).
import { sha256 } from './ai-digest.ts';
import { part } from './export-plan.ts';
import { gqlSpans } from './fences.ts';

/** The ending of every reader picture's file name. */
export const PICTURE_ENDING = '.thoughtknot.svg';

/** The drawing's version: a change to how a picture is drawn changes every fingerprint, so each is redrawn once. */
export const PICTURE_VERSION = 1;

/** How many characters of the plain-language reading a picture carries as its alt text. */
export const ALT_MOST = 300;

/** The metadata line a picture names itself by, with the fingerprint of the text it was drawn from. */
const MARK = /<metadata>thoughtknot reader picture ([0-9a-f]{16})<\/metadata>/;

/** A Markdown image line linking a reader picture: its alt text and its link, one on a line alone. */
const LINE = /^ {0,3}!\[((?:[^\]\\]|\\.)*)\]\((?:<([^>]*)>|([^)\s]*))\)\s*$/;

/** The file name of graph `graph`'s picture in note `note` (a vault path): the note, the graph, and the ending. */
export function pictureFileName(note: string, graph: string): string {
  const stem = (note.split('/').pop() ?? '').replace(/\.md$/i, '');
  return `${part(stem, 80) || 'note'}.${part(graph, 44) || 'graph'}${PICTURE_ENDING}`;
}

/** Whether `path` is named as a reader picture. */
export const isPictureFile = (path: string) => path.toLowerCase().endsWith(PICTURE_ENDING);

/** The folder of a vault path: empty at the top of the vault. */
const folderOf = (path: string) => path.split('/').slice(0, -1).join('/');

/**
 * The link from note `note` to the picture at `picture`, both vault paths. It is relative to the note's folder, as
 * GitHub and every Markdown reader resolve it. Spaces and brackets are escaped, so the link is one word.
 */
export function pictureHref(note: string, picture: string): string {
  const from = folderOf(note).split('/').filter(Boolean),
    to = picture.split('/').filter(Boolean);
  let same = 0;
  while (same < from.length && same < to.length - 1 && from[same] === to[same]) same++;
  const rel = [...from.slice(same).map(() => '..'), ...to.slice(same)].join('/');
  return rel.replace(/%/g, '%25').replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/** The vault path a link from note `note` points at, the reverse of `pictureHref`. */
export function pictureTarget(note: string, href: string): string {
  const out = folderOf(note).split('/').filter(Boolean);
  for (const step of decodeURIComponent(href).split('/'))
    if (step === '..') out.pop();
    else if (step && step !== '.') out.push(step);
  return out.join('/');
}

/** The first line of a block, its header: `// graph: name · …`. */
const headerOf = (text: string) => text.split('\n', 1)[0] ?? '';

/**
 * The texts a picture of `graph` is drawn from: each gql block of the note whose header names it. They are its data
 * and the style, view and drawings on it. A block naming another graph never changes it.
 */
export function pictureTexts(note: string, graph: string): string[] {
  const named = new RegExp(`(^|[^\\w])${graph.replace(/[^\w]/g, '\\$&')}([^\\w]|$)`);
  return gqlSpans(note)
    .map((s) => s.text)
    .filter((t) => /^\s*\/\/\s*graph\s*:/i.test(headerOf(t)) && named.test(headerOf(t)));
}

/**
 * The fingerprint of what a picture is drawn from: the drawing's version, the note's path (its footer names it) and the
 * texts. Sixteen hexadecimal digits of their SHA-256. The same text gives the same fingerprint on every machine.
 */
export function pictureFingerprint(note: string, texts: readonly string[]): string {
  return sha256([String(PICTURE_VERSION), note, ...texts].join('\u0000')).slice(0, 16);
}

/** The metadata a picture names itself by, to put straight inside its `<svg>`. */
export const pictureMark = (fingerprint: string) => `<metadata>thoughtknot reader picture ${fingerprint}</metadata>`;

/** Whether an SVG's text names itself as a ThoughtKnot reader picture: only such a file may be overwritten or removed. */
export const madeByThoughtKnot = (svg: string) => MARK.test(svg);

/** What a file at a picture's place means: none yet, ours and up to date, ours and old, or someone else's. */
export type PictureState = 'missing' | 'current' | 'stale' | 'not-ours';

/** The state of the file `existing` holds (null when there is none) against the fingerprint the text gives now. */
export function pictureState(existing: string | null, fingerprint: string): PictureState {
  if (existing === null) return 'missing';
  const mark = MARK.exec(existing);
  if (!mark) return 'not-ours';
  return mark[1] === fingerprint ? 'current' : 'stale';
}

/** The plain-language reading cut to `most` characters, between words, a "…" saying it goes on. */
export function pictureAlt(sentences: readonly string[], most: number = ALT_MOST): string {
  const whole = sentences.join(' ').replace(/\s+/g, ' ').trim();
  if (whole.length <= most) return whole;
  const cut = whole.slice(0, most - 1),
    space = cut.lastIndexOf(' ');
  return `${(space > most / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The Markdown image line for a picture: the alt text on one line with its brackets escaped, then the link. */
export const pictureLine = (alt: string, href: string) =>
  `![${alt.replace(/\s+/g, ' ').replace(/[\\[\]]/g, '\\$&')}](${href})`;

/** A line's picture link, or null when it is not a Markdown image line linking a reader picture. */
export function pictureLinkOf(line: string): string | null {
  const m = LINE.exec(line);
  const href = m ? (m[2] ?? m[3] ?? '') : '';
  return href && isPictureFile(href.split(/[?#]/)[0] ?? '') ? href : null;
}

/** A picture line in a note: the gql block it follows (by its index), its 0-based line and its link. */
export interface PictureLineAt {
  block: number;
  line: number;
  href: string;
}

/** Each picture line of `note`: a reader picture's image line straight after a gql block's closing fence. */
export function pictureLines(note: string): PictureLineAt[] {
  const lines = note.split('\n');
  return gqlSpans(note).flatMap((s, block) => {
    const href = pictureLinkOf((lines[s.close + 1] ?? '').replace(/\r$/, ''));
    return href ? [{ block, line: s.close + 1, href }] : [];
  });
}

/**
 * `note` with `line` straight after its gql block number `block`: in place of the picture line there, else added. A
 * block left unclosed gets none, as it has no end to follow. The note's own line endings are kept.
 */
export function withPictureLine(note: string, block: number, line: string): string {
  const span = gqlSpans(note)[block];
  const lines = note.split('\n');
  if (!span || span.close >= lines.length) return note;
  const crlf = /\r$/.test(lines[span.close] ?? '') ? '\r' : '';
  const at = span.close + 1,
    there = pictureLinkOf((lines[at] ?? '').replace(/\r$/, '')) !== null;
  lines.splice(at, there ? 1 : 0, line + crlf);
  return lines.join('\n');
}

/** `note` without the picture lines `which` keeps (every one, unless said), and nothing else changed. */
export function withoutPictureLines(note: string, which: (at: PictureLineAt) => boolean = () => true): string {
  const gone = new Set(
    pictureLines(note)
      .filter(which)
      .map((p) => p.line),
  );
  return gone.size
    ? note
        .split('\n')
        .filter((_, i) => !gone.has(i))
        .join('\n')
    : note;
}
