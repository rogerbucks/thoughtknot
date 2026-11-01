// Editing a thing where it is drawn (editor spec §72, edit_rename). A name typed on the drawing is the thing's text. It
// is written under the key the thing already holds its text in: name, title, text or label. A thing with none gets a
// name. Only the block that writes the thing changes, and only that one value in it, so one undo takes it back.
import { graphOfBlock } from './blocks.ts';
import { setProperty } from './inspector.ts';
import { quoted } from './lock.ts';
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
