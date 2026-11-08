// The notes a Bases view picks, as one graph (Bases graph decisions B2, B3, B5; 8 Nov 2026). Each note is a thing and
// each link between two notes picked is a link. Links come from a note's own links by default, or from one property.
// The graph is written as a gql block, so it is drawn and read as any card's is. It is made again from the notes each
// time Bases hands them over, and never saved: the notes stay the data.

/** The name of the graph a Bases view draws. */
export const BASE_GRAPH = 'base';

/** One note a Bases view picks: its path in the vault, its name, and the paths of the notes it links to. */
export interface BaseNote {
  path: string;
  name: string;
  links: readonly string[];
}

/** Whether notes outside the view but linked from it are left out (B5, the default) or shown as their own kind. */
export type Outside = 'hide' | 'show';

/**
 * A thing's name for a note: the same for the same path every time, so a place saved for it still finds it.
 * It is the path's FNV-1a hash in base 36, after an `n`.
 */
export function noteKey(path: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'n' + h.toString(36);
}

/** Text as a gql string in single quotes, on one line. */
function quoted(text: string): string {
  return `'${text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")}'`;
}

/** A note's path as the link its thing carries, so its details open the note: `[[Folder/Note]]`. */
function noteLink(path: string): string {
  return `[[${path.replace(/\.md$/, '')}]]`;
}

/** A note's name from its path, for a note linked from the view but outside it. */
function nameOf(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/, '');
}

/**
 * The gql block of the graph of `notes`. A link to a note outside them is left out, or with `outside` 'show' the note
 * is added as an Outside thing. Each link is written once, and never from a note to itself.
 */
export function baseGraphText(notes: readonly BaseNote[], outside: Outside = 'hide'): string {
  const picked = new Map(notes.map((n) => [n.path, n]));
  const others = new Set<string>();
  const links: string[] = [];
  const seen = new Set<string>();
  for (const n of notes) {
    for (const to of n.links) {
      if (to === n.path) continue;
      if (!picked.has(to)) {
        if (outside === 'hide') continue;
        others.add(to);
      }
      const key = `${n.path}\u0000${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push(`(${noteKey(n.path)})-[:LINKS_TO]->(${noteKey(to)})`);
    }
  }
  const thing = (path: string, kind: string, name: string) =>
    `(${noteKey(path)}:${kind} {name: ${quoted(name)}, note: ${quoted(noteLink(path))}})`;
  const things = [
    ...notes.map((n) => thing(n.path, 'Note', n.name)),
    ...[...others].sort().map((p) => thing(p, 'Outside', nameOf(p))),
  ];
  return [`// graph: ${BASE_GRAPH}`, [...things, ...links].join(',\n')].join('\n');
}
