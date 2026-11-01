// Where a card was when its diagram type changed (spec §15, type_keeps_place). Changing the type draws a new card, saved
// or only looked at. That card takes up where the last was left: its zoom, the thing selected with its details, and
// full screen, if it was open. Shown in space, as cards or balls, it is shown so again (§53). The selected thing is brought into view where the new layout put it.
// A card drawn again in its place, as typing redraws it, stays where the last was left (NEURO-7, redraw_keeps_place).
// It keeps the zoom and pan, unless the last was fitted, so this one fits. It keeps the camera in space, and each box
// glides from where it was. A layout of the same things puts them where they were, so they do not move at all.
import type { View, Zoom } from '@thoughtknot/core';
import type { Orbit } from '../../space-view.ts';
import { glideBoxes } from './regroup.ts';
import { boxIn } from './taps.ts';
import type { Taps } from './taps';
import type { SpaceMode, SpaceSwitch } from './space-switch';
import type { TypeLeftAt } from './type-strip';
import type { ViewOptions } from './view-options';

/** Where a card is now, given its view, the thing selected, whether it is the full-screen card, and if in space. */
export const typeLeftAt = (
  v: View,
  selected: string | null,
  full: boolean,
  space?: SpaceMode | null,
  middle?: string,
): TypeLeftAt => ({
  zoom: v.scale,
  x: v.x,
  y: v.y,
  ...(selected ? { selected } : {}),
  ...(middle ? { middle } : {}),
  ...(full ? { full: true } : {}),
  ...(space ? { space } : {}),
});

/**
 * The thing nearest the middle of the card's `viewport`, with the drawing `svg` shown at `v`: the card drawn as a new
 * type is centred on it, so what was in the middle stays there (type_keeps_centre, Roger, 1 Nov 2026).
 */
export function middleThing(taps: Taps, v: View, viewport: HTMLElement, svg: SVGSVGElement | null): string | undefined {
  const mid = taps.toDrawing({ x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }, v);
  if (!mid || !svg) return undefined;
  let best: string | undefined,
    far = Infinity;
  for (const [key, at] of taps.places((id) => svg.querySelector(`#${id}`)?.getAttribute('data-key') ?? null)) {
    const d = (at.x - mid.x) ** 2 + (at.y - mid.y) ** 2;
    if (d < far) [best, far] = [key, d];
  }
  return best;
}

/** Where a card was left as it went, for the card drawn again in its place: as a type changed, with its camera in space. */
export interface StayedAt extends Partial<TypeLeftAt> {
  orbit?: Orbit;
}

/** Where each box is on the screen, by its thing's key: those not on the screen, none. */
function placesOf(svg: SVGSVGElement | null): Map<string, DOMRect> {
  const places = new Map<string, DOMRect>();
  for (const g of Array.from(svg?.querySelectorAll<SVGGElement>('g.node[data-key]') ?? [])) {
    const r = g.getBoundingClientRect();
    if (r.width) places.set(g.getAttribute('data-key') ?? '', r);
  }
  return places;
}

/** What one card takes up of where the last card was left as its type changed, or as it was drawn again. */
export class TypePlace {
  private kept: StayedAt | undefined;
  /** Where its full-screen card was, for the full-screen card drawn again from this one. */
  private handOn: TypeLeftAt | undefined;

  /** Takes up where the last card was left, once, for the card in `mode`; gives it, for the zoom and selection. */
  take(o: ViewOptions, mode: string): StayedAt | undefined {
    const stayed = mode === 'full' ? undefined : o.stay?.kept(), // taken once, whichever is used
      typed = o.diagram?.kept?.();
    if (typed?.full && mode === 'note') this.handOn = typed;
    this.kept = typed ?? stayed;
    return this.kept;
  }

  /**
   * The card's options `o`, for its full-screen card, which takes up where the last full-screen card was. Shown in
   * `space` as cards or balls, the full-screen card is shown so too (full_keeps_space).
   */
  forFull(o: ViewOptions, space?: SpaceMode | null): ViewOptions {
    const { diagram } = o,
      kept = space ? { ...o, inSpace: space } : o;
    if (!diagram) return kept;
    return {
      ...kept,
      diagram: {
        ...diagram,
        kept: () => {
          const at = this.handOn;
          this.handOn = undefined;
          return at;
        },
      },
    };
  }

  /** Whether the last card was shown in space, as cards or balls, so this one is shown so too (§53). */
  space(): SpaceMode | undefined {
    return this.kept?.space;
  }

  /**
   * The card goes: where it is now is left for the card drawn next in its place (NEURO-7). That is its zoom, unless
   * fitted, so the next fits too. It is also whether it is in space, and its camera there, and where each box is. Not
   * the selection: the editor keeps its own, and opening it again would move the caret while typing.
   */
  leave(o: ViewOptions, svg: SVGSVGElement | null, zoom: Zoom | undefined, spaces: SpaceSwitch): void {
    if (!o.stay || o.mode === 'full' || !zoom) return; // a card gone before it was built was never seen
    const v = zoom.view(),
      space = spaces.mode(),
      orbit = spaces.orbit();
    o.stay.leave({
      ...(zoom.isFitted() ? {} : { zoom: v.scale, x: v.x, y: v.y }),
      ...(space ? { space } : {}),
      ...(orbit ? { orbit } : {}),
      places: placesOf(svg),
    });
  }

  /**
   * Once the card is placed: the thing that was in the middle centred, at the zoom kept (type_keeps_centre), then the
   * thing selected brought into view, and full screen opened again when it was open. In space, its camera where it was.
   */
  takeUp(svg: SVGSVGElement | null, taps: Taps, zoom: Zoom, full: () => void, spaces?: SpaceSwitch): void {
    spaces?.startAt(this.kept?.orbit);
    const boxOf = (key?: string) => {
      const g = key && svg ? boxIn(svg, key) : null;
      return g ? taps.bounds(g.getAttribute('id') ?? '') : null;
    };
    const middle = boxOf(this.kept?.middle),
      to = middle ? zoom.aim(middle, 0, true) : null;
    if (to) zoom.restore(to.scale, to.x, to.y);
    const box = boxOf(this.kept?.selected);
    if (box) zoom.reveal(box);
    // a radial drawing laid out around a new centre: each box glides from where it was (radial_centre_pick)
    if (this.kept?.places) glideBoxes(svg, this.kept.places);
    if (this.handOn) full();
  }
}
