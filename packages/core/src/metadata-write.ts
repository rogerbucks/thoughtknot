// Writing a note's metadata from Reading view (editor spec §3, reading_view_metadata and reading_view_metadata_safe;
// Roger, 7 Nov 2026). Reading view may write a layout block or an AI block, and nothing else of the note:
// - the graph it was shown must still be the graph in the note, else the write is refused;
// - the block is replaced where it is, or put right after its graph's block when there is none;
// - a write that would change any line outside the note's front matter and its metadata blocks is refused.
// Properties go through the host's own front matter writer. Host-free and pure: the host reads the note fresh, calls
// this, and writes what it gives back in one step.
import { aiBlockOf, graphOfBlock, gqlSpans, layoutOf } from './blocks.ts';
import type { Span } from './blocks.ts';
import { word } from './words.ts';

/** The metadata blocks Reading view may write. */
export type MetaKind = 'LAYOUT' | 'AI';

/** The graph a metadata block belongs to, and its kind; null for any other block. */
export function metaOf(text: string): { kind: MetaKind; on: string } | null {
  const layout = layoutOf(text);
  if (layout) return { kind: 'LAYOUT', on: layout.on };
  const ai = aiBlockOf(text);
  return ai ? { kind: 'AI', on: ai.on } : null;
}

/** The block that holds the data of `graph`, if the note has one. */
export const graphSpanOf = (note: string, graph: string): Span | undefined =>
  gqlSpans(note).find((s) => graphOfBlock(s.text) === graph);

// the lines of a note that only metadata may change: its front matter and every metadata block, fences and all
function metaLines(lines: string[]): Set<number> {
  const out = new Set<number>();
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    for (let i = 0; i <= (end < 0 ? -1 : end); i++) out.add(i);
  }
  for (const s of gqlSpans(lines.join('\n'))) if (metaOf(s.text)) for (let i = s.open; i <= s.close; i++) out.add(i);
  return out;
}

/** The note without its metadata, blank runs made one, so two notes that differ only in metadata compare equal. */
function withoutMeta(note: string): string {
  const lines = note.split('\n');
  const meta = metaLines(lines);
  return lines
    .filter((_, i) => !meta.has(i))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Whether `after` differs from `before` only in front matter and metadata blocks. */
export const onlyMetadata = (before: string, after: string): boolean => withoutMeta(before) === withoutMeta(after);

/**
 * The note with the metadata block of `kind` for `graph` set to `block` (its text, graph line first, no fences), or why
 * not. `shown` is the graph block's text as the person saw it: when the note holds another now, nothing is written.
 */
export function metadataWrite(
  note: string,
  graph: string,
  kind: MetaKind,
  block: string,
  shown: string,
): { text: string } | { refused: string } {
  const data = graphSpanOf(note, graph);
  if (!data || data.text !== shown) return { refused: word('meta.graph-changed', { graph }) };
  if (metaOf(block)?.kind !== kind || metaOf(block)?.on !== graph) return { refused: word('meta.outside') };
  const lines = note.split('\n');
  const own = gqlSpans(note).find((s) => metaOf(s.text)?.kind === kind && metaOf(s.text)?.on === graph);
  const body = block.replace(/\s+$/, '').split('\n');
  if (own) lines.splice(own.open + 1, own.close - own.open - 1, ...body);
  else lines.splice(data.close + 1, 0, '', '```gql', ...body, '```');
  const text = lines.join('\n');
  return onlyMetadata(note, text) ? { text } : { refused: word('meta.outside') };
}
