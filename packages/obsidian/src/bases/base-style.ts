// Where a Bases graph's boxes go and how it is drawn (Bases graph decision B4, R16; 8 Nov 2026). It is a style graph,
// as a card's is: nudges, the diagram type, looks. It is kept in the .base file, under the view, never in a note.
// The graph itself is made again from the notes each time, so only the style is saved.
import { gqlBlocks, styleEdit } from '@thoughtknot/core';
import type { StyleChange } from '@thoughtknot/core';
import { BASE_GRAPH } from './base-graph.ts';

/** The key the style is kept under in the view's entry of the .base file. */
export const STYLE_KEY = 'thoughtknotStyle';

const fenced = (text: string) => '```gql\n' + text + '\n```\n';

/** The blocks to read the graph with: the graph's own, then its kept style's. */
export function blocksWithStyle(graphText: string, kept: string): string[] {
  return [graphText, ...gqlBlocks(kept).map((b) => b.text)];
}

/**
 * The kept style after `change`, written against the graph as it is now. Its blocks are fenced as a note holds
 * them, without the graph's own. Or why it could not be written.
 */
export function styleAfter(
  graphText: string,
  kept: string,
  change: StyleChange,
): { kept: string } | { refused: string } {
  const r = styleEdit(fenced(graphText) + '\n' + kept, BASE_GRAPH, change);
  if ('refused' in r) return { refused: r.refused };
  const style = gqlBlocks(r.note).slice(1);
  return { kept: style.map((b) => fenced(b.text)).join('\n') };
}
