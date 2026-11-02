// Links that touch their things' edges (Roger, 2 Nov 2026). A view drew each link from one thing's middle to the
// other's, so the line ran over the shape and its arrowhead hid under it. Now each end stops where the line, aimed at
// the thing's middle, meets the thing's outline: an ellipse's curve, a diamond's sides, or a box's. Host-free and pure.
import type { BoxShape, DrawMark } from '../drawing-marks.ts';
import type { MarkPoint } from '../plugin-diagrams.ts';

/** A thing's box, as its middle, half width and half height, and its outline. */
interface Shape {
  x: number;
  y: number;
  hw: number;
  hh: number;
  shape?: BoxShape;
}

/** How far along the way (`dx`, `dy`) from `b`'s middle its outline is: 1 is the whole way. */
function reach(b: Shape, dx: number, dy: number): number {
  const u = Math.abs(dx) / b.hw,
    v = Math.abs(dy) / b.hh;
  if (b.shape === 'ellipse') return 1 / Math.hypot(u, v);
  if (b.shape === 'diamond') return 1 / (u + v);
  return 1 / Math.max(u, v);
}

/** Whether `p` is inside `b`'s box. */
const inside = (b: Shape, p: MarkPoint): boolean => Math.abs(p[0] - b.x) <= b.hw && Math.abs(p[1] - b.y) <= b.hh;

/** End `end` of a link, inside thing `b`, moved to where the line from `next` toward `b`'s middle meets its outline. */
function onEdge(b: Shape, end: MarkPoint, next: MarkPoint): MarkPoint {
  if (!inside(b, end) || inside(b, next)) return end;
  const dx = next[0] - b.x,
    dy = next[1] - b.y;
  if (dx === 0 && dy === 0) return end;
  const k = reach(b, dx, dy);
  return k < 1 ? [b.x + dx * k, b.y + dy * k] : end;
}

/** `marks` with each link's two ends moved from inside its things to their outlines. Other marks are as given. */
export function linkEnds(marks: DrawMark[]): DrawMark[] {
  const things = new Map<string, Shape>();
  for (const m of marks)
    if (m.kind === 'box' && m.of !== undefined && m.width > 0 && m.height > 0 && !things.has(m.of))
      things.set(m.of, {
        x: m.x + m.width / 2,
        y: m.y + m.height / 2,
        hw: m.width / 2,
        hh: m.height / 2,
        shape: m.shape,
      });
  return marks.map((m) => {
    if (m.kind !== 'link' || m.points.length < 2) return m;
    const a = m.from === undefined ? undefined : things.get(m.from),
      b = m.to === undefined ? undefined : things.get(m.to);
    if (!a && !b) return m;
    const points = [...m.points];
    const n = points.length;
    if (a) points[0] = onEdge(a, points[0] as MarkPoint, points[1] as MarkPoint);
    if (b) points[n - 1] = onEdge(b, points[n - 1] as MarkPoint, points[n - 2] as MarkPoint);
    return { ...m, points };
  });
}
