// The ground under a drawing in space (editor spec §68, space_ground). Roger, 5 Nov 2026: keep the plane in 2.5D and
// 3D, as the 3D mockup draws it, for reference and to find your way. So a faint grid lies under the lowest thing, a
// little wider than the drawing. It turns, tilts and zooms with the view. The globe has none.
// Host-free and pure: the same space and camera give the same lines.
import { projectPoint } from './space-view.ts';
import type { SpaceMarks, Vec3 } from './space-view.ts';

/** How many squares the grid has across the drawing's longer side. */
const SQUARES = 12;
/** How far past the drawing the grid runs, as a share of its size. */
const MARGIN = 0.15;
/** How many pieces each grid line is cut into, so a piece behind the camera can be left out. */
const PIECES = 24;

/** The grid under the lowest thing of `space`, as the camera's `matrix` sees it on a screen `width` by `height` pixels. */
export function groundGrid(
  space: Pick<SpaceMarks, 'least' | 'most'>,
  matrix: Float32Array,
  width: number,
  height: number,
): { x: number; y: number }[][] {
  const [x0, y0, z] = space.least,
    [x1, y1] = space.most;
  const step = Math.max(x1 - x0, y1 - y0, 1) / SQUARES,
    pad = step * SQUARES * MARGIN;
  const snap = (v: number, up: boolean) => (up ? Math.ceil(v / step) : Math.floor(v / step)) * step;
  const [ax, bx, ay, by] = [snap(x0 - pad, false), snap(x1 + pad, true), snap(y0 - pad, false), snap(y1 + pad, true)];
  const out: { x: number; y: number }[][] = [];
  // each line in pieces: a run of seen points is one line, and a point behind the camera ends it
  const line = (from: Vec3, to: Vec3) => {
    let run: { x: number; y: number }[] = [];
    for (let i = 0; i <= PIECES; i++) {
      const t = i / PIECES;
      const p = projectPoint(matrix, [0, 1, 2].map((k) => from[k]! + (to[k]! - from[k]!) * t) as Vec3, width, height);
      if (p) run.push({ x: p.x, y: p.y });
      else {
        if (run.length > 1) out.push(run);
        run = [];
      }
    }
    if (run.length > 1) out.push(run);
  };
  for (let x = ax; x <= bx + step / 2; x += step) line([x, ay, z], [x, by, z]);
  for (let y = ay; y <= by + step / 2; y += step) line([ax, y, z], [bx, y, z]);
  return out;
}
