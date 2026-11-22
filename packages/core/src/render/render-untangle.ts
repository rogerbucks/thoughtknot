// The new rendering shows what the card is untangled to (editor spec §25, untangle_legend and untangle_ask_filter). The
// legend, the filter by what things hold and a path asked for each bring some things forward and may hide others. The
// new rendering draws groups and items, never the SVG's boxes, so it is told the same layers and marks its own:
// - a group or item with nothing kept inside it fades, and so does a road whose ends are not both kept;
// - one whose things are all hidden is not drawn, and nor are the roads to it.
// A faded item's name goes, as a name is clear or not drawn (Roger, 7 Nov 2026). A faded group keeps its name, so the
// person still knows where they are (ethos principle 8). Nothing moves. Host-free and pure.
// A query shown as a highlight (ES§75, ai_query_highlight) fades and hides nothing. What it finds is marked by the one
// mark rule (query-marks.ts). Its name gets the badge. Its card gets a firm edge and its dot a ring, in the highlight's
// colour. A group holding a thing it finds is marked so too, so the mark shows at every level.
import { PALETTES } from '../palette.ts';
import type { Palette } from '../palette.ts';
import { badged, drawnOf, queryLine } from '../query-marks.ts';
import type { Marked, QueryMarkDrawn } from '../query-marks.ts';
import type { Mark } from './render-marks.ts';
import type { Scene } from './render-scene.ts';

/** How strong a faded mark is drawn, of its own strength. */
export const UNTANGLE_FADE = 0.2;

/** What the card is untangled to: the things brought forward (null for none, so nothing fades) and those hidden. */
export interface StageLayers {
  kept: ReadonlySet<string> | null;
  hidden: ReadonlySet<string>;
  /** What a query shown as a highlight marks; none when none is shown. */
  marked?: Marked;
}

/** Whether the layers change anything at all. */
export const untangles = (l: StageLayers | null | undefined): l is StageLayers =>
  !!l && (!!l.kept || l.hidden.size > 0 || (l.marked?.size ?? 0) > 0);

/** The highlight's mark of the scene's `key`: its own, or for a group the first thing inside it marked. */
function markOf(scene: Scene, marked: Marked, key: string): QueryMarkDrawn | null {
  for (const k of scene.nodes.get(key)?.items ?? [key]) {
    const d = drawnOf(marked.get(k));
    if (d) return d;
  }
  return null;
}

/** `m` with the highlight's mark `d` drawn on it, in `p`'s colours. Only words and colours change, never a place. */
function lit(m: Mark, d: QueryMarkDrawn, p: Palette): Mark {
  const line = queryLine(d.hue, p);
  if (m.kind === 'dot') return { ...m, ring: line };
  if (m.kind === 'cloud') return { ...m, bold: true };
  if (m.kind !== 'label') return m;
  const [first, ...rest] = m.lines ?? [];
  return {
    ...m,
    text: badged(m.text, d),
    edge: line,
    bold: true,
    ...(first ? { lines: [badged(first, d), ...rest] } : {}),
  };
}

/** `marks` with what a highlight `marked` finds marked, in `p`'s colours (the stage's light or dark look). */
export function highlightedMarks(marks: readonly Mark[], scene: Scene, marked: Marked, p: Palette): Mark[] {
  if (marked.size === 0) return [...marks];
  return marks.map((m) => {
    if (m.kind !== 'cloud' && m.kind !== 'dot' && m.kind !== 'label') return m;
    const d = markOf(scene, marked, m.key);
    return d ? lit(m, d, p) : m;
  });
}

/**
 * `marks` as the layers show them. Those of hidden things are left out, and those of things not kept faded. What a
 * highlight finds is marked, in `p`'s colours.
 */
export function untangledMarks(
  marks: readonly Mark[],
  scene: Scene,
  layers: StageLayers,
  p: Palette = PALETTES.light,
): Mark[] {
  const last = scene.depths.length - 1;
  const items = (key: string) => scene.nodes.get(key)?.items ?? [key];
  const gone = (key: string) => items(key).every((k) => layers.hidden.has(k));
  const kept = (key: string) => !layers.kept || items(key).some((k) => layers.kept?.has(k) && !layers.hidden.has(k));
  const out: Mark[] = [];
  for (const m of marks) {
    if (m.kind === 'road') {
      if (gone(m.a) || gone(m.b)) continue;
      out.push(kept(m.a) && kept(m.b) ? m : { ...m, alpha: m.alpha * UNTANGLE_FADE });
      continue;
    }
    if (m.kind !== 'cloud' && m.kind !== 'dot' && m.kind !== 'label') {
      out.push(m);
      continue;
    }
    if (gone(m.key)) continue;
    if (kept(m.key)) out.push(m);
    else if (m.kind === 'label') {
      if ((scene.nodes.get(m.key)?.depth ?? last) < last) out.push(m); // a group's name stays, an item's goes
    } else out.push({ ...m, alpha: m.alpha * UNTANGLE_FADE, pick: false });
  }
  return layers.marked ? highlightedMarks(out, scene, layers.marked, p) : out;
}
