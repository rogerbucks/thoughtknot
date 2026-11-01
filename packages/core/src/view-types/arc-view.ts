// The arc view (editor spec §68, projection_arc). A graph's things sit on one line, in the order block-order.ts gives:
// a group's things side by side, linked things close. Each link is an arc: above the line from left to right, below it
// from right to left. So a group shows as a run of short arcs, and a long link stands out as a tall one. It is drawn as
// marks (drawing-marks.ts), so every painter draws it the same way.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import { blockName, blockOrder } from './block-order.ts';

/** The share of the space's width kept clear at each end of the line. */
const END_SHARE = 0.04;
/** Past this many things, only each group is named, not each thing. */
const NAMED_MOST = 60;
/** How far a cubic's handles stand off the line for a half-circle: four thirds of its height. */
const HANDLE = 4 / 3;

/** The marks of `shape` drawn as an arc view in `space`: a dot for each thing on one line, an arc for each link. */
export function arcMarks({ shape, space }: DiagramGiven): DrawMark[] {
  const { order, blocks } = blockOrder(shape);
  const n = order.length;
  if (!n) return [];
  const end = space.width * END_SHARE,
    step = (space.width - 2 * end) / n,
    line = space.height / 2;
  const x = new Map(order.map((k, i) => [k, end + step * (i + 0.5)]));
  const text = new Map(shape.things.map((t) => [t.key, t.text]));
  const size = Math.max(Math.min(step * 0.6, space.height * 0.03), 1),
    nameSize = Math.min(12, Math.max(size, 6));
  // an arc rises half as high as it is long, up to the room above or below the line. A long arc is flattened alone. So
  // one link across the whole line no longer squashes the rest into a strip (layout_types_screen_shaped)
  const room = line - nameSize * 3;
  const marks: DrawMark[] = [];
  if (blocks.length > 1)
    for (const b of blocks) {
      const left = end + step * b.from;
      marks.push({
        kind: 'group',
        id: `group\n${b.from}`,
        style: 'group',
        x: left,
        y: line - size,
        width: step * (b.to - b.from),
        height: size * 2,
        role: 'group',
        name: blockName(b, order, (k) => text.get(k) ?? k),
        z: -2,
      });
    }
  for (const k of order) {
    const cx = x.get(k) ?? 0,
      name = text.get(k) ?? k;
    marks.push({
      kind: 'box',
      id: k,
      of: k,
      style: 'thing',
      x: cx - size / 2,
      y: line - size / 2,
      width: size,
      height: size,
      shape: 'ellipse',
      role: 'thing',
      name,
    });
    if (n <= NAMED_MOST)
      marks.push({
        kind: 'label',
        id: `${k}\nlabel`,
        of: k,
        style: 'text',
        x: cx,
        y: line + size + nameSize,
        text: name,
        size: nameSize,
        anchor: 'middle',
        maxWidth: Math.max(step, nameSize * 2),
      });
  }
  shape.links.forEach((l, i) => {
    const a = x.get(l.from),
      b = x.get(l.to);
    if (a === undefined || b === undefined || a === b) return;
    // left to right above the line, right to left below it
    const up = b > a ? -1 : 1,
      h = Math.min((Math.abs(b - a) / 2) * HANDLE, room) * up,
      y = line + (up * size) / 2;
    marks.push({
      kind: 'link',
      id: `link\n${i}`,
      style: 'link',
      points: [
        [a, y],
        [a, y + h],
        [b, y + h],
        [b, y],
      ],
      curve: true,
      from: l.from,
      to: l.to,
      role: 'link',
      name: `${text.get(l.from)} ${l.type} ${text.get(l.to)}`,
      z: -1,
    });
  });
  return marks;
}
