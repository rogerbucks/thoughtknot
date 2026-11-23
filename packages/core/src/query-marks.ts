// The one mark rule for a highlight (editor spec ES§75, ai_query_highlight). A query shown as a highlight keeps every
// thing in sight. Each thing it finds is marked by a badge and a colour, so never by colour alone. Every painter reads
// this one rule, so the marks look the same everywhere:
// - which things are marked: those the query finds, less any the card hides (`markedShown`);
// - with which badge and colour: the badge of each part that finds it, in the colour of the first (`drawnOf`);
// - how a painter of plain marks shows it: a ring round the box and the badge before its name (`withQueryMarks`).
// The ring and badge are marks added beside the thing's own. They never change a place or a size, so nothing moves.
// The colours are the locked style's line and label blends (theme.ts), so they keep 3:1 and 4.5:1 in both themes.
// Host-free and pure. Marking runs on every graph change and never sends anything.
import type { DrawMark } from './drawing-marks.ts';
import type { QueryMark } from './filter.ts';
import { STYLE } from './layout.ts';
import type { Palette } from './palette.ts';
import { BADGE_GLYPHS } from './rule-looks.ts';

/** The things a highlight marks, by key, with the mark of each part that finds them. */
export type Marked = ReadonlyMap<string, readonly QueryMark[]>;

/** How one marked thing is drawn: its badges as glyphs, the hue of its colour and the style token painted in it. */
export interface QueryMarkDrawn {
  glyph: string;
  hue: string;
  token: string;
}

/** The style token a highlight's ring is painted with, before its hue: `query.blue`. */
export const QUERY_TOKEN = 'query';

/** How far out the ring's lines sit round a marked box, in the drawing's pixels: three lines, a gap inside them. */
export const QUERY_RINGS: readonly number[] = Object.freeze([2, 3, 4]);

/** The things `things` each marked with `mark`, as a highlight of one query marks them. */
export function markedBy(things: Iterable<string>, mark: QueryMark): Map<string, QueryMark[]> {
  return new Map([...things].map((key) => [key, [mark]]));
}

/** `marked` less the things `hidden`: what a hidden thing finds is not drawn, so it carries no mark. */
export function markedShown(marked: Marked, hidden: ReadonlySet<string>): Map<string, readonly QueryMark[]> {
  return new Map([...marked].filter(([key, marks]) => !hidden.has(key) && marks.length > 0));
}

/** How a thing with `marks` is drawn: each part's badge once, in the first part's colour. Null for no mark. */
export function drawnOf(marks: readonly QueryMark[] | undefined): QueryMarkDrawn | null {
  const first = marks?.[0];
  if (!marks || !first) return null;
  const glyph = [...new Set(marks.map((m) => BADGE_GLYPHS[m.badge]))].join('');
  return { glyph, hue: first.colour, token: `${QUERY_TOKEN}.${first.colour}` };
}

/** A name with the badge before it, as each painter writes a marked thing's name. */
export const badged = (name: string, d: QueryMarkDrawn | null): string => (d ? `${d.glyph} ${name}` : name);

/** The colour of a highlight's ring, in `p`: the hue blended as the style blends lines, so it keeps 3:1. */
export const queryLine = (hue: string, p: Palette): string => p.blend(hue, STYLE.line_mix);

/** The colour of a highlight's badge, in `p`: the hue blended as the style blends labels, so it keeps 4.5:1. */
export const queryLabel = (hue: string, p: Palette): string => p.blend(hue, STYLE.label_mix);

/** The paint of a highlight's style token in `p`: a line and text in its hue, never a fill. Null for any other. */
export function queryPaint(token: string, p: Palette): { line: string; text: string } | null {
  if (!token.startsWith(`${QUERY_TOKEN}.`)) return null;
  const hue = token.slice(QUERY_TOKEN.length + 1);
  return { line: queryLine(hue, p), text: queryLabel(hue, p) };
}

/** `paints` with a highlight's tokens painted in `p`, every other token as before. */
export function withQueryPaints<P>(paints: (style: string) => P, p: Palette): (style: string) => P {
  return (style) => (queryPaint(style, p) as P | null) ?? paints(style);
}

/**
 * `marks` with the highlight `marked` drawn on them, for a painter of plain marks (the 2D canvas, WebGL 2 and WebGPU).
 * Each marked box keeps its own mark and gets a ring of lines just outside it in the highlight's colour. Its name gets
 * the badge before it. Only marks are added and words changed: no mark is placed or sized anew.
 */
export function withQueryMarks(marks: readonly DrawMark[], marked: Marked): DrawMark[] {
  if (marked.size === 0) return [...marks];
  const out: DrawMark[] = [];
  for (const m of marks) {
    const d = m.of === undefined ? null : drawnOf(marked.get(m.of));
    if (!d) {
      out.push(m);
      continue;
    }
    if (m.kind === 'label') {
      out.push({ ...m, text: badged(m.text, d) });
      continue;
    }
    out.push(m);
    if (m.kind !== 'box') continue;
    for (const at of QUERY_RINGS)
      out.push({
        id: `q${at}:${m.id}`,
        kind: 'box',
        style: d.token,
        of: m.of,
        role: 'picture',
        x: m.x - at,
        y: m.y - at,
        width: m.width + at * 2,
        height: m.height + at * 2,
        ...(m.shape ? { shape: m.shape } : {}),
        ...(m.group ? { group: m.group } : {}),
      });
  }
  return out;
}
