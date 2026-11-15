// A starter board for a note with graphs and no board (editor spec ES§45, board_main_screen). Each host opens a note on
// its board. A note with no board yet opens on this one: a View item for each of its graphs, side by side, the first
// graph's board. It is written to the note only once the person changes it, so opening a note never changes it.
// Host-free and pure.
import { gqlBlocks } from './blocks.ts';
import { readNote } from './drawing.ts';

/** The size of each view on a starter board, and the gap between two, in board units. */
const W = 480,
  H = 360,
  GAP = 40;

/**
 * The starter board of a note with graphs and no board: its name and block text, one View item for each graph, side by
 * side. Null for a note that has a board, or no graph.
 */
export function starterBoard(note: string, isBoard: (text: string) => boolean): { name: string; text: string } | null {
  const blocks = gqlBlocks(note).map((b) => b.text);
  if (blocks.some(isBoard)) return null;
  const graphs = [...readNote(blocks).graphs.keys()];
  const first = graphs[0];
  if (first === undefined) return null;
  const name = `${first}_board`;
  const items = graphs.map((g, n) => `(view${n + 1}:View {x: ${n * (W + GAP)}, y: 0, w: ${W}, h: ${H}, of: '${g}'})`);
  return { name, text: [`// graph: ${name} · BOARD ON ${first}`, items.join(',\n')].join('\n') };
}

/** The note with the starter board's block written at its end, so a change can be made to it. */
export function withStarter(note: string, text: string): string {
  return `${note.replace(/\s*$/, '')}\n\n\`\`\`gql\n${text}\n\`\`\`\n`;
}

