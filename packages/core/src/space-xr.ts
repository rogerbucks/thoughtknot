// The view in space seen in a headset (editor spec §68, projection_spatial). The drawing stands on a table at arm's
// length, at about the height of a person's chest. The page's top is the far side, its things rising from the table as
// they do on a screen. A thing is picked by pointing at it: the nearest box the pointer's ray meets. The sums are here,
// host-free; display/graph-view/space-xr-view.ts runs the headset.
import type { Block, SpaceMarks, Vec3 } from './space-view.ts';

/** Where the drawing stands, in metres: its widest side, the table's height, and how far in front of the person. */
export const ARM = { size: 0.8, height: 1.0, distance: 0.6 } as const;

/** The scale and shift that put `space` on the table: a point of the drawing at `[x, y, z]` is at `at` in metres. */
function tableOf(space: SpaceMarks): { s: number; c: Vec3 } {
  const [lx, ly, lz] = space.least,
    [mx, my, mz] = space.most;
  const widest = Math.max(mx - lx, my - ly, mz - lz, 1);
  return { s: ARM.size / widest, c: [(lx + mx) / 2, (ly + my) / 2, lz] };
}

/**
 * The matrix, read by columns as WebGL reads it, that puts `space` on the table. Across the page is across the table;
 * down the page comes towards the person; up from the page is up.
 */
export function xrModel(space: SpaceMarks): Float32Array {
  const {
    s,
    c: [cx, cy, cz],
  } = tableOf(space);
  // prettier-ignore
  return new Float32Array([
    s, 0, 0, 0,
    0, 0, s, 0,
    0, s, 0, 0,
    -s * cx, ARM.height - s * cz, -ARM.distance - s * cy, 1,
  ]);
}

/** The product `a × b` of two matrices read by columns. */
export function multiply(a: ArrayLike<number>, b: ArrayLike<number>): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
      out[col * 4 + row] = sum;
    }
  return out;
}

/** A point in metres, as the drawing's own. */
function toDrawing(space: SpaceMarks, [x, y, z]: Vec3): Vec3 {
  const {
    s,
    c: [cx, cy, cz],
  } = tableOf(space);
  return [x / s + cx, (z + ARM.distance) / s + cy, (y - ARM.height) / s + cz];
}

/**
 * The nearest block of `space` that a ray from `origin` going `way`, both in metres, meets: what a person points at.
 * None where it meets none.
 */
export function xrPick(space: SpaceMarks, origin: Vec3, way: Vec3): Block | null {
  const o = toDrawing(space, origin),
    far = toDrawing(space, [origin[0] + way[0], origin[1] + way[1], origin[2] + way[2]]);
  const d = o.map((v, i) => (far[i] ?? 0) - v);
  let best: Block | null = null,
    nearest = Infinity;
  for (const b of space.blocks) {
    const lo = [b.x, b.y, b.floor],
      hi = [b.x + b.width, b.y + b.depth, b.floor + b.tall];
    let enter = 0,
      leave = Infinity;
    for (let i = 0; i < 3; i++) {
      const di = d[i] ?? 0,
        oi = o[i] ?? 0;
      if (Math.abs(di) < 1e-12) {
        if (oi < (lo[i] ?? 0) || oi > (hi[i] ?? 0)) leave = -1;
        continue;
      }
      const t1 = ((lo[i] ?? 0) - oi) / di,
        t2 = ((hi[i] ?? 0) - oi) / di;
      enter = Math.max(enter, Math.min(t1, t2));
      leave = Math.min(leave, Math.max(t1, t2));
    }
    if (enter <= leave && enter < nearest) {
      best = b;
      nearest = enter;
    }
  }
  return best;
}
