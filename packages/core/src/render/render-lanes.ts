// Where each thing sits in Lanes, for the new stage (editor spec §73, render_lanes; ES§68, layout_kind_lanes).
// Things are in rows left to right, as their links run. Each kind keeps a lane of its own: a band of rows in the order
// the kinds link. The lanes are drawn under the dots as the stage's backdrop, each named by its kind at the top.
// Host-free and pure: the same graph always gives the same places.
import type { DrawMark } from '../drawing-marks.ts';
import type { GraphShape } from '../types-shape.ts';
import { layered } from '../layouts/layered.ts';
import { kindsOf } from '../layouts/fingerprint.ts';
import { ITEM_GAP } from './render-rooms.ts';

/** A thing's middle, in the drawing's own pixels. */
interface Place {
  x: number;
  y: number;
}

/** The room a thing takes in a row: its dot and its name under it. */
const BOX: [number, number] = [ITEM_GAP * 9, ITEM_GAP * 4];
/** How far apart the rows are, and the least room between two things in a row. */
const STEP = ITEM_GAP * 9;
const ROW_STEP = ITEM_GAP * 2.5;
/** The room round the things of a lane, inside its edge, and the room its name takes above them. */
const PAD = ITEM_GAP * 2;
const HEAD = ITEM_GAP * 3;
/** The size of a lane's name, in the drawing's own pixels. */
const NAME_SIZE = 24;

/** The kinds of `shape` in the order their lanes run: as most links run, or else as first written. */
export function laneOrder(shape: GraphShape): string[] {
  const kinds = kindsOf(shape);
  if (kinds.order.length) return kinds.order;
  return [...new Set(shape.things.map((t) => t.kinds[0] ?? ''))];
}

/**
 * `shape` laid out in lanes: each thing's place by key, and the backdrop marks of its lanes. A thing of no kind
 * stands in the first lane.
 */
export function lanesLaid(shape: GraphShape): { places: Map<string, Place>; marks: DrawMark[] } {
  const order = laneOrder(shape);
  const laneOf = new Map(shape.things.map((t) => [t.key, Math.max(0, order.indexOf(t.kinds[0] ?? ''))] as const));
  const sizes = new Map(shape.things.map((t) => [t.key, BOX] as const));
  const spots = layered(shape, sizes, 'LR', undefined, {}, 0, laneOf).spots;
  // each row a step from the next, wide enough for a name. Its things are an even step apart, in the order laid out.
  // Their middle is level with every other row's.
  const across = [...new Set([...spots.values()].map(([x]) => x))].sort((a, b) => a - b);
  const places = new Map<string, Place>();
  across.forEach((x, i) => {
    const row = [...spots].filter(([, p]) => p[0] === x).sort((a, b) => a[1][1] - b[1][1]);
    row.forEach(([k], j) => places.set(k, { x: i * STEP, y: (j - (row.length - 1) / 2) * ROW_STEP }));
  });
  const ys = [...places.values()].map((p) => p.y);
  const top = Math.min(...ys) - HEAD - PAD,
    bottom = Math.max(...ys) + PAD;
  const marks: DrawMark[] = [];
  order.forEach((kind, i) => {
    const xs = shape.things.filter((t) => laneOf.get(t.key) === i).map((t) => places.get(t.key)?.x ?? 0);
    if (!xs.length) return;
    const left = Math.min(...xs) - STEP / 2 + PAD / 2,
      right = Math.max(...xs) + STEP / 2 - PAD / 2;
    marks.push({
      kind: 'group',
      id: `lanes.lane.${i}`,
      style: 'lanes.lane',
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
    if (kind)
      marks.push({
        kind: 'label',
        id: `lanes.name.${i}`,
        style: 'text',
        x: (left + right) / 2,
        y: top + HEAD / 2 + NAME_SIZE / 3,
        text: kind,
        size: NAME_SIZE,
        anchor: 'middle',
      });
  });
  return { places, marks };
}
