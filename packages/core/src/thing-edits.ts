// Editing a thing where it is drawn (editor spec §72). Each edit changes one block, so one undo takes it back.
// - Renamed (edit_rename): the name typed is the thing's text. It goes under the key that already holds it (name,
//   title, text or label), else under name.
// - Added (edit_quick_add): a child linked from the thing, or a sibling linked from its parent, as the graph links them.
// - Deleted (edit_delete): the thing and every link to it, with the comma that parted each from its neighbour.
// - Linked (edit_link_drag): a link from one thing to another, of the type the first uses most.
import gs from '@thoughtknot/graph-spec';
import { addThing } from './add-thing.ts';
import { blankText, items } from './block-items.ts';
import { graphOfBlock } from './blocks.ts';
import { setProperty } from './inspector.ts';
import { appended, withoutItem } from './linked-list.ts';
import { quoted } from './lock.ts';
import type { NoteReading } from './note-reading.ts';
import { S, trim } from './whitespace.ts';
import { textKeyOf, writtenIn } from './written-things.ts';
import { word } from './words.ts';

/** A block to write: its index, its text as drawn and its text after the edit. Else, why nothing can be written. */
export type BlockEdit = { block: number; was: string; now: string } | { reason: string };

/** The key thing `key` holds its text under in `block`, if it is written there with one. */
const textKeyIn = (block: string, key: string): string | undefined => {
  const w = writtenIn(block).find((x) => x.writes && !x.matched && x.variable?.name === key);
  return w && textKeyOf(w);
};

/**
 * The block of `texts` that writes thing `key` of `graph`, with its text now `text`. The text is one line, trimmed, and
 * never empty. The block that holds its text is changed, else the first that writes the thing.
 */
export function renamed(texts: readonly string[], graph: string, key: string, text: string): BlockEdit {
  const line = trim(text.replace(new RegExp(`${S}+`, 'g'), ' '));
  if (!line) return { reason: word('edit.name-empty') };
  const ours = [...texts.entries()].filter(([, t]) => graphOfBlock(t) === graph);
  const held = ours.find(([, t]) => textKeyIn(t, key));
  let reason: string | null = null;
  for (const [block, was] of held ? [held] : ours) {
    const r = setProperty(was, graph, { thing: key }, textKeyIn(was, key) ?? 'name', quoted(line));
    if (r.ok) return r.text === was ? { reason: word('edit.name-same') } : { block, was, now: r.text };
    reason ??= r.reason;
  }
  return { reason: reason ?? word('edit.not-here', { thing: key }) };
}

/** A thing added near another: the block written, and the new thing's name. Else, why nothing can be written. */
export type ThingAdded = { block: number; was: string; now: string; name: string } | { reason: string };

/** The link type used most among `edges`, else none. */
function mostUsed(edges: readonly gs.Edge[]): string | undefined {
  const count = new Map<string, number>();
  for (const [, type] of edges) count.set(type, (count.get(type) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const HIDDEN = new Set<string>(gs.SCHEMA_LABELS);
/** The kind a thing is drawn as: its first label the schema does not keep. */
const kindOf = (g: gs.Graph, key: string): string =>
  [...(g.nodes.get(key)?.[0] ?? [])].find((l) => !HIDDEN.has(l)) ?? '';

/**
 * A new thing with text `text`, written near thing `key` of `graph`, in the block that writes `key`. A `child` is
 * linked from `key` by the link type `key` uses most. Failing that, the type the graph uses most, else HAS. It is of
 * the kind of the other children. A `sibling` is linked from the parent of `key`, as `key` is, and is of its kind. A
 * thing with no parent gets a sibling with no link.
 */
export function addedNear(
  reading: NoteReading,
  graph: string,
  key: string,
  as: 'child' | 'sibling',
  text: string,
): ThingAdded {
  const g = reading.world[graph];
  const ours = [...reading.texts.entries()].filter(([, t]) => graphOfBlock(t) === graph);
  const home = ours.find(([, t]) => writtenIn(t).some((w) => w.writes && w.variable?.name === key)) ?? ours[0];
  if (!g?.nodes.has(key) || !home) return { reason: word('edit.not-here', { thing: key }) };
  let from: string | undefined, rel: string | undefined, kind: string;
  if (as === 'child') {
    from = key;
    rel = mostUsed(g.out(key)) ?? mostUsed(g.edges) ?? 'HAS';
    const children = g.out(key, rel).map(([, , to]) => kindOf(g, to));
    kind = children.find(Boolean) ?? '';
  } else {
    const up = g.inc(key)[0];
    [from, rel] = up ? [up[0], up[1]] : [undefined, undefined];
    kind = kindOf(g, key);
  }
  const [block, was] = home;
  const made = addThing(reading, graph, was, { text, kind });
  if ('refused' in made) return { reason: made.refused };
  const now = from && rel ? appended(made.text, [`(${from})-[:${rel}]->(${made.name})`]) : made.text;
  return { block, was, now, name: made.name };
}

/** Whether the item at `text` names thing `key`, as a thing in a path, or in a SET of its properties. */
const names = (text: string, key: string): boolean =>
  new RegExp(`\\(${S}*${key}${S}*[:){]|\\b${key}${S}*\\.`).test(blankText(text));

/**
 * The block of `texts` without thing `key` of `graph` and every item that names it: its links and the SETs of its
 * properties. It is refused when the thing is written in more than one block, or in a MATCH. It is refused too in one
 * path with another thing written there, which would go with it.
 */
export function deleted(texts: readonly string[], graph: string, key: string): BlockEdit {
  const hits = [...texts.entries()].filter(
    ([, t]) => graphOfBlock(t) === graph && items(t).some((it) => names(t.slice(it.from, it.to), key)),
  );
  const [hit] = hits;
  if (!hit) return { reason: word('edit.not-here', { thing: key }) };
  if (hits.length > 1) return { reason: word('edit.many-blocks', { thing: key }) };
  const [block, was] = hit;
  let now = was;
  for (;;) {
    const all = items(now);
    const it = all.find((x) => names(now.slice(x.from, x.to), key));
    if (!it) break;
    const one = now.slice(it.from, it.to);
    const others = writtenIn(one).some((w) => w.variable?.name !== key && (w.labels.length > 0 || !!w.braces));
    if (/^MATCH\b/i.test(one) || others) return { reason: word('edit.together', { thing: key }) };
    now = withoutItem(now, all, it);
  }
  return { block, was, now };
}

/**
 * The block that writes thing `from` of `graph`, with a link from it to thing `to`. The link is of type `type` if
 * given. Else it is the type `from` uses most, else the type the graph uses most, else RELATES_TO. A link to itself, or
 * one already there, is refused.
 */
export function linkedTo(reading: NoteReading, graph: string, from: string, to: string, type?: string): BlockEdit {
  const g = reading.world[graph];
  const ours = [...reading.texts.entries()].filter(([, t]) => graphOfBlock(t) === graph);
  const home = ours.find(([, t]) => writtenIn(t).some((w) => w.writes && w.variable?.name === from)) ?? ours[0];
  if (!g?.nodes.has(from) || !g.nodes.has(to) || !home) return { reason: word('edit.not-here', { thing: from }) };
  if (from === to) return { reason: word('edit.link-self') };
  const rel = type ?? mostUsed(g.out(from)) ?? mostUsed(g.edges) ?? 'RELATES_TO';
  if (g.out(from, rel).some(([, , t]) => t === to)) return { reason: word('edit.link-there') };
  const [block, was] = home;
  return { block, was, now: appended(was, [`(${from})-[:${rel}]->(${to})`]) };
}
