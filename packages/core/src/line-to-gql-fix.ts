// A loose line converted in the block editor (editor spec §47, line_to_gql_offer). The block editor, used by the
// Obsidian card and pane, the web page, the app and VS Code, has the block's text and the note's other blocks, not the
// note. So the block is fenced into a note of its own, and the line converted there by code as convertLine does. The
// result is a fix of the line's problem, whose title shows the GQL, so the person sees it before pressing.
import type { CodeAction } from './help.ts';
import { convertLine } from './line-to-gql.ts';
import type { NoteReading } from './note-reading.ts';
import { word } from './words.ts';

/** The note `texts` make, each block fenced, with `text` for block `block`; and the note line that block's text starts on. */
function fencedNote(texts: readonly string[], block: number, text: string): { note: string; first: number } {
  const all = block < texts.length ? texts.map((t, i) => (i === block ? text : t)) : [text];
  const at = block < texts.length ? block : 0;
  const lines: string[] = [];
  let first = 1;
  all.forEach((t, i) => {
    if (i === at) first = lines.length + 1;
    lines.push('```gql', ...t.split('\n'), '```');
  });
  return { note: `${lines.join('\n')}\n`, first };
}

/**
 * Line `line`, 0-based, of block `block`'s `text`, converted by code as `convertLine` does, among the note's other
 * blocks `texts`. It gives the GQL and the block's lines that take the line's place; or why not.
 */
function convertBlockLine(
  texts: readonly string[],
  block: number,
  text: string,
  line: number,
): { gql: string; lines: string[] } | { refused: string } {
  const { note, first } = fencedNote(texts, block, text);
  const out = convertLine(note, first + line);
  if ('refused' in out) return out;
  const added = out.note.split('\n').length - note.split('\n').length;
  return { gql: out.gql, lines: out.note.split('\n').slice(first + line, first + line + added + 1) };
}

/**
 * The fix that converts a loose line of the block into GQL, by code (§47, line_to_gql_offer): none when the line is
 * not loose or code cannot convert it. Its title shows the GQL it writes, so the person sees it before pressing.
 */
export function convertFix(reading: NoteReading, block: number, text: string, line: number, uri: string): CodeAction[] {
  const out = convertBlockLine(reading.texts, block, text, line);
  if ('refused' in out) return [];
  const flat = out.gql.replace(/\n/g, ' ');
  const gql = flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
  const end = { line, character: (text.split('\n')[line] ?? '').length };
  const range = { start: { line, character: 0 }, end };
  return [
    {
      title: word('line-gql.fix', { gql }),
      kind: 'quickfix',
      isPreferred: true,
      edit: { changes: { [uri]: [{ range, newText: out.lines.join('\n') }] } },
    },
  ];
}
