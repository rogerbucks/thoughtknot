// Things stay put (editor spec §68, things_stay_put). A card drawn again, by the same layout, keeps each thing it showed
// where it was. A View menu switch, a filter or an edit to the note then moves nothing already on screen. A thing new
// to the drawing keeps the place the fresh layout gave it, beside a neighbour it shows already.
// Each card's last drawing by our own engine says where it put each thing (`KeptSpots`, for layout-worker.ts).
import type { GraphDrawing } from '../note-reading.ts';
import type { Drawn } from '../render.ts';
import type { LaidMarks } from '../graphviz-marks.ts';
import type { GroupBox } from './grouped.ts';
import type { SourceGroup } from './own-draw.ts';

/** The attribute of our own engine's drawing that says where it put each thing, for the next drawing to keep. */
export const SPOTS_ATTRIBUTE = 'data-layout-spots';

/** A thing's middle, in our own engine's CSS pixels. */
type Spot = [number, number];

/**
 * `fresh` with every thing in `kept` back where it was. A new thing keeps its fresh offset from the first thing it
 * links to that was kept. With none, it moves as the kept things moved on the whole, so it lands near where it was.
 */
export function keptSpots(
  fresh: ReadonlyMap<string, Spot>,
  kept: ReadonlyMap<string, Spot>,
  links: readonly { from: string; to: string }[],
): Map<string, Spot> {
  const both = [...fresh.keys()].filter((k) => kept.has(k));
  if (!both.length) return new Map(fresh);
  // how far the kept things moved on the whole, from their fresh spots back to their kept ones
  const shift: Spot = [0, 1].map(
    (d) => both.reduce((t, k) => t + (kept.get(k)?.[d] ?? 0) - (fresh.get(k)?.[d] ?? 0), 0) / both.length,
  ) as Spot;
  const next = new Map<string, string[]>();
  for (const { from, to } of links) {
    next.set(from, [...(next.get(from) ?? []), to]);
    next.set(to, [...(next.get(to) ?? []), from]);
  }
  const out = new Map<string, Spot>();
  for (const [k, [x, y]] of fresh) {
    const was = kept.get(k);
    if (was) {
      out.set(k, [was[0], was[1]]);
      continue;
    }
    const by = (next.get(k) ?? []).find((n) => kept.has(n) && fresh.has(n));
    const [nx, ny] = by ? (fresh.get(by) as Spot) : [0, 0];
    const [kx, ky] = by ? (kept.get(by) as Spot) : shift;
    out.set(k, by ? [kx + x - nx, ky + y - ny] : [x + kx, y + ky]);
  }
  return out;
}

/** The spots of a drawing, as an attribute's text: each thing's middle, to a thousandth of a pixel. So each box is drawn exactly where it was. */
export const spotsSaid = (spots: ReadonlyMap<string, readonly number[]>): string =>
  encodeURIComponent(
    JSON.stringify(Object.fromEntries([...spots].map(([k, [x = 0, y = 0]]) => [k, [round(x), round(y)]]))),
  );

const round = (n: number): number => Math.round(n * 1000) / 1000;

/** The spots an attribute's text `said` holds, each a pair of finite numbers; none for text that is not. */
export function spotsHeard(said: string | null | undefined): Map<string, Spot> {
  try {
    const all = JSON.parse(decodeURIComponent(said ?? '')) as Record<string, unknown>;
    const pair = (v: unknown): v is Spot =>
      Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
    return new Map(Object.entries(all).flatMap(([k, v]) => (pair(v) ? [[k, v] as const] : [])));
  } catch {
    return new Map();
  }
}

/** What makes a drawing laid out the same way as another: so its things may keep their spots. */
const sameLayout = (d: GraphDrawing): string =>
  JSON.stringify([d.graph, d.engine, d.diagram, d.direction, d.layoutOptions, d.kindLanes, d.routing]);

const SPOTS = new RegExp(`<svg\\b[^>]*\\s${SPOTS_ATTRIBUTE}="([^"]*)"`);

/** Each card's last spots, by the layout they were laid out by. */
export class KeptSpots {
  private readonly last = new WeakMap<
    object,
    { layout: string; spots: Record<string, [number, number]>; rankdir?: string }
  >();

  /** `drawing` for `owner`, with the spots its last drawing by the same layout put things at. */
  onto(owner: object, drawing: GraphDrawing): GraphDrawing {
    const was = this.last.get(owner);
    // an exploration places its things itself (explore_shapes); a plug-in's layout gives its own spots
    if (!was || drawing.placed || drawing.engine !== 'own' || was.layout !== sameLayout(drawing)) return drawing;
    // drawn again the way it was, not tried every way: a way not shown would keep its spots too, and might be picked
    return { ...drawing, kept: was.spots, ...(drawing.direction || !was.rankdir ? {} : { direction: was.rankdir }) };
  }

  /** Hears where `drawn` put each thing for `owner`, and where its settled layout does once that comes. */
  heard(owner: object, drawing: GraphDrawing, drawn: unknown): void {
    if (!drawn || typeof drawn !== 'object' || !('svg' in drawn)) return;
    const d = drawn as Drawn;
    const spots = spotsHeard(SPOTS.exec(d.svg)?.[1]);
    if (spots.size)
      this.last.set(owner, { layout: sameLayout(drawing), spots: Object.fromEntries(spots), rankdir: d.rankdir });
    void d.better?.then((b) => b && this.heard(owner, drawing, b));
  }
}

/** The bounds of the things in `members` at `at`, each thing `size` big; none when none of them is there. */
function boundsAt(
  members: readonly string[],
  at: ReadonlyMap<string, readonly [number, number]>,
  size: ReadonlyMap<string, readonly [number, number]>,
): [number, number, number, number] | null {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const k of members) {
    const p = at.get(k);
    if (!p) continue;
    const [w, h] = size.get(k) ?? [0, 0];
    [x0, y0, x1, y1] = [
      Math.min(x0, p[0] - w / 2),
      Math.min(y0, p[1] - h / 2),
      Math.max(x1, p[0] + w / 2),
      Math.max(y1, p[1] + h / 2),
    ];
  }
  return x0 <= x1 ? [x0, y0, x1, y1] : null;
}

/** Each group's box moved and sized round its things `now`, with the room round them it had round them `was`. */
export function boxesRound(
  boxes: readonly GroupBox[],
  groups: readonly SourceGroup[],
  was: ReadonlyMap<string, readonly [number, number]>,
  now: ReadonlyMap<string, readonly [number, number]>,
  size: ReadonlyMap<string, readonly [number, number]>,
): GroupBox[] {
  const members = new Map(groups.map((g) => [g.id, g.members]));
  return boxes.map((b) => {
    const these = members.get(b.id) ?? [];
    const [before, after] = [boundsAt(these, was, size), boundsAt(these, now, size)];
    if (!before || !after) return b;
    // the room the fresh layout left round its things, each side: its name's room at the top is the most
    const [l, t] = [before[0] - (b.x - b.width / 2), before[1] - (b.y - b.height / 2)];
    const [r, d] = [b.x + b.width / 2 - before[2], b.y + b.height / 2 - before[3]];
    const [x0, y0, x1, y1] = [after[0] - l, after[1] - t, after[2] + r, after[3] + d];
    return { ...b, x: (x0 + x1) / 2, y: (y0 + y1) / 2, width: x1 - x0, height: y1 - y0 };
  });
}

/** Whether every thing `kept` is drawn at `at` where it was kept, to a hundredth of a pixel. */
export const sameSpots = (at: ReadonlyMap<string, readonly number[]>, kept: ReadonlyMap<string, readonly number[]>) =>
  [...kept].every(([k, [x = 0, y = 0]]) => {
    const [ax, ay] = at.get(k) ?? [x, y]; // one gone from the drawing moves nothing
    return Math.abs((ax ?? 0) - x) < 0.01 && Math.abs((ay ?? 0) - y) < 0.01;
  });

/**
 * Where each thing is drawn in `laid`: after links moved boxes apart and the drawing grew round a curve. So a drawing
 * that keeps these spots puts each thing where the person saw it, and does not grow again (things_stay_put).
 */
export function drawnAt(laid: LaidMarks): Map<string, [number, number]> {
  const at = new Map<string, [number, number]>();
  for (const m of laid.marks)
    if (m.kind === 'box' && m.role === 'thing' && m.of !== undefined && !at.has(m.of))
      at.set(m.of, [m.x + m.width / 2, m.y + m.height / 2]);
  return at;
}
