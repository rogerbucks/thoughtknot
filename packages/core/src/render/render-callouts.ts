// Callouts: part of layer L4 of the rendering spec (wiki/Rendering-spec.md; editor spec §73, render_marks). Far out,
// the top level's clouds are small and their names crowd them, so the placer pushes the names into a jumble. Then
// the names stand in neat columns each side of the drawing, or rows above and below it. Each name is as near level
// with its cloud as the others allow, in the order the clouds lie. A thin line joins each name to its cloud (Roger, 7 Nov
// 2026: "a nice ordering where the major labels appear around the graph"). Nothing in the drawing moves: only the
// names do. Host-free and pure.
import { ITEM_PX, labelOf, sizeOf, type CloudMark, type LabelAsk, type LabelMark, type View } from './render-marks.ts';

/** The gap between the drawing and a column of names, in pixels: room for the lines that join them. */
const LEAD_GAP = 28;
/** The gap between two names in a column, in pixels. */
const ROW_GAP = 6;

/** Whether the placer left `ask`'s name where it belongs: on its cloud, its middle within a line of its spot. */
function inPlace(ask: LabelAsk, kept: LabelMark | undefined): boolean {
  if (!kept) return false;
  const [mx, my] = [kept.x + kept.w / 2, kept.y + kept.h / 2];
  return Math.abs(my - ask.y) <= kept.h && kept.x <= ask.x && ask.x <= kept.x + kept.w && Math.abs(mx - ask.x) < kept.w;
}

/**
 * Where each of a line of cards starts along one side, in order. `at` is where each would like its middle, and `size`
 * its length along the line. Each comes as near its wish as the cards before it allow, and the line slides back from the
 * far end if it must. Null when they do not fit between `lo` and `hi`.
 */
export function pack(rows: readonly { at: number; size: number }[], lo: number, hi: number): number[] | null {
  const long = rows.reduce((sum, r) => sum + r.size, 0) + ROW_GAP * Math.max(0, rows.length - 1);
  if (long > hi - lo) return null;
  const starts: number[] = [];
  let next = lo;
  for (const r of rows) {
    const start = Math.max(next, r.at - r.size / 2);
    starts.push(start);
    next = start + r.size + ROW_GAP;
  }
  // pushed past the far end: the line slides back from there, keeping its order and gaps
  let end = hi + ROW_GAP;
  for (let i = rows.length - 1; i >= 0; i--) {
    const size = (rows[i] as { size: number }).size;
    starts[i] = Math.min(starts[i] as number, end - ROW_GAP - size);
    end = starts[i] as number;
  }
  return starts;
}

/** A card laid out round the drawing: its ask, its size, and the side of the drawing it stands on. */
interface Callout {
  ask: LabelAsk;
  text: string;
  px: number;
  w: number;
  h: number;
}

/** The screen's clear part, and the drawing's box on it. */
interface Frame {
  left: number;
  top: number;
  right: number;
  bottom: number;
  box: [number, number, number, number];
}

/** The cards as two columns, left and right of the drawing, each in the order its clouds lie top to bottom. */
function columns(cards: Callout[], f: Frame): { card: Callout; x: number; y: number; side: 'l' | 'r' }[] | null {
  const [x0, , x1] = f.box;
  const mid = (x0 + x1) / 2;
  const out: { card: Callout; x: number; y: number; side: 'l' | 'r' }[] = [];
  for (const side of ['l', 'r'] as const) {
    const these = cards.filter((k) => (side === 'l') === k.ask.x < mid).sort((p, q) => p.ask.y - q.ask.y);
    const ys = pack(
      these.map((k) => ({ at: k.ask.y, size: k.h })),
      f.top,
      f.bottom,
    );
    if (!ys) return null;
    for (const [i, card] of these.entries()) {
      const x = side === 'l' ? x0 - LEAD_GAP - card.w : x1 + LEAD_GAP;
      if (x < f.left || x + card.w > f.right) return null;
      out.push({ card, x, y: ys[i] as number, side });
    }
  }
  return out;
}

/** The cards as two rows, above and below the drawing, each in the order its clouds lie left to right. */
function rows(cards: Callout[], f: Frame): { card: Callout; x: number; y: number; side: 't' | 'b' }[] | null {
  const [, y0, , y1] = f.box;
  const mid = (y0 + y1) / 2;
  const out: { card: Callout; x: number; y: number; side: 't' | 'b' }[] = [];
  for (const side of ['t', 'b'] as const) {
    const these = cards.filter((k) => (side === 't') === k.ask.y < mid).sort((p, q) => p.ask.x - q.ask.x);
    const xs = pack(
      these.map((k) => ({ at: k.ask.x, size: k.w })),
      f.left,
      f.right,
    );
    if (!xs) return null;
    for (const [i, card] of these.entries()) {
      const y = side === 't' ? y0 - LEAD_GAP - card.h : y1 + LEAD_GAP;
      if (y < f.top || y + card.h > f.bottom) return null;
      out.push({ card, x: xs[i] as number, y, side });
    }
  }
  return out;
}

/** How far a card moves out from the drawing at each try, and turns about it, in pixels and radians. */
const [STEP_OUT, STEP_TURN] = [12, Math.PI / 18];
/** The turns tried at each step out, nearest the card's own way first: up to 90 degrees either side. */
const TURNS = [0, ...Array.from({ length: 9 }, (_, i) => [i + 1, -(i + 1)]).flat()];
/** What one turn costs against going out, in pixels: a card would sooner stand further out on its own side. */
const TURN_COST = 36;
/** Every place to try, out to `reach` pixels from the middle, cheapest first. */
const TRIES = (reach: number): { d: number; turn: number }[] =>
  Array.from({ length: Math.ceil(reach / STEP_OUT) }, (_, i) => TURNS.map((turn) => ({ d: i * STEP_OUT, turn })))
    .flat()
    .sort((p, q) => p.d + Math.abs(p.turn) * TURN_COST - (q.d + Math.abs(q.turn) * TURN_COST));

/**
 * The cards round the drawing in the clear space left, where neither columns nor rows fit. Each goes on the line from
 * the drawing's middle through its cloud, as near the drawing as it fits. It turns a little either way if it must.
 * Cards go in the order their clouds lie round the middle, so neighbours stay neighbours.
 */
function ring(
  cards: Callout[],
  f: Frame,
): { card: Callout; x: number; y: number; side: 'l' | 'r' | 't' | 'b' }[] | null {
  const [x0, y0, x1, y1] = f.box;
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const angle = (k: Callout) => Math.atan2(k.ask.y - cy, k.ask.x - cx);
  const out: { card: Callout; x: number; y: number; side: 'l' | 'r' | 't' | 'b' }[] = [];
  const clear = (x: number, y: number, w: number, h: number) =>
    x >= f.left &&
    y >= f.top &&
    x + w <= f.right &&
    y + h <= f.bottom &&
    (x + w + ROW_GAP <= x0 || x >= x1 + ROW_GAP || y + h + ROW_GAP <= y0 || y >= y1 + ROW_GAP) &&
    out.every(
      (o) =>
        x + w + ROW_GAP <= o.x ||
        o.x + o.card.w + ROW_GAP <= x ||
        y + h + ROW_GAP <= o.y ||
        o.y + o.card.h + ROW_GAP <= y,
    );
  const reach = Math.hypot(f.right - f.left, f.bottom - f.top);
  for (const card of [...cards].sort((p, q) => angle(p) - angle(q))) {
    const a = angle(card);
    let spot: { x: number; y: number } | null = null;
    // the nearest clear place, a turn away from the card's own way counting as much as TURN_COST pixels out
    for (const { d, turn } of TRIES(reach)) {
      const t = a + turn * STEP_TURN;
      const [x, y] = [cx + Math.cos(t) * d - card.w / 2, cy + Math.sin(t) * d - card.h / 2];
      if (clear(x, y, card.w, card.h)) {
        spot = { x, y };
        break;
      }
    }
    if (!spot) continue; // no room left for this one: it goes unnamed, as the placer would leave it
    // the side of the card facing the drawing's middle, where its line starts
    const [dx, dy] = [spot.x + card.w / 2 - cx, spot.y + card.h / 2 - cy];
    const side = Math.abs(dx) * card.h > Math.abs(dy) * card.w ? (dx < 0 ? 'l' : 'r') : dy < 0 ? 't' : 'b';
    out.push({ card, ...spot, side });
  }
  return out;
}

/**
 * The names laid round the drawing, when the top level's names no longer fit on their clouds. `asks` are every name
 * asked for, `tops` the top level's clouds on the screen by key, and `placed` what the placer made of them. They
 * stand in columns beside the drawing, or rows above and below it, or else round it where there is room. Null while
 * every top-level name sits on its own cloud.
 */
export function calloutsOf(
  asks: readonly LabelAsk[],
  tops: Map<string, CloudMark>,
  placed: readonly LabelMark[],
  view: View,
): LabelMark[] | null {
  const heads = asks.filter((a) => tops.has(a.key));
  if (heads.length < 2) return null;
  const kept = new Map(placed.map((m) => [m.key, m]));
  if (heads.every((a) => inPlace(a, kept.get(a.key)))) return null;
  const c = view.clear ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const clouds = heads.map((a) => tops.get(a.key) as CloudMark);
  const f: Frame = {
    left: c.left + ROW_GAP,
    top: c.top + ROW_GAP,
    right: view.w - c.right - ROW_GAP,
    bottom: view.h - c.bottom - ROW_GAP,
    box: [
      Math.min(...clouds.map((m) => m.x - m.r)),
      Math.min(...clouds.map((m) => m.y - m.r)),
      Math.max(...clouds.map((m) => m.x + m.r)),
      Math.max(...clouds.map((m) => m.y + m.r)),
    ],
  };
  // round the drawing a card is one line: its name, at an item's size, without its count, so more of them fit
  const cards = heads.map((ask) => {
    const slim = { ...ask, px: Math.min(ask.px, ITEM_PX), sub: undefined };
    return { ask: slim, ...sizeOf(slim) };
  });
  const laid = columns(cards, f) ?? rows(cards, f) ?? ring(cards, f);
  if (!laid) return null;
  const out = laid.map(({ card, x, y, side }): LabelMark => {
    // the line runs from the middle of the card's side facing the drawing to the edge of its cloud, facing the card
    const cloud = tops.get(card.ask.key) as CloudMark;
    const [sx, sy]: [number, number] =
      side === 'l' || side === 'r'
        ? [side === 'l' ? x + card.w : x, y + card.h / 2]
        : [x + card.w / 2, side === 't' ? y + card.h : y];
    const d = Math.hypot(sx - cloud.x, sy - cloud.y) || 1;
    const [ex, ey] = [cloud.x + ((sx - cloud.x) / d) * cloud.r, cloud.y + ((sy - cloud.y) / d) * cloud.r];
    return { ...labelOf(card.ask, card, { x, y, w: card.w, h: card.h }), lead: [sx, sy, ex, ey] };
  });
  // any other name is kept where the placer put it, if it stays clear of the cards round the drawing
  const apart = (p: LabelMark, q: LabelMark) =>
    p.x >= q.x + q.w || q.x >= p.x + p.w || p.y >= q.y + q.h || q.y >= p.y + p.h;
  const rest = placed.filter((m) => !tops.has(m.key) && out.every((o) => apart(m, o)));
  return [...out, ...rest];
}
