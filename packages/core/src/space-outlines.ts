// The outlines of a 3D view's open groups on the screen (editor spec §53, cluster_named_everywhere). Each is drawn
// round its group's things, as the camera sees them, with the group's name along its top. A group opened from its
// box has a button at the top right that folds it back. A tap on its name zooms to it (cluster_fold_back).
// Host-free and pure.
import { FIELD, boundsOf, middleOf, projectPoint } from './space-view.ts';
import type { SpaceMarks } from './space-view.ts';

/** An open group in the space: its id, its style, its name and the keys of the things in it. */
type SpaceGroup = NonNullable<SpaceMarks['groups']>[number];

/** An open group's outline on the screen: its corner and size in pixels, its style, its name and what folds it back. */
export interface ScreenOutline {
  id: string;
  style: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  folds?: string;
}

/** How wide the button at the top right of an outline is, which folds its group back into its box (cluster_fold_back). */
export const OUTLINE_FOLD = 22;

/** The room round a group's things inside its outline, and above them for its name, in pixels. */
const OUTLINE_ROOM = 10,
  OUTLINE_NAME = 18;

/** The outlines of `space`'s open groups, as the camera's `matrix` sees their things: each round all of them. */
export function outlinesOf(space: SpaceMarks, matrix: Float32Array, width: number, height: number): ScreenOutline[] {
  if (!space.groups?.length) return [];
  const focal = height / 2 / Math.tan(FIELD / 2);
  const byKey = new Map(space.blocks.flatMap((b) => (b.of === undefined ? [] : [[b.of, b] as const])));
  return space.groups.flatMap((g) => {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const key of g.of) {
      const b = byKey.get(key),
        c = b && projectPoint(matrix, middleOf(b), width, height);
      if (!b || !c) continue;
      const scale = focal / c.far,
        w = ((b.card?.width ?? b.width) * scale) / 2,
        h = ((b.card?.height ?? b.depth) * scale) / 2;
      [x0, y0, x1, y1] = [Math.min(x0, c.x - w), Math.min(y0, c.y - h), Math.max(x1, c.x + w), Math.max(y1, c.y + h)];
    }
    if (x0 > x1) return [];
    const x = x0 - OUTLINE_ROOM,
      y = y0 - OUTLINE_ROOM - OUTLINE_NAME;
    const wide = x1 - x + OUTLINE_ROOM;
    return [{ id: g.id, style: g.style, name: g.name, x, y, width: wide, height: y1 - y + OUTLINE_ROOM, ...fold(g) }];
  });
}

const fold = (g: SpaceGroup) => (g.folds ? { folds: g.folds } : {});

/**
 * The open group whose name strip, along its outline's top, is at (`x`, `y`) on the screen. And whether the point is
 * on the button at its right end. A tap there folds the group back; one on its name zooms to it (cluster_fold_back).
 */
export function outlineAt(
  outlines: readonly ScreenOutline[],
  x: number,
  y: number,
): { outline: ScreenOutline; folds: boolean } | undefined {
  for (let i = outlines.length - 1; i >= 0; i--) {
    const o = outlines[i] as ScreenOutline;
    if (x < o.x || x > o.x + o.width || y < o.y || y > o.y + OUTLINE_ROOM + OUTLINE_NAME) continue;
    return { outline: o, folds: !!o.folds && x >= o.x + o.width - OUTLINE_FOLD };
  }
  return undefined;
}

/** `labels` less each group's floating name where its outline carries it. */
export const outlined = <L extends { id: string }>(labels: readonly L[], outlines: readonly ScreenOutline[]): L[] => {
  const named = new Set(outlines.map((o) => `${o.id}\ngroup`));
  return labels.filter((l) => !named.has(l.id));
};

/**
 * What a tap at (`x`, `y`) on the screen does to an open group, as the camera's `matrix` sees `space`. On the button
 * that folds it back, it gives that fold. On its name, it gives the space bounded by its things, to fit the view to.
 */
export function stripTap(
  space: SpaceMarks,
  matrix: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): { folds: string } | { fit: SpaceMarks } | undefined {
  const strip = outlineAt(outlinesOf(space, matrix, width, height), x, y);
  if (strip?.folds && strip.outline.folds) return { folds: strip.outline.folds };
  const group = strip && space.groups?.find((g) => g.id === strip.outline.id);
  if (!group) return undefined;
  const inside = space.blocks.filter((b) => b.of !== undefined && group.of.includes(b.of));
  return { fit: { ...space, blocks: inside, ...boundsOf(inside, [], []) } };
}
