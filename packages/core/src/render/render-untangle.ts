// The new rendering shows what the card is untangled to (editor spec §25, untangle_legend and untangle_ask_filter). The
// legend, the filter by what things hold and a path asked for each bring some things forward and may hide others. The
// new rendering draws groups and items, never the SVG's boxes, so it is told the same layers and marks its own:
// - a group or item with nothing kept inside it fades, and so does a road whose ends are not both kept;
// - one whose things are all hidden is not drawn, and nor are the roads to it.
// A faded item's name goes, as a name is clear or not drawn (Roger, 7 Nov 2026). A faded group keeps its name, so the
// person still knows where they are (ethos principle 8). Nothing moves. Host-free and pure.
import type { Mark } from './render-marks.ts';
import type { Scene } from './render-scene.ts';

/** How strong a faded mark is drawn, of its own strength. */
export const UNTANGLE_FADE = 0.2;

/** What the card is untangled to: the things brought forward (null for none, so nothing fades) and those hidden. */
export interface StageLayers {
  kept: ReadonlySet<string> | null;
  hidden: ReadonlySet<string>;
}

/** Whether the layers change anything at all. */
export const untangles = (l: StageLayers | null | undefined): l is StageLayers =>
  !!l && (!!l.kept || l.hidden.size > 0);

/** `marks` as the layers show them: those of hidden things left out, those of things not kept faded. */
export function untangledMarks(marks: readonly Mark[], scene: Scene, layers: StageLayers): Mark[] {
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
  return out;
}
