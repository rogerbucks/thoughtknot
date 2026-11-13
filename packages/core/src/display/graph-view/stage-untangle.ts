// The stage's side of untangling (editor spec §25, untangle_legend and untangle_ask_filter). A card's untangling tells
// what it brings forward and hides, through `untangledIn`, on the card's own element. The stage finds it from its
// viewport and marks its drawing so (render-untangle.ts). The untangling marks the SVG under the stage by class as it
// changes. So the stage watches those classes, and draws again only when what is kept or hidden has changed.
import { untangledMarks, untangles } from '../../render/render-untangle.ts';
import type { StageLayers } from '../../render/render-untangle.ts';
import type { Mark } from '../../render/render-marks.ts';
import type { Scene } from '../../render/render-scene.ts';
import type { Layers } from '../../untangle.ts';

/** Each card's untangling, by the card's element: what it brings forward and hides now. */
export const untangledIn = new WeakMap<Element, () => Layers>();

/** The layers of the card round `el`, or null when it has no untangling. */
function layersOf(el: Element | null): StageLayers | null {
  for (let at = el; at; at = at.parentElement) {
    const shown = untangledIn.get(at)?.();
    if (shown) return { kept: shown.kept?.things ?? null, hidden: shown.hidden.things };
  }
  return null;
}

/** A stamp of the layers, so a change of class that changes neither is not drawn again. Sets keep their order. */
const stampOf = (l: StageLayers | null) =>
  !untangles(l) ? '' : `${[...(l.kept ?? [])].join(',')}|${[...l.hidden].join(',')}`;

/** What one stage shows of its card's untangling. */
export class StageUntangle {
  private observer: MutationObserver | null = null;
  private stamp = '';

  private viewport: HTMLElement | null = null;

  private readonly redraw: () => void;

  /** For a stage that `redraw` draws again. */
  constructor(redraw: () => void) {
    this.redraw = redraw;
  }

  /** `marks` as the card's untangling shows them. From the first drawing on, it watches the card, to draw again. */
  of(marks: Mark[], viewport: HTMLElement, scene: Scene): Mark[] {
    this.watch(viewport);
    const layers = layersOf(viewport);
    this.stamp = stampOf(layers);
    return untangles(layers) ? untangledMarks(marks, scene, layers) : marks;
  }

  private watch(viewport: HTMLElement): void {
    if (this.viewport === viewport || typeof MutationObserver === 'undefined') return;
    this.viewport = viewport;
    this.observer?.disconnect();
    this.observer = new MutationObserver(() => {
      if (stampOf(layersOf(viewport)) !== this.stamp) this.redraw();
    });
    this.observer.observe(viewport, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }
}
