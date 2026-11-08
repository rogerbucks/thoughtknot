// Focus: part of layer L4 of the rendering spec (wiki/Rendering-spec.md; editor spec §73, render_focus). What the
// reader points at or chooses is clearly marked (Roger, 7 Nov 2026). Its dot or cloud gets a firm ring and its name a
// firm edge. Its links are drawn bold to each linked thing on the screen. A signpost at the edge points to each one
// off it. Other roads fade back. A chosen road is marked the same way, and so are its two ends. Host-free and pure.
import { inkOf, type Look } from './render-look.ts';
import { chevronsOf, countOf, edgesOf, sayOf } from './render-roads.ts';
import type { Spot } from './render-rooms.ts';
import type { Scene } from './render-scene.ts';
import { signAt } from './render-signs.ts';
import { archOf, onScreen } from './render-tilt.ts';
import type { LabelAsk, Mark, RoadMark, View } from './render-marks.ts';

/** What the reader points at or has chosen: things by key, and a road by the keys at its ends. */
export interface Focus {
  keys: readonly string[];
  road?: { a: string; b: string };
  /** The thing the pointer only crosses, not yet rested on: marked faintly, and nothing else changes (hover_calm). */
  near?: string;
}

/** How much the other roads still show while something is in focus. */
const DIM = 0.35;
/** How much wider a road in focus is drawn, in pixels. */
const WIDER = 2;
/** How far a click may land from a road, in pixels, and still pick it. */
const REACH = 6;

/** Whether `focus` marks anything. */
export const focusing = (focus: Focus | undefined): focus is Focus => !!focus && (!!focus.keys.length || !!focus.road);

/** One link out of a thing in focus: the thing, the one it links to, and the links each way. */
interface Out {
  from: string;
  to: string;
  forward: number;
  back: number;
  depth: number;
  types: string[];
}

/** The links out of each thing in `keys`, at its own depth, to things in any room. */
function linksOut(scene: Scene, keys: readonly string[]): Out[] {
  const out: Out[] = [];
  for (const key of keys) {
    const depth = scene.nodes.get(key)?.depth;
    if (depth === undefined) continue;
    for (const r of scene.roads[depth] ?? []) {
      if (r.a === key) out.push({ from: key, to: r.b, forward: r.forward, back: r.back, depth, types: r.types });
      else if (r.b === key) out.push({ from: key, to: r.a, forward: r.back, back: r.forward, depth, types: r.types });
    }
  }
  return out;
}

/** Whether a spot's middle is on the screen. */
const shows = (s: Spot, view: View): boolean => s.x >= 0 && s.y >= 0 && s.x <= view.w && s.y <= view.h;

/**
 * The signposts for the things in focus. Each linked thing whose middle is off the screen gets one, at the edge on
 * the way to it. They outweigh every other name, so they always show.
 */
export function focusSigns(
  scene: Scene,
  spots: Map<string, Spot>,
  view: View,
  colours: Map<string, string>,
  look: Look,
  focus: Focus | undefined,
): LabelAsk[] {
  if (!focusing(focus)) return [];
  const signs = new Map<string, LabelAsk>();
  for (const l of linksOut(scene, focus.keys)) {
    const [p, q, node] = [spots.get(l.from), spots.get(l.to), scene.nodes.get(l.to)];
    if (!p || !q || !node || signs.has(l.to)) continue;
    const [near, far] = [onScreen(p, view, l.depth), onScreen(q, view, l.depth)];
    if (!shows(near, view) || shows(far, view)) continue;
    const sign = signAt(near, far, node, view, colours.get(l.to) ?? look.faint, look, 1, 1e12 + l.forward + l.back);
    if (sign) signs.set(l.to, sign);
  }
  return [...signs.values()];
}

/** Whether road `m` joins `a` and `b`, either way round. */
const joins = (m: RoadMark, a: string, b: string): boolean => (m.a === a && m.b === b) || (m.a === b && m.b === a);

/**
 * `marks` with the focus marked. Each thing in focus gets a firm ring and name. Its links to things on the screen are
 * drawn bold, and the other roads fade back.
 */
export function focusMarks(
  marks: readonly Mark[],
  scene: Scene,
  spots: Map<string, Spot>,
  view: View,
  colours: Map<string, string>,
  look: Look,
  focus: Focus | undefined,
): Mark[] {
  const near = focus?.near;
  if (!focusing(focus)) return near ? nearMarked(marks, near) : [...marks];
  const own = new Set(focus.keys);
  const ends = new Set<string>(focus.road ? [focus.road.a, focus.road.b] : []);
  const bold: RoadMark[] = [];
  for (const l of linksOut(scene, focus.keys)) {
    const [p, q] = [spots.get(l.from), spots.get(l.to)];
    if (!p || !q) continue;
    const [s, t] = [onScreen(p, view, l.depth), onScreen(q, view, l.depth)];
    if (!shows(t, view) || bold.some((m) => joins(m, l.from, l.to))) continue;
    ends.add(l.to);
    const [from, to] = edgesOf(s, t);
    const fill = colours.get(l.from) ?? look.faint;
    const [via, width] = [archOf(p, q, view, l.depth), 2 + Math.log2(l.forward + l.back) + WIDER];
    const last = l.depth === scene.depths.length - 1;
    const count = last ? sayOf(l.types, l.forward, l.back) : countOf(l.forward, l.back);
    bold.push({
      kind: 'road',
      a: l.from,
      b: l.to,
      from,
      to,
      via,
      forward: l.forward,
      back: l.back,
      width,
      fill,
      count,
      chevrons: chevronsOf({ from, to, via, forward: l.forward, back: l.back, width, count }),
      ink: inkOf(fill, look.card, look),
      chip: look.card,
      alpha: 1,
      halo: look.card,
    });
  }
  const out: Mark[] = [];
  for (const m of marks) {
    if (m.kind === 'road') {
      // the road chosen is drawn bold; a road also drawn bold for a thing in focus gives way to that one
      if (focus.road && joins(m, focus.road.a, focus.road.b))
        out.push({ ...m, width: m.width + WIDER, alpha: 1, halo: look.card });
      else if (!bold.some((b) => joins(b, m.a, m.b))) out.push({ ...m, alpha: m.alpha * DIM });
    } else if (m.kind === 'dot' && (own.has(m.key) || ends.has(m.key)))
      out.push({ ...m, alpha: 1, ring: own.has(m.key) ? look.ink : m.fill });
    else if (m.kind === 'cloud' && (own.has(m.key) || ends.has(m.key)))
      out.push({ ...m, ring: 1, bold: own.has(m.key) });
    else if (m.kind === 'label' && own.has(m.key)) out.push({ ...m, alpha: 1, edge: look.ink, bold: true });
    else out.push(m);
  }
  // the bold roads lie over the other roads and clouds, under the dots and names
  const at = out.findIndex((m) => m.kind === 'dot' || m.kind === 'label');
  out.splice(at < 0 ? out.length : at, 0, ...bold);
  return near ? nearMarked(out, near) : out;
}

/** `marks` with the thing at `near` marked faintly: its dot ringed in its own colour, its cloud's edge shown. */
function nearMarked(marks: readonly Mark[], near: string): Mark[] {
  return marks.map((m) => {
    if (m.kind === 'dot' && m.key === near) return { ...m, ring: m.ring ?? m.fill };
    if (m.kind === 'cloud' && m.key === near) return { ...m, ring: m.ring ?? 1 };
    return m;
  });
}

/** Distance from `x`, `y` to the segment from `p` to `q`. */
function toSegment(x: number, y: number, p: [number, number], q: [number, number]): number {
  const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
  const k = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - p[0] - k * dx, y - p[1] - k * dy);
}

/** The road a click at `x`, `y` lands on, by its two ends; the nearest within reach of its line, else null. */
export function pickRoad(marks: readonly Mark[], x: number, y: number): { a: string; b: string } | null {
  let best: { a: string; b: string; d: number } | null = null;
  for (const m of marks)
    if (m.kind === 'road') {
      const d = toSegment(x, y, m.from, m.to);
      if (d <= m.width / 2 + REACH && (!best || d < best.d)) best = { a: m.a, b: m.b, d };
    }
  return best && { a: best.a, b: best.b };
}
