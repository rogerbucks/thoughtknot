// A drawing laid out again glides each thing from its old spot to its new one (editor spec §68, layout_glide). It is
// ethos principle 8: never disorient the user. First the person's place is kept. What they selected stays where it
// was on the screen; else the things in both keep their middle there (layout-glide.ts). Then each box starts where it
// was seen and eases to its new spot. A box new to the drawing fades in. Links and group boxes can't be drawn between
// moving boxes, so they fade in as the boxes arrive. A move by the person ends the glide at once. So do reduced motion
// and a drawing too big to follow.
import { GLIDE_MOST, LAYOUT_GLIDE_MS, easeGlide, offsetAt, offsetsOf, placeKept } from '../../layout-glide.ts';
import type { Offsets, Pt } from '../../layout-glide.ts';
import type { View, Zoom } from '@thoughtknot/core';
import { reducedMotion } from './details-nav.ts';
import type { Taps } from './taps.ts';

/** What ends a glide at once: the person reaching for the drawing, to move, zoom, pick or press a key. */
const REACHES = ['pointerdown', 'wheel', 'keydown'] as const;

/** What fades in as the boxes arrive: the links, with their labels, and the boxes round groups. */
const FADED = 'g.edge, g.cluster';

/** Each box of the drawing whose taps are `taps`, by its key, where it is on the screen with the drawing shown at `v`. */
export function onScreen(svg: SVGSVGElement, taps: Taps, v: View): Map<string, Pt> {
  const out = new Map<string, Pt>();
  const vb = svg.viewBox?.baseVal,
    box = vb?.width ? vb : viewBoxOf(svg);
  if (!box.width || !box.height) return out;
  const kx = v.width / box.width,
    ky = v.height / box.height;
  const keyOf = (id: string) => svg.querySelector(`#${id}`)?.getAttribute('data-key') ?? null;
  for (const [key, at] of taps.places(keyOf)) out.set(key, [v.x + (at.x - box.x) * kx, v.y + (at.y - box.y) * ky]);
  return out;
}

/** The SVG's viewBox, read from its attribute where the page gives no live one. */
function viewBoxOf(svg: SVGSVGElement): { x: number; y: number; width: number; height: number } {
  const [x = 0, y = 0, width = 0, height = 0] = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  return { x, y, width, height };
}

/** How many screen pixels one unit inside the drawing's top group is, across and down, with it shown at `v`. */
function unitsOf(svg: SVGSVGElement, v: View): Pt {
  const box = viewBoxOf(svg),
    t = svg.querySelector('g.graph')?.getAttribute('transform') ?? '',
    [sx = 1, sy = sx] = (/scale\(([^()]*)\)/.exec(t)?.[1] ?? '1').split(/[\s,]+/).map(Number);
  return [(v.width / (box.width || 1)) * sx, (v.height / (box.height || 1)) * sy];
}

/** A card's drawing glides as it is laid out again: one glide at a time, a new one ending the last at once. */
export class LayoutGlide {
  private run = 0;
  /** Ends the glide under way at once, every box where it goes; none when nothing glides. */
  private end: (() => void) | null = null;
  private readonly viewportOf: () => HTMLElement;
  /** The viewport listened to, so a reach for it ends the glide. */
  private heard: HTMLElement | null = null;
  private readonly reach = () => this.stop();

  /** For the card's viewport, made once the card is built. */
  constructor(viewport: () => HTMLElement) {
    this.viewportOf = viewport;
  }

  /** The card's viewport, listened to from the first glide: a reach for it ends the glide. */
  private get viewport(): HTMLElement {
    const el = this.viewportOf();
    if (this.heard !== el) {
      // caught on the way down, so the glide ends before the view pans or zooms the boxes still on their way
      for (const type of REACHES) this.heard?.removeEventListener(type, this.reach, { capture: true });
      for (const type of REACHES) el.addEventListener(type, this.reach, { capture: true });
    }
    this.heard = el;
    return el;
  }

  /**
   * Where each box is on the screen now, before the drawing is laid out again. A glide under way ends first, so each
   * box is taken where it is shown.
   */
  before(svg: SVGSVGElement, taps: Taps, v: View): Map<string, Pt> {
    this.stop();
    void this.viewport; // listened to before the glide starts
    return onScreen(svg, taps, v);
  }

  /**
   * The drawing was laid out again; `was` is where its boxes were on the screen. The view moves to keep the person's
   * place. Then each box glides from where it was to where it goes. `selected` is the key of what is selected, if any.
   */
  after(svg: SVGSVGElement, taps: Taps, zoom: Zoom, was: ReadonlyMap<string, Pt>, selected?: string | null): void {
    if (!was.size) return;
    // a fitted drawing stays fitted, as the person left it; any other keeps its place (r_keep_place)
    if (!zoom.isFitted()) {
      const shift = placeKept(was, onScreen(svg, taps, zoom.view()), selected);
      if (shift) zoom.panBy(shift[0], shift[1]);
    }
    const now = onScreen(svg, taps, zoom.view());
    const win = this.viewport.win;
    if (reducedMotion(win) || now.size > GLIDE_MOST) return;
    const offsets = offsetsOf(was, now),
      fresh = [...now.keys()].filter((k) => !was.has(k));
    if (!offsets.size && !fresh.length) return; // nothing moved: nothing to glide
    this.glide(svg, offsets, new Set(fresh), unitsOf(svg, zoom.view()));
  }

  /** Ends the glide under way, every box where it goes. */
  stop(): void {
    this.run++;
    const end = this.end;
    this.end = null;
    end?.();
  }

  /** Glides each box by its key from its offset to none, `fresh` ones fading in, over LAYOUT_GLIDE_MS. */
  private glide(svg: SVGSVGElement, offsets: Offsets, fresh: ReadonlySet<string>, [ux, uy]: Pt): void {
    const run = ++this.run,
      win = this.viewport.win;
    const boxes = Array.from(svg.querySelectorAll<SVGGElement>('g.node[data-key]')),
      faded = Array.from(svg.querySelectorAll<SVGGElement>(FADED));
    const moving = boxes.flatMap((g) => {
      const d = offsets.get(g.getAttribute('data-key') ?? '');
      return d ? [{ g, d, was: g.getAttribute('transform') }] : [];
    });
    const appearing = [...faded, ...boxes.filter((g) => fresh.has(g.getAttribute('data-key') ?? ''))];
    const put = (t: number) => {
      for (const { g, d, was } of moving) {
        const [dx, dy] = offsetAt(d, t);
        const by = `translate(${dx / ux} ${dy / uy})`;
        g.setAttribute('transform', was ? `${by} ${was}` : by);
      }
      // the links come in over the second half, as the boxes they join slow to their spots
      const shown = String(Math.max(0, easeGlide(2 * t - 1)));
      for (const g of appearing) g.setCssStyles({ opacity: shown });
    };
    this.end = () => {
      for (const { g, was } of moving) was ? g.setAttribute('transform', was) : g.removeAttribute('transform');
      for (const g of appearing) g.setCssStyles({ opacity: '' });
    };
    put(0);
    let start: number | null = null;
    const frame = (time?: number) => {
      if (run !== this.run) return;
      const now = typeof time === 'number' ? time : Date.now();
      start ??= now;
      const t = (now - start) / LAYOUT_GLIDE_MS;
      if (t >= 1) return this.stop();
      put(t);
      win.requestAnimationFrame(frame);
    };
    win.requestAnimationFrame(frame);
  }
}
