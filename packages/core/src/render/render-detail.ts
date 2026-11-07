// Detail on zoom: layer L3 of the rendering spec (wiki/Rendering-spec.md; editor spec §73, render_detail). It says how
// much of each level shows at a zoom. Far out you see subjects. Areas fade in as their rooms grow on screen, then
// topics, then items, each where it already sits (Roger: big things first, nodes stay put).
//
// A level opens when its rooms are big enough on screen to hold their names. It fades in over a band of zoom, so
// nothing snaps. The badge names the deepest level that is fully open. Host-free and pure.
import type { Scene } from './render-scene.ts';
import type { Spot } from './render-rooms.ts';

/** A level starts to show when its typical room is this wide on screen, in pixels. */
export const OPEN_FROM = 56;
/** It is fully shown at this width. The band between is where it fades in. */
export const OPEN_AT = 112;
/** Items are dots, not rooms: they start to show once they sit this far apart on screen, in pixels. */
export const ITEMS_FROM = 24;
/** Items are fully shown once they sit this far apart. */
export const ITEMS_AT = 44;

/** How much of a scene shows at one zoom. */
export interface Detail {
  /** How much each depth shows, 0 to 1, far to near. Depth 0 always shows. */
  shown: number[];
  /** The deepest depth that is fully shown: the badge's level. */
  level: number;
  /** How wide the typical room at each depth is on screen, in pixels: for items, how far apart they sit. */
  span?: number[];
}

/** The typical room at each depth: the middle diameter of its nodes, in the drawing's own units. */
export function roomSizes(scene: Scene, spots: Map<string, Spot>): number[] {
  return scene.depths.map((_, depth) => {
    const sizes = [...scene.nodes.values()]
      .filter((n) => n.depth === depth)
      .map((n) => 2 * (spots.get(n.key)?.r ?? 0))
      .sort((a, b) => a - b);
    return sizes[Math.floor(sizes.length / 2)] ?? 0;
  });
}

/** How far `x` has come from `from` to `to`, eased so it starts and ends gently. */
const ease = (x: number, from: number, to: number): number => {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/**
 * The detail of a scene whose rooms are `sizes` across, drawn at `scale` pixels per unit. A depth never shows more
 * than the one above it, so items never come before their topics.
 */
export function detailAt(sizes: readonly number[], scale: number): Detail {
  const shown: number[] = [];
  sizes.forEach((size, depth) => {
    const [from, to] = depth === sizes.length - 1 ? [ITEMS_FROM, ITEMS_AT] : [OPEN_FROM, OPEN_AT];
    const own = depth === 0 ? 1 : ease(size * scale, from, to);
    shown.push(Math.min(own, shown[depth - 1] ?? 1));
  });
  let level = 0;
  while (level + 1 < shown.length && (shown[level + 1] as number) >= 1) level++;
  return { shown, level, span: sizes.map((size) => size * scale) };
}

/** The zoom at which `depth` is fully shown: the scale its rooms need. Used to step one level per wheel notch. */
export const scaleToOpen = (sizes: readonly number[], depth: number): number =>
  depth <= 0 || !sizes[depth] ? 0 : (depth === sizes.length - 1 ? ITEMS_AT : OPEN_AT) / sizes[depth];
