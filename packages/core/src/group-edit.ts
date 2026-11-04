// Editing a named group (editor spec §68, cloud_edit). Roger approved this from the UX review, 3 Nov 2026. Your AI
// writes subjects, areas and topics into the note, so you will want to fix them. A cloud's group can be renamed,
// merged into another, or ungrouped ("Not a group"). Each is one property changed on every thing in the group, in
// the blocks where those things are written. Host-free and pure: it gives the blocks' new text, and writes nothing.
import { graphOfBlock } from './blocks.ts';
import { parseValue, setProperty } from './inspector.ts';
import { ALTITUDES } from './named-levels.ts';
import { word } from './words.ts';

/** One block of a note, as it was and as it becomes. */
export interface BlockEdit {
  block: number;
  was: string;
  now: string;
}

/** The property a named group was made by, and its value, from the group's key; null for a group found from links. */
export function groupNamedBy(key: string): { property: string; value: string } | null {
  const last = key.slice(key.lastIndexOf('|') + 1),
    eq = last.indexOf('=');
  if (eq < 0) return null;
  const property = last.slice(0, eq);
  return (ALTITUDES as readonly string[]).includes(property) ? { property, value: last.slice(eq + 1) } : null;
}

/**
 * The blocks of `graph` among `texts` with `property` set to `value` on each of `things`, or taken off where `value`
 * is null. A thing already as asked is left. Says why when no block changes.
 */
export function groupEdits(
  texts: readonly string[],
  graph: string,
  things: readonly string[],
  property: string,
  value: string | null,
): BlockEdit[] | { reason: string } {
  const typed = value === null ? null : value.trim();
  if (typed === '') return { reason: word('levels.edit-empty') };
  const gql = typed === null ? null : parseValue('text', typed);
  if (gql && !gql.ok) return { reason: gql.error };
  const out: BlockEdit[] = [];
  for (const [block, was] of texts.entries()) {
    if (graphOfBlock(was) !== graph) continue;
    let now = was;
    for (const thing of things) {
      const r = setProperty(now, graph, { thing }, property, gql ? gql.gql : null);
      if (r.ok) now = r.text;
    }
    if (now !== was) out.push({ block, was, now });
  }
  return out.length ? out : { reason: word('levels.edit-nothing') };
}
