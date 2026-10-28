// The plan of the view in space, for its mini-map (editor spec §24, space_mini_map; ethos principle 8). It is the
// whole drawing seen from straight above. Each thing is its footprint on the floor and
// each link its line. The floor the camera sees is outlined. Its near side is narrower than its far one, so the
// outline shows which way the view looks as well as where. The sums are here. The mini-map itself is in
// display/graph-view/space-mini-map.ts.
import { FIELD, eyeOf, projectPoint, upOf } from './space-view.ts';
import type { Block, Orbit, SpaceMarks, Vec3 } from './space-view.ts';

/** A point on the floor, as the plan has it: across, then down the page as the flat drawing reads. */
export type Spot = [number, number];

/** A rectangle on the floor. */
export interface Footprint {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The whole drawing from above: its bounds, each thing's footprint by its key, and each link's line. */
export interface Plan {
  bounds: Footprint;
  boxes: (Footprint & { of?: string })[];
  lines: Spot[][];
}

/** How much room the plan keeps round the drawing, as a share of its longer side. */
const MARGIN = 0.04;
/** How far the outline of what is seen reaches toward the horizon, in the camera's distances from what it looks at. */
const HORIZON = 4;

/** The plan of `space`, seen from straight above. */
export function planOf(space: SpaceMarks): Plan {
  const [x0, y0] = space.least,
    [x1, y1] = space.most;
  const pad = Math.max(x1 - x0, y1 - y0, 1) * MARGIN;
  return {
    bounds: { x: x0 - pad, y: y0 - pad, width: x1 - x0 + 2 * pad, height: y1 - y0 + 2 * pad },
    boxes: space.blocks.map((b) => ({ x: b.x, y: b.y, width: b.width, height: b.depth, of: b.of })),
    lines: space.lines.map((l) => l.points.map(([x, y]) => [x, y] as Spot)),
  };
}

/**
 * The floor the camera sees, at the height it looks at: the four corners of the screen, in turn, where they meet that
 * floor. A corner that looks above the horizon meets it far off, as far as the view could still make anything out.
 * `aspect` is the screen's width to its height.
 */
export function seenOf(orbit: Orbit, aspect: number): Spot[] {
  const eye = eyeOf(orbit),
    f = norm(sub(orbit.target, eye)),
    r = norm(cross(f, upOf(orbit))),
    u = cross(r, f);
  const half = Math.tan(FIELD / 2),
    far = orbit.distance * HORIZON,
    floor = orbit.target[2];
  return [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ].map(([sx = 0, sy = 0]) => {
    const d = norm([0, 1, 2].map((k) => f[k]! + r[k]! * sx * half * aspect + u[k]! * sy * half) as Vec3);
    const meets = Math.abs(d[2]) > 1e-9 ? (floor - eye[2]) / d[2] : -1;
    const t = meets > 0 ? Math.min(meets, far) : far;
    return [eye[0] + d[0] * t, eye[1] + d[1] * t];
  });
}

/** Whether every thing of `space` has its middle on a screen `width` by `height` pixels, seen through `matrix`. */
export function allInView(space: SpaceMarks, matrix: Float32Array, width: number, height: number): boolean {
  return space.blocks.every((b: Block) => {
    const at = projectPoint(matrix, [b.x + b.width / 2, b.y + b.depth / 2, b.floor + b.tall / 2], width, height);
    return !!at && at.x >= 0 && at.x <= width && at.y >= 0 && at.y <= height;
  });
}

/** `orbit` looking at `spot` on the floor instead, from as far, as high, and turned the same way. */
export const lookAt = (orbit: Orbit, [x, y]: Spot): Orbit => ({ ...orbit, target: [x, y, orbit.target[2]] });

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
