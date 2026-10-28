// A board drawn, and said (editor spec §45, board_view and board_keyboard). The core turns a board into one SVG picture
// in the host's colours. Each item is drawn at its place by its kind, lower layers first. Each connector is a line
// with an arrow and its label. Only what is in view is drawn, so a large board stays quick (board_speed). The host
// pans and zooms it as it does a drawing.
//
// Each item is also said in words: its kind, its text and what it joins. That is its title in the picture, for a
// screen reader, and a line of the outline, which lists the whole board as text.
//
// Host-free and pure. The colours are the palette's, and every word is escaped.
import { isolated } from './bidi.ts';
import type { Board, BoardItem, BoardKind } from './board.ts';
import { STYLE } from './layout.ts';
import type { Palette } from './palette.ts';
import { STYLE_HUES } from './style-graph.ts';
import { word } from './words.ts';

/** A place and size on the board. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One line of the outline: the item, how deep it sits inside frames, and what is said of it. */
export interface OutlineLine {
  id: string;
  depth: number;
  said: string;
}

// the size of each kind when its item gives none, and the hue it is drawn in when its style names none
const SIZES: Record<BoardKind, [number, number]> = {
  Sticky: [160, 160],
  Card: [200, 120],
  Text: [200, 40],
  Shape: [120, 80],
  Frame: [400, 300],
  Ink: [120, 80],
  Image: [200, 150],
  Glyph: [48, 48],
};
const HUES: Partial<Record<BoardKind, string>> = {
  Sticky: 'yellow',
  Card: 'blue',
  Shape: 'purple',
  Frame: 'cyan',
  Glyph: 'orange',
};

/** Text made safe to write inside an SVG element or attribute. */
const escaped = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
/** A number as SVG writes it, to two places. */
const num = (x: number) => String(Math.round(x * 100) / 100);

/** An item's box: its own size where written, else its kind's. */
export function itemBox(item: BoardItem): Box {
  const [w, h] = SIZES[item.kind];
  return { x: item.x, y: item.y, w: item.w ?? w, h: item.h ?? h };
}

/** Whether two boxes overlap. */
const meets = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Whether box `a` lies wholly inside box `b`. */
const inside = (a: Box, b: Box) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

/** The kind of an item, in words. */
const kindSaid = (kind: BoardKind) => word(`board.kind.${kind.toLowerCase() as Lowercase<BoardKind>}`);

/** An item named in words: its kind and text, or its kind alone. */
const named = (item: BoardItem) =>
  item.text ? word('board.said', { kind: kindSaid(item.kind), text: item.text }) : kindSaid(item.kind);

/** What is said of an item: its kind, its text, and each item it leads to or comes from, with the connector's label. */
export function itemSaid(board: Board, item: BoardItem): string {
  const byId = new Map(board.items.map((i) => [i.id, i]));
  const joins: string[] = [];
  for (const c of board.connectors) {
    const out = c.from === item.id,
      other = byId.get(out ? c.to : c.from);
    if ((!out && c.to !== item.id) || !other) continue;
    const key = out ? 'board.leads-to' : 'board.comes-from';
    const said = named(other);
    joins.push(c.label ? word(`${key}-as`, { other: said, label: c.label }) : word(key, { other: said }));
  }
  return [named(item), ...joins].join('. ');
}

/** The outline: every item once, top to bottom then left to right, with what each frame holds under it. */
export function boardOutline(board: Board): OutlineLine[] {
  const boxes = new Map(board.items.map((i) => [i.id, itemBox(i)]));
  const order = [...board.items].sort((a, b) => a.y - b.y || a.x - b.x);
  const frames = order.filter((i) => i.kind === 'Frame');
  // each item's frame: the smallest frame it lies wholly inside, other than itself
  const parent = new Map<string, string | null>();
  for (const item of order) {
    const box = boxes.get(item.id) as Box;
    const holders = frames.filter((f) => f.id !== item.id && inside(box, boxes.get(f.id) as Box));
    const area = (f: BoardItem) => (boxes.get(f.id) as Box).w * (boxes.get(f.id) as Box).h;
    holders.sort((a, b) => area(a) - area(b));
    parent.set(item.id, holders[0]?.id ?? null);
  }
  const lines: OutlineLine[] = [];
  const add = (holder: string | null, depth: number) => {
    for (const item of order)
      if (parent.get(item.id) === holder) {
        lines.push({ id: item.id, depth, said: itemSaid(board, item) });
        if (item.kind === 'Frame') add(item.id, depth + 1);
      }
  };
  add(null, 0);
  return lines;
}

/** Where the line from a box's centre toward a point leaves the box. */
function edgeOf(box: Box, toward: [number, number]): [number, number] {
  const cx = box.x + box.w / 2,
    cy = box.y + box.h / 2;
  const dx = toward[0] - cx,
    dy = toward[1] - cy;
  if (!dx && !dy) return [cx, cy];
  const t = Math.min(dx ? box.w / 2 / Math.abs(dx) : Infinity, dy ? box.h / 2 / Math.abs(dy) : Infinity);
  return [cx + dx * t, cy + dy * t];
}

/** An item's text broken into lines that fit its width, at about six tenths of the font size a character. */
function linesOf(text: string, width: number, size: number): string[] {
  const most = Math.max(4, Math.floor(width / (0.6 * size)));
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      if (line && line.length + 1 + w.length > most) {
        lines.push(line);
        line = w;
      } else line = line ? `${line} ${w}` : w;
    }
    lines.push(line);
  }
  return lines;
}

/** One item drawn: its shape in its hue, its text inside it, and what is said of it as its title. */
function itemSvg(board: Board, item: BoardItem, palette: Palette): string {
  const box = itemBox(item);
  const own = item.style && STYLE_HUES.includes(item.style) ? item.style : undefined;
  const hue = own ?? HUES[item.kind];
  const fill = item.kind === 'Frame' || !hue ? 'none' : palette.fill(hue);
  const stroke = hue ? palette.blend(hue, STYLE.line_mix) : palette.edge;
  const dash = item.kind === 'Frame' || item.kind === 'Ink' ? ' stroke-dasharray="6 4"' : '';
  const corner = item.kind === 'Card' || item.kind === 'Frame' ? 8 : item.kind === 'Shape' ? box.h / 2 : 2;
  const shape =
    item.kind === 'Text'
      ? ''
      : `<rect x="${num(box.x)}" y="${num(box.y)}" width="${num(box.w)}" height="${num(box.h)}" rx="${num(corner)}" fill="${fill}" stroke="${stroke}"${dash}/>`;
  const size = item.kind === 'Frame' ? STYLE.kind_font_size : STYLE.font_size;
  const pad = 8;
  const text = item.text
    ? linesOf(item.text, box.w - 2 * pad, size)
        .map(
          (l, i) =>
            `<tspan x="${num(box.x + pad)}" y="${num(box.y + pad + size * (1 + i * STYLE.line_height))}">${isolated(escaped(l))}</tspan>`,
        )
        .join('')
    : '';
  const words = text
    ? `<text font-family="${STYLE.font}" font-size="${num(size)}" fill="${item.kind === 'Frame' ? palette.muted : palette.text}" aria-hidden="true">${text}</text>`
    : '';
  return `<g data-item="${escaped(item.id)}" role="img"><title>${escaped(itemSaid(board, item))}</title>${shape}${words}</g>`;
}

/**
 * The board as one SVG picture in `palette`'s colours. With `view`, only the items that meet it are drawn, and only the
 * connectors with an end among them. Lower layers come first, then the order written.
 */
export function boardSvg(board: Board, palette: Palette, view?: Box): string {
  const boxes = new Map(board.items.map((i) => [i.id, itemBox(i)]));
  const shown = board.items
    .map((item, at) => ({ item, at }))
    .filter(({ item }) => !view || meets(boxes.get(item.id) as Box, view))
    .sort((a, b) => (a.item.layer ?? 0) - (b.item.layer ?? 0) || a.at - b.at)
    .map(({ item }) => item);
  const near = new Set(shown.map((i) => i.id));
  const lines = board.connectors.flatMap((c) => {
    const a = boxes.get(c.from),
      b = boxes.get(c.to);
    if (!a || !b || (!near.has(c.from) && !near.has(c.to))) return [];
    const [x1, y1] = edgeOf(a, [b.x + b.w / 2, b.y + b.h / 2]);
    const [x2, y2] = edgeOf(b, [a.x + a.w / 2, a.y + a.h / 2]);
    const label = c.label
      ? `<text x="${num((x1 + x2) / 2)}" y="${num((y1 + y2) / 2 - 4)}" font-family="${STYLE.font}" font-size="${num(STYLE.kind_font_size)}" text-anchor="middle" fill="${palette.muted}">${isolated(escaped(c.label))}</text>`
      : '';
    return [
      `<g data-connector="${escaped(`${c.from}-${c.to}`)}"><line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${palette.edge}" marker-end="url(#board-arrow)"/>${label}</g>`,
    ];
  });
  const all = [...boxes.values()];
  const frame = view ?? {
    x: Math.min(0, ...all.map((b) => b.x)),
    y: Math.min(0, ...all.map((b) => b.y)),
    w: Math.max(1, ...all.map((b) => b.x + b.w)) - Math.min(0, ...all.map((b) => b.x)),
    h: Math.max(1, ...all.map((b) => b.y + b.h)) - Math.min(0, ...all.map((b) => b.y)),
  };
  const box = `${num(frame.x)} ${num(frame.y)} ${num(frame.w)} ${num(frame.h)}`;
  const page = palette.page ? ` style="background:${palette.page}"` : '';
  const sheet = palette.style ? `<style>${palette.style}</style>` : '';
  const arrow = `<defs><marker id="board-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${palette.edge}"/></marker></defs>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="${num(frame.w)}" height="${num(frame.h)}" role="img"${page}>` +
    `${sheet}<title>${escaped(word('board.title', { name: board.name }))}</title>${arrow}` +
    `${shown.map((i) => itemSvg(board, i, palette)).join('')}${lines.join('')}</svg>`
  );
}
