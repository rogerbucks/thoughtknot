// Where the gql fenced blocks of a note are (spec §3). It needs no package, so the scripts that run with nothing
// installed, such as the build status, can read the requirements note through it.
import type { Block } from './note-reading.ts';

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*gql\s*$/i;

/** Whether a line closes a fence: up to 3 spaces, at least `min` of the fence's mark, then only spaces. No regex is built from the note. */
function closesFence(line: string, mark: '`' | '~', min: number): boolean {
  let i = 0;
  while (i < line.length && i < 3 && line[i] === ' ') i++;
  let j = i;
  while (line[j] === mark) j++;
  return j - i >= min && line.slice(j).trim() === '';
}

/**
 * A gql block's place in a note. It holds the block's text, with its lines joined by \\n. It also holds the 0-based
 * lines of its opening and closing fences. An unclosed block's closing line is the line count.
 */
export interface Span {
  text: string;
  open: number;
  close: number;
}

/** Where each gql fenced block of a note is. An unclosed fence runs to the end, as Markdown reads it. */
export function gqlSpans(note: string): Span[] {
  const lines = note.split('\n').map((l) => l.replace(/\r$/, '')),
    out: Span[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i] ?? '');
    if (!open) continue;
    const mark = open[1] ?? '```',
      char = mark[0] === '`' ? '`' : '~';
    let j = i + 1;
    while (j < lines.length && !closesFence(lines[j] ?? '', char, mark.length)) j++;
    out.push({ text: lines.slice(i + 1, j).join('\n'), open: i, close: j });
    i = j;
  }
  return out;
}

/** The gql fenced blocks of a note, in order, each with the note line (1-based) its fence opens on. */
export function gqlBlocks(note: string): Block[] {
  return gqlSpans(note).map((s) => ({ text: s.text, line: s.open + 1 }));
}
