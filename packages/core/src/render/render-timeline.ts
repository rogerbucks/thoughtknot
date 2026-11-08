// Where each thing sits in a Timeline, for the new stage (editor spec §73, render_every_type; ES§15, timeline_order).
// The timeline's plan gives its places, first first, and the things in each. Places run left to right along a line.
// Things that share a place stack under it. A long timeline folds into rows, so it keeps nearer a card's shape. Each
// place on a timeline by date is named with its day. The line and the days are drawn as the stage's backdrop.
// Host-free and pure.
import type { DiagramPlan } from '../note-reading.ts';
import type { DrawMark } from '../drawing-marks.ts';
import { dayOf, type GraphShape } from '../types-shape.ts';
import { ITEM_GAP } from './render-rooms.ts';

/** A thing's middle, in the drawing's own pixels. */
interface Place {
  x: number;
  y: number;
}

/** How far apart two places sit along the line: room for a name under each. */
const STEP = ITEM_GAP * 8;
/** How far apart two things that share a place stack. */
const STACK = ITEM_GAP * 3;
/** The room above a row's things for its line and its days. */
const HEAD = ITEM_GAP * 3;
/** The room left between two rows. */
const ROW_GAP = ITEM_GAP * 3;
/** The fewest places a row holds before a timeline folds: a short one stays on one line. */
const LEAST_PER_ROW = 6;
/** The shape a card shows best: a little wider than tall. */
const CARD_ASPECT = 1.5;
/** The size a day is written at. */
const DAY_SIZE = 11;

/** The things of `shape` in their places, as `plan` orders them; a thing it leaves out stands in a last place. */
function placesIn(shape: GraphShape, plan?: DiagramPlan): string[][] {
  const keys = new Set(shape.things.map((t) => t.key));
  const given = plan?.type === 'timeline' ? plan.dates : shape.things.map((t) => [t.key]);
  const out = given.map((p) => p.filter((k) => keys.has(k))).filter((p) => p.length);
  const placed = new Set(out.flat());
  const rest = shape.things.map((t) => t.key).filter((k) => !placed.has(k));
  return rest.length ? [...out, rest] : out;
}

/** The day every thing of `keys` is on, if they share one. */
function dayAt(keys: readonly string[], dateOf: ReadonlyMap<string, string | undefined>): string | undefined {
  const days = new Set(keys.map((k) => dateOf.get(k)).map((d) => (d === undefined ? undefined : dayOf(d))));
  const [day] = days;
  return days.size === 1 ? day : undefined;
}

/** How many places one row holds: the count that brings the whole timeline nearest a card's shape. */
function perRow(places: readonly string[][]): number {
  const tallest = Math.max(1, ...places.map((p) => p.length));
  const rowHeight = HEAD + tallest * STACK + ROW_GAP;
  let best = places.length,
    off = Infinity;
  for (let per = 1; per <= places.length; per++) {
    const rows = Math.ceil(places.length / per);
    const o = Math.abs(Math.log((per * STEP) / (rows * rowHeight) / CARD_ASPECT));
    if (o < off - 1e-9) [best, off] = [per, o];
  }
  return Math.max(Math.min(places.length, LEAST_PER_ROW), best);
}

/**
 * `shape` laid out as a timeline: each thing's place by key, and the backdrop marks of its line and its days. The
 * same graph and plan always give the same places.
 */
export function timelineLaid(shape: GraphShape, plan?: DiagramPlan): { places: Map<string, Place>; marks: DrawMark[] } {
  const places = placesIn(shape, plan);
  const per = perRow(places);
  const tallest = Math.max(1, ...places.map((p) => p.length));
  const rowHeight = HEAD + tallest * STACK + ROW_GAP;
  const dateOf = new Map(shape.things.map((t) => [t.key, t.date] as const));
  const byDate = plan?.type === 'timeline' && plan.order === 'date';
  const out = new Map<string, Place>();
  const marks: DrawMark[] = [],
    days: DrawMark[] = [];
  places.forEach((keys, i) => {
    const x = (i % per) * STEP,
      top = Math.floor(i / per) * rowHeight;
    keys.forEach((k, j) => out.set(k, { x, y: top + HEAD + j * STACK }));
    const tick = top + HEAD / 2;
    marks.push({
      kind: 'link',
      id: `timeline.tick.${i}`,
      style: 'timeline.tick',
      points: [
        [x, tick - 4],
        [x, tick + 4],
      ],
      headless: true,
    });
    const day = byDate ? dayAt(keys, dateOf) : undefined;
    if (day !== undefined)
      days.push({
        kind: 'label',
        id: `timeline.day.${i}`,
        style: 'text',
        x,
        y: tick - 8,
        text: day,
        size: DAY_SIZE,
        anchor: 'middle',
      });
  });
  // a day is written only when the days rise along the line, so a timeline ordered by another date is never misnamed
  const said = days.map((d) => (d.kind === 'label' ? d.text : ''));
  if (said.every((d, i) => i === 0 || (said[i - 1] as string) < d)) marks.push(...days);
  // one line along each row, a little past its first and last places
  for (let r = 0; r * per < places.length; r++) {
    const last = Math.min(places.length, (r + 1) * per) - 1 - r * per;
    const y = r * rowHeight + HEAD / 2;
    marks.push({
      kind: 'link',
      id: `timeline.line.${r}`,
      style: 'timeline.line',
      points: [
        [-STEP / 3, y],
        [last * STEP + STEP / 3, y],
      ],
      headless: true,
    });
  }
  return { places: out, marks };
}
