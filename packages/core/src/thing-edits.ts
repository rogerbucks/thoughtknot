// Editing a thing where it is drawn (editor spec §72). Each edit changes one block, so one undo takes it back.
// - Renamed (edit_rename): the name typed is the thing's text. It goes under the key that already holds it (name,
//   title, text or label), else under name.
// - Added (edit_quick_add): a child linked from the thing, or a sibling linked from its parent, as the graph links them.
// - Deleted (edit_delete): the thing and every link to it, with the comma that parted each from its neighbour.
// - Linked (edit_link_drag): a link from one thing to another, of the type the first uses most.
// - A property set (edit_cells): a value typed in a table's cell, read as the type the property holds.
// - A quick line (edit_quick_line): a short sentence such as Idea -> Plan, Risk, its things and links written at once.
import gs from '@thoughtknot/graph-spec';
import { addThing } from './add-thing.ts';
import { blankText, items } from './block-items.ts';
import { graphOfBlock } from './blocks.ts';
import { parseValue, propertiesOf, setProperty, type PropType } from './inspector.ts';
import { appended, withoutItem } from './linked-list.ts';
import { quoted } from './lock.ts';
import type { NoteReading } from './note-reading.ts';
import { S, trim } from './whitespace.ts';
import { details } from './render.ts';
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
const names = (text: string, key: string): boolean => {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\(${S}*${k}${S}*[:){]|\\b${k}${S}*\\.`).test(blankText(text));
};

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

/** The type property `prop` holds in `graph`: on thing `key`, else on any other thing; else as `words` reads. */
function typeIn(reading: NoteReading, graph: string, key: string, prop: string, words: string): PropType {
  const own = propertiesOf(reading, graph, { thing: key }).find((p) => p.key === prop);
  if (own) return own.type;
  for (const k of reading.world[graph]?.nodes.keys() ?? []) {
    const p = propertiesOf(reading, graph, { thing: k }).find((x) => x.key === prop);
    if (p) return p.type;
  }
  const v = words.trim();
  return /^-?\d+(\.\d+)?$/.test(v) ? 'number' : /^(true|false)$/i.test(v) ? 'boolean' : 'text';
}

/**
 * The block that writes thing `key` of `graph`, with property `prop` now `words`, read as the type the property
 * holds. Empty words take the property away. A value its type cannot read is refused, with why.
 */
export function propertySet(reading: NoteReading, graph: string, key: string, prop: string, words: string): BlockEdit {
  const parsed = words.trim() ? parseValue(typeIn(reading, graph, key, prop, words), words) : null;
  if (parsed && !parsed.ok) return { reason: parsed.error };
  const ours = [...reading.texts.entries()].filter(([, t]) => graphOfBlock(t) === graph);
  let reason: string | null = null;
  for (const [block, was] of ours) {
    const r = setProperty(was, graph, { thing: key }, prop, parsed ? parsed.gql : null);
    if (r.ok && r.text !== was) return { block, was, now: r.text };
    if (!r.ok) reason ??= r.reason;
  }
  return { reason: reason ?? word('edit.name-same') };
}

/**
 * A new card with text `text` in a column of a board (edit_cells). Its property `by` is the column's `value`. In the
 * column of things with no value, it has none. It is of the kind of `peer`, a card in that column, else of the graph's
 * first thing. It is written in the graph's first block.
 */
export function addedInColumn(
  reading: NoteReading,
  graph: string,
  column: { by: string; value: string | null; peer?: string },
  text: string,
): ThingAdded {
  const g = reading.world[graph];
  const home = [...reading.texts.entries()].find(([, t]) => graphOfBlock(t) === graph);
  if (!g || !home) return { reason: word('edit.not-here', { thing: graph }) };
  const like = column.peer && g.nodes.has(column.peer) ? column.peer : [...g.nodes.keys()][0];
  const [block, was] = home;
  const made = addThing(reading, graph, was, { text, kind: like ? kindOf(g, like) : '' });
  if ('refused' in made) return { reason: made.refused };
  if (column.value === null) return { block, was, now: made.text, name: made.name };
  const gql = parseValue('text', column.value);
  if (!gql.ok) return { reason: gql.error };
  const set = setProperty(made.text, graph, { thing: made.name }, column.by, gql.gql);
  return set.ok ? { block, was, now: set.text, name: made.name } : { reason: set.reason };
}

/** What a quick line writes: its block, and the keys of the things it names, new or already there. Else, why not. */
export type LineWritten = { block: number; was: string; now: string; things: string[] } | { reason: string };

/** The arrow that parts the steps of a quick line. */
const ARROW = /->|→/;

/**
 * The graph's first block with the things and links that quick line `line` names (edit_quick_line). Arrows part its
 * steps, and commas the things in one step. Each thing of a step is linked to each of the next. A name is a thing
 * already there when its text is the same, in any case. Else it is a new thing, of the kind of another in its step, or
 * of the kind the graph has most. A line that starts with an arrow starts from thing `from`. Links are of the type the
 * graph uses most, and none is written twice.
 */
export function quickLine(reading: NoteReading, graph: string, line: string, from?: string): LineWritten {
  const g = reading.world[graph];
  const home = [...reading.texts.entries()].find(([, t]) => graphOfBlock(t) === graph);
  if (!g || !home) return { reason: word('edit.not-here', { thing: graph }) };
  const parts = line.split(ARROW).map((p) =>
    p
      .split(',')
      .map((n) => trim(n))
      .filter(Boolean),
  );
  if (parts[0]?.length === 0 && from && g.nodes.has(from)) parts[0] = [from];
  const steps = parts.filter((p) => p.length);
  if (!steps.length) return { reason: word('edit.line-empty') };
  const byText = new Map<string, string>();
  for (const key of g.nodes.keys()) byText.set((details(reading, graph, key)?.text ?? key).toLowerCase(), key);
  const count = new Map<string, number>();
  for (const key of g.nodes.keys()) count.set(kindOf(g, key), (count.get(kindOf(g, key)) ?? 0) + 1);
  const common = [...count].filter(([k]) => k).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const [block, was] = home;
  let now = was;
  const keys: string[][] = [];
  for (const [i, step] of steps.entries()) {
    const known = step.map((n) => (i === 0 && n === from ? from : byText.get(n.toLowerCase())));
    const kind = known.map((k) => (k ? kindOf(g, k) : '')).find(Boolean) ?? common;
    const row: string[] = [];
    for (const [j, n] of step.entries()) {
      const k = known[j] ?? byText.get(n.toLowerCase());
      if (k) {
        row.push(k);
        continue;
      }
      const made = addThing(reading, graph, now, { text: n, kind });
      if ('refused' in made) return { reason: made.refused };
      now = made.text;
      byText.set(n.toLowerCase(), made.name);
      row.push(made.name);
    }
    keys.push(row);
  }
  const rel = mostUsed(g.edges) ?? 'RELATES_TO';
  const links: string[] = [];
  for (let i = 1; i < keys.length; i++)
    for (const a of keys[i - 1] ?? [])
      for (const b of keys[i] ?? []) {
        const there = g.out(a, rel).some(([, , to]) => to === b);
        const link = `(${a})-[:${rel}]->(${b})`;
        if (a !== b && !there && !links.includes(link)) links.push(link);
      }
  if (links.length) now = appended(now, links);
  if (now === was) return { reason: word('edit.line-there') };
  return { block, was, now, things: [...new Set(keys.flat())] };
}
