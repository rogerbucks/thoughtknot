// Subject areas behind a type drawn at its own places, such as Force or Radial (editor spec §73, render_every_type). Each
// subject's things sit on a soft patch of its colour, as the old look drew them. Its edge is a clear line at every
// zoom, so where one subject ends stays plain close in (Roger, 7 Nov 2026). Host-free and pure.
import type { Look } from './render-look.ts';
import { mix } from './render-look.ts';
import type { View } from './render-marks.ts';
import type { Spot } from './render-rooms.ts';
import type { SceneArea } from './render-scene.ts';
import { onScreen } from './render-tilt.ts';

/** One subject's patch: a round blob round each of its things, drawn as one shape. */
export interface AreaMark {
  kind: 'area';
  key: string;
  blobs: Spot[];
  /** Its fill, solid: its colour already mixed into the paper. */
  tint: string;
  /** The colour of its edge line. */
  edge: string;
}

/** How much of the subject's colour shows in its patch. */
const TINT = 0.12;
/** How wide the patch's edge line is on the screen, at every zoom. */
const EDGE_PX = 1.5;

/** The patches of `areas` as `view` shows them, each in the colour of its things. */
export function areasOf(
  areas: readonly SceneArea[] | undefined,
  spots: ReadonlyMap<string, Spot>,
  view: View,
  colours: ReadonlyMap<string, string>,
  look: Look,
): AreaMark[] {
  const out: AreaMark[] = [];
  for (const area of areas ?? []) {
    const blobs: Spot[] = [];
    for (const k of area.items) {
      const at = spots.get(k);
      if (!at) continue;
      const s = onScreen({ x: at.x, y: at.y, r: area.reach }, view);
      if (!('behind' in s && s.behind) && s.r > 0) blobs.push({ x: s.x, y: s.y, r: s.r });
    }
    const fill = colours.get(area.items[0] ?? '') ?? look.faint;
    if (blobs.length)
      out.push({ kind: 'area', key: area.key, blobs, tint: mix(fill, look.paper, 1 - TINT), edge: fill });
  }
  return out;
}

/** The drawing surface an area is painted on: the few calls it needs. */
interface Pen {
  globalAlpha: number;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a: number, b: number): void;
  fill(): void;
  stroke(): void;
}

/**
 * Paints `m`: each blob's edge line, twice as wide as it shows, then the whole patch filled over it. So only the
 * outer half of the line round the whole shape is left, never a line where two blobs overlap.
 */
export function paintArea(c: Pen, m: AreaMark): void {
  const path = (): void => {
    c.beginPath();
    for (const b of m.blobs) {
      c.moveTo(b.x + b.r, b.y);
      c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    }
  };
  c.globalAlpha = 0.6;
  c.strokeStyle = m.edge;
  c.lineWidth = EDGE_PX * 2;
  path();
  c.stroke();
  c.globalAlpha = 1;
  c.fillStyle = m.tint;
  path();
  c.fill();
}
