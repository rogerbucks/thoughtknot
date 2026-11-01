// Where a direct link's words go (editor spec §25, untangle_direct), for direct-links.ts. Roger, 24 Oct 2026: "Try and
// avoid too many label overlaps." So each link's words take the spot along its curve that covers the least. Best is a
// spot over no box, no words placed already and no other line. Host-free and pure.
import type { DrawMark } from './drawing-marks.ts';
import type { Curve, Placed } from './direct-curve.ts';
import type { MarkPoint } from './plugin-diagrams.ts';
import { Work, WORK_MOST } from './layout-work.ts';

/** How far a link's words sit off its middle, as a share of their size, so they do not lie on the line. */
export const WORDS_OFF = 0.55;

/** The key of the dot a trunk's links part at (fold-source.ts). */
const TRUNK_OUT = /^trunk: \d+ out$/;

/** The end of a fan of links its one block of words sits near. */
export type FanEnd = 'from' | 'to';

/**
 * Fans of links, so each is labelled once (editor spec §68, layout_one_label_per_fan). Roger, 25 Oct 2026: "the
 * layouts are still a hideous mess". Links of one type into one thing are a fan, and so are those out of one thing. A
 * fan keeps its first link's words, near the end it shares. The rest of its words are gone. A link into a fan of its
 * own is never counted in one out of a thing as well. Links between the same two things show each row of words once.
 * A trunk's links show none: its own words count them.
 */
export function fans(marks: readonly DrawMark[]): { gone: Set<string>; near: Map<string, FanEnd> } {
  const ends = new Map<string, { from: string; to: string }>();
  for (const m of marks)
    if (m.kind === 'link' && m.of !== undefined && m.from !== undefined && m.to !== undefined && m.from !== m.to)
      ends.set(m.of, { from: m.from, to: m.to });
  const gone = new Set<string>(),
    near = new Map<string, FanEnd>(),
    fanned = new Set<string>();
  // links between the same two things share their words: each row once
  const words = new Map<string, (DrawMark & { kind: 'label' })[]>();
  for (const m of marks)
    if (m.kind === 'label' && m.of !== undefined && ends.has(m.of)) {
      // past a trunk, its links are told by the trunk's count of them: their own words are gone
      if (TRUNK_OUT.test(ends.get(m.of)?.from ?? '')) {
        gone.add(m.id);
        continue;
      }
      const rows = words.get(m.of) ?? [];
      if (rows.some((r) => r.text === m.text)) gone.add(m.id);
      else words.set(m.of, [...rows, m]);
    }
  for (const end of ['to', 'from'] as const) {
    const byFan = new Map<string, string[]>();
    for (const [of, rows] of words) {
      if (fanned.has(of)) continue;
      const k = `${(ends.get(of) as { from: string; to: string })[end]}\n${rows.map((m) => m.text).join('\n')}`;
      byFan.set(k, [...(byFan.get(k) ?? []), of]);
    }
    for (const [first, ...rest] of byFan.values()) {
      if (!rest.length || first === undefined) continue;
      near.set(first, end);
      for (const of of [first, ...rest]) fanned.add(of);
      for (const of of rest) for (const m of words.get(of) ?? []) gone.add(m.id);
    }
  }
  return { gone, near };
}

/** Where along a link its words are tried, in turn: from the middle out, or from the end its fan shares. */
const ALONG: Readonly<Record<FanEnd | 'middle', readonly number[]>> = {
  middle: [0.5, 0.4, 0.6, 0.3, 0.7, 0.25, 0.75],
  to: [0.8, 0.75, 0.85, 0.7, 0.65, 0.6, 0.5],
  from: [0.2, 0.25, 0.15, 0.3, 0.35, 0.4, 0.5],
};

/**
 * Where each link's words go, by the id of each of its labels. A link's labels move as one block, its rows kept as
 * Graphviz set them. The block sits at the middle of the curve if it covers no box, no earlier words and no other line.
 * Else it takes the first clear spot along it, either side, a little further off if need be. With no clear spot, it
 * takes the one that covers least. Given `fan`, words it has gone are not placed. A fan's words start near its end,
 * and every block keeps off the words that name no link. Each box, word or line a spot is checked against counts
 * against `work`. Once it is spent, each block left takes the first spot it would have tried (layout_work_counted).
 */
export function wordSpots(
  marks: readonly DrawMark[],
  boxes: ReadonlyMap<string, Placed>,
  curves: ReadonlyMap<string, Curve>,
  fan?: ReturnType<typeof fans>,
  work = new Work(WORK_MOST.words),
): Map<string, MarkPoint> {
  const taken = new Grid<Rect>();
  for (const b of boxes.values()) taken.addRect({ x0: b.x - b.hw, y0: b.y - b.hh, x1: b.x + b.hw, y1: b.y + b.hh });
  // with fans, as our own engine draws, the words that name no link are kept clear too, a group's name among them
  for (const m of fan ? marks : [])
    if (m.kind === 'label' && (m.of === undefined || !curves.has(m.of))) {
      const wide = m.maxWidth ?? m.text.length * m.size * 0.5;
      const left = m.anchor === 'start' ? m.x : m.anchor === 'end' ? m.x - wide : m.x - wide / 2;
      taken.addRect({ x0: left, y0: m.y - m.size * 0.84, x1: left + wide, y1: m.y + m.size * 0.24 });
    }
  const spots = new Map<string, MarkPoint>();
  // points along every line, so words can keep off the lines they do not name
  const ats = new Grid<{ of: string; x: number; y: number }>();
  for (const [of, c] of curves)
    for (const t of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
      const [x, y] = c.at(t);
      ats.addPoint({ of, x, y });
    }
  const words = new Map<string, (DrawMark & { kind: 'label' })[]>();
  for (const m of marks)
    if (m.kind === 'label' && m.of !== undefined && !boxes.has(m.of) && curves.has(m.of) && !fan?.gone.has(m.id))
      words.set(m.of, [...(words.get(m.of) ?? []), m]);
  for (const [of, rows] of words) {
    const c = curves.get(of) as Curve;
    // the block's middle, and each row's room from it
    const mx = rows.reduce((n, m) => n + m.x, 0) / rows.length,
      my = rows.reduce((n, m) => n + m.y, 0) / rows.length;
    const size = Math.max(...rows.map((m) => m.size));
    const room = rows.map((m) => {
      const half = (m.maxWidth ?? m.text.length * m.size * 0.5) / 2 + 2;
      return { x0: m.x - mx - half, y0: m.y - my - m.size * 0.84, x1: m.x - mx + half, y1: m.y - my + m.size * 0.24 };
    });
    const tall = Math.max(...room.map((r) => r.y1)) - Math.min(...room.map((r) => r.y0));
    const placed = ([x, y]: MarkPoint): Rect[] =>
      room.map((r) => ({ x0: x + r.x0, y0: y + r.y0, x1: x + r.x1, y1: y + r.y1 }));
    // how much the block at `p` covers: the area of boxes and words under it, and a share for each line crossed
    const cover = (p: MarkPoint) => {
      let n = 0;
      for (const r of placed(p)) {
        const under = taken.near(r),
          lines = ats.near(r);
        if (!work.take(under.length + lines.length)) return undefined;
        for (const o of under)
          n +=
            Math.max(0, Math.min(r.x1, o.x1) - Math.max(r.x0, o.x0)) *
            Math.max(0, Math.min(r.y1, o.y1) - Math.max(r.y0, o.y0));
        for (const { of: on, x, y } of lines)
          if (on !== of && x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) n += size * size * 0.36;
      }
      return n;
    };
    // off the line by half the block's height: one row sits as far off as WORDS_OFF says
    const off = Math.max(size * WORDS_OFF, tall / 2);
    const along = ALONG[fan?.near.get(of) ?? 'middle'];
    let best: MarkPoint = c.wordsAt(along[0] as number, off),
      least = Infinity;
    search: for (const far of [off, off * 2.2])
      for (const t of along)
        for (const side of [1, -1]) {
          const p = c.wordsAt(t, side * far);
          const n = cover(p);
          if (n === undefined) break search; // the budget is spent: the best found so far, or the first spot
          if (n < least) [best, least] = [p, n];
          if (!n) break search;
        }
    for (const m of rows) spots.set(m.id, [best[0] + m.x - mx, best[1] + m.y - my]);
    for (const r of placed(best)) taken.addRect(r);
  }
  return spots;
}

type Rect = { x0: number; y0: number; x1: number; y1: number };

/** The side of a grid cell, in pixels: about a box's height, so a block of words looks in only a few cells. */
const CELL = 64;

/**
 * Rectangles and points filed by the cells of a grid, so a block of words is checked only against what is near it. A
 * big graph's words are placed in about the time of their count, not its square. What it gives comes in the order it
 * was added. So every sum is made in the same order as over the whole list, and comes out the same to the last bit.
 */
class Grid<T extends Rect | { x: number; y: number }> {
  private readonly items: T[] = [];
  private readonly cells = new Map<number, number[]>();
  private seen = new Uint32Array(64);
  private asked = 0;

  addRect(r: T & Rect): void {
    this.file(r, r.x0, r.y0, r.x1, r.y1);
  }

  addPoint(p: T & { x: number; y: number }): void {
    this.file(p, p.x, p.y, p.x, p.y);
  }

  /** What may meet `r`: each item filed in a cell it touches, once, in the order added. */
  near(r: Rect): T[] {
    this.asked++;
    if (this.asked === 0xffffffff) {
      this.seen.fill(0);
      this.asked = 1;
    }
    const found: number[] = [];
    for (let cx = cell(r.x0); cx <= cell(r.x1); cx++)
      for (let cy = cell(r.y0); cy <= cell(r.y1); cy++)
        for (const i of this.cells.get(key(cx, cy)) ?? [])
          if (this.seen[i] !== this.asked) {
            this.seen[i] = this.asked;
            found.push(i);
          }
    return found.sort((a, b) => a - b).map((i) => this.items[i] as T);
  }

  private file(item: T, x0: number, y0: number, x1: number, y1: number): void {
    const i = this.items.push(item) - 1;
    if (i >= this.seen.length) {
      const more = new Uint32Array(this.seen.length * 2);
      more.set(this.seen);
      this.seen = more;
    }
    for (let cx = cell(x0); cx <= cell(x1); cx++)
      for (let cy = cell(y0); cy <= cell(y1); cy++) {
        const k = key(cx, cy);
        const list = this.cells.get(k);
        if (list) list.push(i);
        else this.cells.set(k, [i]);
      }
  }
}

const cell = (v: number) => Math.floor(v / CELL);
/** One number for a cell, for cells within a million of the origin each way: far past any drawing. */
const key = (cx: number, cy: number) => (cx + 1_000_000) * 2_000_003 + (cy + 1_000_000);
