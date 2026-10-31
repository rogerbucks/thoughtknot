// The globe in the 3D view (editor spec §71, globe_view and globe_dive_detail). Roger, 31 Oct 2026: the 3D view was
// taken for a globe you spin round. Keep every view, and add one seen from outside, which you dive into for detail.
//
// Each thing is a ball on the globe (layouts/globe.ts), sized by its links as in the other 3D view. Each link runs as
// an arc over the surface, ending in an arrowhead at the ball it points to. A thing's name sits on its ball. The far
// side of the globe is hidden, as it is on a real one, so the side facing you reads clearly.
//
// Names show as there is room, nearest first (space-labels.ts), so more show as you dive in. A link's words show only
// once you are near enough to read them. From inside the globe nothing is hidden: you see the whole inner surface.
// Host-free and pure.
import { globeArc, globeSpots } from './layouts/globe.ts';
import type { GlobeVec } from './layouts/globe.ts';
import { isCluster } from './space-cards.ts';
import { radiusOf, shapeOfMarks } from './space-spread.ts';
import { boundsOf } from './space-view.ts';
import type { Block, SpaceArrow, SpaceLabel, SpaceLine, SpaceMarks, Vec3 } from './space-view.ts';
import type { DrawMark } from './drawing-marks.ts';

/** The size of a thing's name and of a link's words, in pixels of the space. */
const NAME_SIZE = 14,
  WORDS_SIZE = 11;
/** An arrowhead's length, in pixels of the space: never more than the ball it points to. */
const ARROW_MOST = 18;
/** How far past the horizon a thing still shows, as a share of the globe's radius: so one on the edge is not cut. */
const HORIZON = 0.05;
/** How near a link's words must be, as a share of the globe's radius, before they show: only once you dive in. */
const WORDS_NEAR = 1.6;

/** The globe a space is laid on: its middle and radius. Only a globe's space has one. */
export interface GlobeOf {
  middle: Vec3;
  radius: number;
}

/** A space laid on a globe. */
export type GlobeSpace = SpaceMarks & { globe: GlobeOf };

/**
 * `marks` laid on a globe, `centre` facing the viewer. Given last time's `previous` spots, each thing placed already
 * keeps its spot (explore_stays_put). It gives back the spots used too, for next time.
 */
export function globeSpace(
  marks: readonly DrawMark[],
  previous?: ReadonlyMap<string, GlobeVec>,
  centre?: string | null,
): { space: GlobeSpace; spots: Map<string, GlobeVec> } {
  const shape = shapeOfMarks(marks);
  const kept = previous && new Map([...previous].filter(([k]) => shape.things.some((t) => t.key === k)));
  const { radius, spots } = globeSpots(shape, {
    ...(centre ? { centre } : {}),
    ...(kept?.size ? { previous: kept } : {}),
  });
  const count = new Map<string, number>();
  for (const l of shape.links)
    if (l.from !== l.to) for (const end of [l.from, l.to]) count.set(end, (count.get(end) ?? 0) + 1);
  const ball = new Map<string, number>(),
    blocks: Block[] = [],
    labels: SpaceLabel[] = [];
  const named = new Map<string, DrawMark & { kind: 'label' }>();
  for (const m of marks) if (m.kind === 'label' && m.of !== undefined && !named.has(m.of)) named.set(m.of, m);
  for (const m of marks) {
    if (m.kind !== 'box' || m.of === undefined || ball.has(m.of)) continue;
    const c = spots.get(m.of);
    if (!c) continue;
    const r = isCluster(m.of) ? Math.max(m.width, m.height) / 2 : radiusOf(count.get(m.of) ?? 0);
    ball.set(m.of, r);
    const block: Block = {
      id: m.id,
      style: m.style,
      of: m.of,
      x: c[0] - r,
      y: c[1] - r,
      width: 2 * r,
      depth: 2 * r,
      floor: c[2] - r,
      tall: 2 * r,
    };
    if (m.name !== undefined) block.name = m.name;
    // a folded group is a card among balls, so its name and count always show (cluster_named_everywhere)
    if (isCluster(m.of)) block.card = { width: m.width, height: m.height };
    blocks.push(block);
    const words = named.get(m.of),
      text = words?.text ?? m.name;
    if (text)
      labels.push({
        id: words?.id ?? `${m.id}\nname`,
        style: words?.style ?? m.style,
        at: [...c] as Vec3, // on the ball's face, as the painter writes it: off it, near views would throw it wide
        text,
        size: NAME_SIZE,
        of: m.of,
      });
  }
  const lines: SpaceLine[] = [],
    arrows: SpaceArrow[] = [];
  for (const m of marks) {
    if (m.kind !== 'link' || m.from === undefined || m.to === undefined || m.from === m.to) continue;
    const a = spots.get(m.from),
      b = spots.get(m.to);
    if (!a || !b) continue;
    // the arc leaves its first ball and stops short of its last, where its arrowhead goes
    const ra = ball.get(m.from) ?? 0,
      rb = ball.get(m.to) ?? 0,
      head = m.headless ? 0 : Math.min(ARROW_MOST, rb);
    const arc = globeArc(a, b, radius),
      long = lengthOf(arc);
    // a link too short to leave room for its arrowhead between the balls is drawn with none
    const end = long - rb - head > ra ? long - rb - head : long - rb;
    if (end <= ra) continue;
    const points = cut(arc, ra, end),
      tip = head && end < long - rb ? at(arc, long - rb) : null;
    const line: SpaceLine = { id: m.id, style: m.style, points, from: m.from, to: m.to };
    if (m.name) line.words = m.name;
    if (m.of !== undefined) line.of = m.of;
    lines.push(line);
    if (tip) arrows.push({ id: `${m.id}\narrow`, style: m.style, tip, back: points.at(-1) as Vec3, size: head });
    if (m.name)
      labels.push({
        id: `${m.id}\nwords`,
        style: m.style,
        at: points[Math.floor(points.length / 2)] as Vec3,
        text: m.name,
        size: WORDS_SIZE,
        link: m.id,
      });
  }
  const globe: GlobeOf = { middle: [0, 0, 0], radius };
  return { space: { blocks, lines, labels, arrows, round: true, globe, ...boundsOf(blocks, lines, labels) }, spots };
}

/**
 * The half of `space`, laid on globe `g`, that faces a camera at `eye`: the far side hidden, as on a real globe. A link
 * going over the edge keeps the part on this side. From inside the globe, everything shows.
 */
export function facingHalf<S extends SpaceMarks>(space: S, eye: Vec3, g: GlobeOf): S {
  if (gap(eye, g.middle) <= g.radius) return space;
  const shows = (p: Vec3) => {
    const out = sub(p, g.middle);
    return dot(out, sub(eye, p)) >= -HORIZON * g.radius * Math.hypot(...out);
  };
  const near = gap(eye, g.middle) <= g.radius * WORDS_NEAR;
  const blocks = space.blocks.filter((b) => shows([b.x + b.width / 2, b.y + b.depth / 2, b.floor + b.tall / 2]));
  const lines = space.lines.flatMap((l) => {
    const run = longestRun(l.points, shows);
    return run.length < 2 ? [] : [{ ...l, points: run }];
  });
  const labels = space.labels.filter((l) => shows(l.at) && (l.link === undefined || near));
  return { ...space, blocks, lines, labels, arrows: space.arrows.filter((a) => shows(a.tip)) };
}

/** One 3D view's globe: laid out again, each thing keeps its spot, and only the side facing the camera shows. */
export class GlobeLayout {
  private spots: Map<string, GlobeVec> | undefined;
  private globe: GlobeOf | undefined;

  /** `marks` laid on the globe, `centre` facing the viewer the first time; each thing laid before keeps its spot. */
  lay(marks: readonly DrawMark[], centre?: string | null): GlobeSpace {
    const laid = globeSpace(marks, this.spots, centre);
    [this.spots, this.globe] = [laid.spots, laid.space.globe];
    return laid.space;
  }

  /** What of `space` a camera at `eye` sees while the globe shows (`on`): the side facing it. Else all of it. */
  facing<S extends SpaceMarks>(space: S, eye: Vec3, on: boolean): S {
    return on && this.globe ? facingHalf(space, eye, this.globe) : space;
  }
}

/** The longest run of `points` one after another that `shows` keeps. */
function longestRun(points: readonly Vec3[], shows: (p: Vec3) => boolean): Vec3[] {
  let best: Vec3[] = [],
    now: Vec3[] = [];
  for (const p of points) {
    if (shows(p)) now.push(p);
    else now = [];
    if (now.length > best.length) best = now;
  }
  return best === now ? [...now] : best;
}

/** How long the path through `points` is. */
function lengthOf(points: readonly Vec3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += gap(points[i - 1] as Vec3, points[i] as Vec3);
  return total;
}

/** The point `d` along the path through `points`. */
function at(points: readonly Vec3[], d: number): Vec3 {
  let left = d;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1] as Vec3,
      q = points[i] as Vec3,
      step = gap(p, q);
    if (left <= step && step > 0) return add(p, scale(sub(q, p), left / step));
    left -= step;
  }
  return [...(points.at(-1) ?? [0, 0, 0])] as Vec3;
}

/** The path through `points` from `from` along it to `to`: its ends found exactly, the points between kept. */
function cut(points: readonly Vec3[], from: number, to: number): Vec3[] {
  const out: Vec3[] = [at(points, from)];
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += gap(points[i - 1] as Vec3, points[i] as Vec3);
    if (d > from && d < to) out.push(points[i] as Vec3);
  }
  out.push(at(points, to));
  return out;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const gap = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
