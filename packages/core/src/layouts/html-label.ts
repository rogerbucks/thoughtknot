// A box's label written as Graphviz's HTML-like text, sized and drawn as Graphviz does (editor spec §53,
// layout_own_engine). The core writes a thing's label as a table of rows: its kind, a gap, its name, its properties,
// a data set's table. Our own measuring reads it here and works out how big it is. It gives the steps that draw it,
// in Graphviz's points, counted up from the bottom. Only what the core writes is read: tables, rows, cells, fonts, bold,
// italic and line breaks. Host-free and pure.
import type { GraphvizOp } from '../graphviz-json.ts';
import { textWidth } from './text-width.ts';

/** A run of text in one font. */
interface Span {
  text: string;
  size: number;
  face: string;
  color: string;
  bold: boolean;
  italic: boolean;
  /** Set by any of bold, italic, underline and the like: such text is spaced as Graphviz spaces mixed text. */
  styled: boolean;
}

/** A cell: its attributes, and either its lines of text or a table inside it. */
interface Cell {
  attrs: Record<string, string>;
  lines: Span[][];
  table?: Table;
  /** Worked out: its size, and its place in its table's grid. */
  w: number;
  h: number;
  col: number;
  row: number;
}

/** A table: its attributes and its rows of cells. */
interface Table {
  attrs: Record<string, string>;
  rows: Cell[][];
  w: number;
  h: number;
  cols: number[];
  heights: number[];
}

/** The font a label starts in: its size, family and colour, and whether bold or italic. */
export interface Font {
  size: number;
  face: string;
  color: string;
  bold?: boolean;
  italic?: boolean;
  styled?: boolean;
}

/** Graphviz's space between lines, as a share of the font's size. */
const LINE = 1.2;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** HTML text with its entities read. */
export const unescaped = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : (ENTITIES[e.toLowerCase()] ?? all),
  );

const ATTR = /([a-z-]+)\s*=\s*"([^"]*)"/gi;
const attrsOf = (tag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(ATTR)) out[(m[1] as string).toLowerCase()] = m[2] as string;
  return out;
};
const num = (v: string | undefined, d: number) => (v === undefined || v === '' ? d : Number(v));

/** The width of a run in its font. */
const spanWidth = (sp: Span) => textWidth(sp.text, sp.size, sp.face, sp.bold, sp.italic);

/** The fonts in force as a label is read: a font, bold or italic tag opens one and its end tag closes it. */
function fontStack(start: Font) {
  const fonts: Font[] = [start];
  return {
    top: () => fonts.at(-1) as Font,
    depth: () => fonts.length,
    cut: (n: number) => void (fonts.length = n),
    /** Reads a tag that changes the font; false when it is some other tag. */
    tag(tag: string): boolean {
      const m = /^(\/?)\s*(font|b|i|u|s|o|sub|sup)\b/i.exec(tag);
      if (!m) return false;
      if (m[1]) {
        if (fonts.length > 1) fonts.pop();
        return true;
      }
      const f = fonts.at(-1) as Font;
      const name = (m[2] as string).toLowerCase();
      const a = attrsOf(tag);
      if (name === 'font')
        fonts.push({ ...f, size: num(a['point-size'], f.size), face: a.face ?? f.face, color: a.color ?? f.color });
      else fonts.push({ ...f, bold: f.bold || name === 'b', italic: f.italic || name === 'i', styled: true });
      return true;
    },
  };
}

/** Reads the HTML-like text of a label into a table, or into lines of text when it holds no table. */
function parse(html: string, font: Font): Table | Span[][] {
  const parts = html.match(/<[^>]*>|[^<]+/g) ?? [];
  let i = 0;
  const fonts = fontStack(font);
  const inner = (p: string) => p.slice(1, -1).trim();
  const text = (stop: (tag: string) => boolean): Span[][] => {
    const lines: Span[][] = [[]];
    for (; i < parts.length; i++) {
      const p = parts[i] as string;
      if (p[0] !== '<') {
        const f = fonts.top();
        const run = { text: unescaped(p), size: f.size, face: f.face, color: f.color };
        (lines.at(-1) as Span[]).push({ ...run, bold: !!f.bold, italic: !!f.italic, styled: !!f.styled });
        continue;
      }
      const tag = inner(p);
      if (stop(tag)) return lines;
      if (/^br\b/i.test(tag)) lines.push([]);
      else fonts.tag(tag);
    }
    return lines;
  };
  /** Skips spaces and reads the font tags before a table, if a table comes next. */
  const tableAhead = (): boolean => {
    let k = i;
    for (; k < parts.length; k++) {
      const q = (parts[k] as string).trim();
      if (q === '') continue;
      if (/^<\s*table\b/i.test(q)) break;
      if (!/^<\s*(font|b|i|u)\b/i.test(q)) return false;
    }
    if (k >= parts.length) return false;
    for (; i < k; i++) if ((parts[i] as string).trim()) fonts.tag(inner(parts[i] as string));
    return true;
  };
  const table = (tag: string): Table => {
    const t: Table = { attrs: attrsOf(tag), rows: [], w: 0, h: 0, cols: [], heights: [] };
    for (i++; i < parts.length; i++) {
      const p = (parts[i] as string).trim();
      if (/^<\s*\/\s*table/i.test(p)) return t;
      if (/^<\s*tr\b/i.test(p)) t.rows.push([]);
      else if (/^<\s*td\b/i.test(p)) {
        const cell: Cell = { attrs: attrsOf(p), lines: [], w: 0, h: 0, col: 0, row: 0 };
        i++;
        const depth = fonts.depth();
        if (tableAhead()) {
          cell.table = table(parts[i] as string);
          while (i < parts.length && !/^<\s*\/\s*td/i.test((parts[i] as string).trim())) i++;
        } else cell.lines = text((tg) => /^\/\s*td/i.test(tg)).filter((l) => l.length > 0);
        fonts.cut(depth);
        (t.rows.at(-1) as Cell[]).push(cell);
      }
    }
    return t;
  };
  if (tableAhead()) return table(parts[i] as string);
  return text(() => false);
}

/** Lines of text laid out as Graphviz lays out HTML text: their width, their height and each baseline from the top. */
function block(lines: Span[][]): { w: number; h: number; baselines: number[] } {
  // Graphviz's simple text holds one plain run a line, all in one size: each line a size and a fifth high. Any other is
  // spaced by its sizes alone, each baseline set off by its runs' centre line (a tenth of the size and a point)
  const sizes = lines.map((l) => Math.max(0, ...l.map((sp) => sp.size)));
  const simple = lines.every((l) => l.length <= 1 && l.every((sp) => !sp.styled)) && sizes.every((z) => z === sizes[0]);
  let w = 0,
    h = 0,
    base = 0,
    last = 0;
  const baselines: number[] = [];
  lines.forEach((l, i) => {
    w = Math.max(
      w,
      l.reduce((s, sp) => s + spanWidth(sp), 0),
    );
    const size = sizes[i] as number;
    const offset = Math.max(0, ...l.map((sp) => 1 + sp.size / 10));
    const step = simple ? (i === 0 ? size : size * LINE) : i === 0 ? size - offset : size + h - base - offset;
    base += step;
    baselines.push(base);
    h += simple ? size * LINE : size;
    last = Math.max(0, ...l.map(() => size * LINE));
  });
  return { w, h: lines.length === 1 ? last : h, baselines };
}

/** The width and height of lines of text. */
function linesSize(lines: Span[][]): [number, number] {
  const b = block(lines);
  return [b.w, b.h];
}

const tableNums = (t: Table) => ({
  border: num(t.attrs.border, 1),
  spacing: num(t.attrs.cellspacing, 2),
  padding: num(t.attrs.cellpadding, 2),
  cellBorder: num(t.attrs.cellborder, num(t.attrs.border, 1)),
});
const cellNums = (c: Cell, t: Table) => {
  const n = tableNums(t);
  return { padding: num(c.attrs.cellpadding, n.padding), border: num(c.attrs.border, n.cellBorder) };
};

/** Works out the size of `t` and of each of its cells, as Graphviz does: columns as wide as their widest cell. */
function sizeTable(t: Table): void {
  const { border, spacing } = tableNums(t);
  t.cols = [];
  t.heights = [];
  t.rows.forEach((row, r) => {
    row.forEach((c, k) => {
      const { padding, border: b } = cellNums(c, t);
      let [w, h] = c.table ? (sizeTable(c.table), [c.table.w, c.table.h]) : linesSize(c.lines);
      w += 2 * (padding + b);
      h += 2 * (padding + b);
      if (c.attrs.fixedsize === 'true') {
        w = num(c.attrs.width, w);
        h = num(c.attrs.height, h);
      } else {
        w = Math.max(w, num(c.attrs.width, 0));
        h = Math.max(h, num(c.attrs.height, 0));
      }
      Object.assign(c, { w, h, col: k, row: r });
      t.cols[k] = Math.max(t.cols[k] ?? 0, w);
      t.heights[r] = Math.max(t.heights[r] ?? 0, h);
    });
  });
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  t.w = sum(t.cols) + (t.cols.length + 1) * spacing + 2 * border;
  t.h = sum(t.heights) + (t.heights.length + 1) * spacing + 2 * border;
}

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x0, y1],
  [x1, y1],
  [x1, y0],
];

/** The steps that draw lines of text, centred in the box from (x0, y0) to (x1, y1), or set left. */
function drawLines(lines: Span[][], x0: number, y0: number, x1: number, y1: number, left: boolean): GraphvizOp[] {
  const ops: GraphvizOp[] = [];
  const b = block(lines);
  const top = (y0 + y1) / 2 + b.h / 2;
  lines.forEach((l, i) => {
    const width = l.reduce((s, sp) => s + spanWidth(sp), 0);
    let x = left ? x0 : (x0 + x1) / 2 - width / 2;
    const base = top - (b.baselines[i] as number);
    for (const sp of l) {
      const w = spanWidth(sp);
      ops.push({ op: 'F', size: sp.size, face: sp.face });
      ops.push({ op: 'c', color: sp.color });
      ops.push({ op: 'T', pt: [x, base], align: 'l', width: w, text: sp.text });
      x += w;
    }
  });
  return ops;
}

/** The steps that draw `t` with its top left at (x, top). */
function drawTable(t: Table, x: number, top: number, pen: string, room?: [number, number]): GraphvizOp[] {
  const { border, spacing } = tableNums(t);
  const ops: GraphvizOp[] = [];
  const color = t.attrs.color ?? pen;
  // a table inside a cell fills the cell: the room left over is shared evenly among its columns and its rows
  const [w, h] = room ? [Math.max(room[0], t.w), Math.max(room[1], t.h)] : [t.w, t.h];
  const wider = t.cols.length ? (w - t.w) / t.cols.length : 0;
  const taller = t.heights.length ? (h - t.h) / t.heights.length : 0;
  if (border > 0)
    ops.push({ op: 'S', style: 'solid' }, { op: 'c', color }, { op: 'p', points: rect(x, top - h, x + w, top) });
  let cy = top - border - spacing;
  t.rows.forEach((row, r) => {
    let cx = x + border + spacing;
    const rh = (t.heights[r] ?? 0) + taller;
    row.forEach((c, k) => {
      const cw = (t.cols[k] ?? 0) + wider;
      const { padding, border: b } = cellNums(c, t);
      const [x0, y0, x1, y1] = [cx, cy - rh, cx + cw, cy];
      if (c.attrs.bgcolor) {
        const fill = { op: 'C', color: c.attrs.bgcolor };
        ops.push({ op: 'S', style: 'solid' }, { op: 'c', color: '#fffffe00' }, fill, {
          op: 'P',
          points: rect(x0, y0, x1, y1),
        });
      }
      if (b > 0)
        ops.push(
          { op: 'S', style: 'solid' },
          { op: 'c', color: c.attrs.color ?? color },
          { op: 'p', points: rect(x0, y0, x1, y1) },
        );
      const inset = padding + b;
      if (c.table)
        ops.push(...drawTable(c.table, x0 + inset, y1 - inset, color, [x1 - x0 - 2 * inset, y1 - y0 - 2 * inset]));
      else ops.push(...drawLines(c.lines, x0 + inset, y0 + inset, x1 - inset, y1 - inset, c.attrs.align === 'left'));
      cx += cw + spacing;
    });
    cy -= rh + spacing;
  });
  return ops;
}

/** A label read and sized: its width and height in points, and a way to draw it centred on a point. */
export interface SizedLabel {
  width: number;
  height: number;
  draw(cx: number, cy: number, pen: string): GraphvizOp[];
}

/** Reads and sizes an HTML-like label, written without its outer `<` and `>`, starting in `font`. */
export function htmlLabel(html: string, font: Font): SizedLabel {
  const read = parse(html, font);
  if (Array.isArray(read)) {
    const [width, height] = linesSize(read);
    return {
      width,
      height,
      draw: (cx, cy) => drawLines(read, cx - width / 2, cy - height / 2, cx + width / 2, cy + height / 2, false),
    };
  }
  sizeTable(read);
  return {
    width: read.w,
    height: read.h,
    draw: (cx, cy, pen) => drawTable(read, cx - read.w / 2, cy + read.h / 2, pen),
  };
}
