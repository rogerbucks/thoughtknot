// A label as a layout source's attributes give it (editor spec §53, layout_own_engine): HTML-like text (html-label.ts),
// or plain text with Graphviz's escapes, sized and drawn as Graphviz draws plain text. Host-free and pure.
import type { GraphvizOp } from '../graphviz-json.ts';
import type { Attrs } from './dot-read.ts';
import { htmlLabel } from './html-label.ts';
import type { SizedLabel } from './html-label.ts';
import { textWidth } from './text-width.ts';

/** A number an attribute gives, or `d` when it gives none. */
export const numOr = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v === undefined || v === '' || Number.isNaN(n) ? d : n;
};
/** Graphviz's space between lines, as a share of the font's size. */
const LINE = 1.2;

/** A plain label's lines, each centred, or set left (`\l`) or right (`\r`), as Graphviz draws plain text. */
function plainLabel(raw: string, owner: string, font: { size: number; face: string; color: string }): SizedLabel {
  const lines: { text: string; just: 'c' | 'l' | 'r' }[] = [];
  const text = raw.replace(/\\N/g, owner);
  let start = 0;
  for (let i = 0; i < text.length; i++)
    if (text[i] === '\\' && 'nlr'.includes(text[i + 1] ?? '')) {
      const just = text[i + 1] === 'n' ? 'c' : (text[i + 1] as 'l' | 'r');
      lines.push({ text: text.slice(start, i), just });
      start = i + 2;
      i++;
    }
  if (start < text.length || lines.length === 0) lines.push({ text: text.slice(start), just: 'c' });
  const read = lines.map((l) => ({ ...l, text: l.text.replace(/\\(.)/g, '$1') }));
  if (read.length === 1 && read[0]?.text === '') return { width: 0, height: 0, draw: () => [] };
  const widths = read.map((l) => textWidth(l.text, font.size, font.face));
  const width = Math.max(...widths);
  const height = read.length * font.size * LINE;
  return {
    width,
    height,
    draw: (cx, cy) => {
      const ops: GraphvizOp[] = [
        { op: 'F', size: font.size, face: font.face },
        { op: 'c', color: font.color },
      ];
      read.forEach((l, i) => {
        // each line's baseline is nine tenths of its size below its top
        const y = cy + height / 2 - font.size * (0.9 + LINE * i);
        const x = l.just === 'l' ? cx - width / 2 : l.just === 'r' ? cx + width / 2 : cx;
        ops.push({ op: 'T', pt: [x, y], align: l.just, width: widths[i], text: l.text });
      });
      return ops;
    },
  };
}

/** A label as its attributes give it: HTML, or plain text with Graphviz's escapes read (`\n`, `\l`, `\r`, `\N`). */
export function labelOf(attrs: Attrs, fallback: string, owner: string): SizedLabel {
  const font = {
    size: numOr(attrs.fontsize, 14),
    face: attrs.fontname ?? 'Times-Roman',
    color: attrs.fontcolor ?? 'black',
  };
  const raw = attrs.label ?? fallback;
  if (raw.startsWith('<') && raw.endsWith('>')) return htmlLabel(raw.slice(1, -1), font);
  return plainLabel(raw, owner, font);
}
