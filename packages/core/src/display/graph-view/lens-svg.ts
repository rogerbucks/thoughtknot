// A card's flat drawing seen through a lens (editor spec §68, projections_all_on, projection_fisheye). The View menu
// picks the lens, else the style graph's Render. A fisheye follows the mouse; a finger, a pen, the keyboard, and
// motion kept still follow the selection instead. A new focus glides there, unless motion is to be still. Each box
// moves to where the lens sees its middle, enlarged as the lens enlarges there. Each link, its arrowhead, its words and
// each group's outline are bent point by point. The mini-map stays a copy of the drawing as laid out, so the whole is
// always in view (ethos principle 8). The sums are in lenses.ts.
//
// Nothing moves while the drawing is held, or while it glides to a new layout: a box under a finger stays put.
import { FISHEYE_PX, FISHEYE_SHARE, LENSES, bent, bentPoints, lensOf, pointsMiddle } from '../../lenses.ts';
import type { Lens, Radial } from '../../lenses.ts';
import { GLIDE_MOST, LAYOUT_GLIDE_MS, easeGlide } from '../../layout-glide.ts';
import type { ViewState } from '../../view-switches.ts';
import { word } from '../../words.ts';
import type { WordKey } from '../../words.ts';
import type { View, Zoom } from '../../zoom.ts';
import type { Lifecycle } from '../lifecycle';
import { reducedMotion } from './details-nav.ts';
import { MARKED } from './focus-marks.ts';
import { boxIn } from './taps.ts';
import type { Taps } from './taps.ts';

/** Each card's lens, by its drawing, so the view in space can ask for the drawing as drawn before it reads it. */
const lenses = new WeakMap<SVGSVGElement, LensSvg>();

/** The drawing `svg` as drawn, unbent, while the view in space lies over it: that view reads it, and bends itself. */
export function flatAgain(svg: SVGSVGElement): void {
  lenses.get(svg)?.putAllBack();
}

/** What a lens asks of its card. */
export interface LensHost {
  svg: () => SVGSVGElement | null;
  viewport: HTMLElement;
  zoom: () => Zoom;
  taps: Taps;
  /** The lens the graph's Render sets, if the View menu picks none. */
  written?: Lens;
  /** The View menu's state, which holds the lens it picks; none for a card with no View menu. */
  state?: ViewState;
  /** The key of what is selected, if anything. */
  selected: () => string | null;
}

/** The attributes a lens bends: points, and where words and round shapes are. */
const BENT = ['d', 'points', 'x', 'y', 'cx', 'cy'] as const;
/** The parts of a drawing a lens bends point by point: each link and each group's outline. */
const LINED = 'g.edge, g.cluster';

/** A drawing's top group's scale and shift: a point inside it is at `scale × (p + shift)` in the drawing's units. */
type Frame = { s: number; tx: number; ty: number };
/** The scale and shift of `svg`'s top group, read from its transform. */
export function frameOf(svg: SVGSVGElement): Frame {
  const t = svg.querySelector('g.graph')?.getAttribute('transform') ?? '';
  const [s = 1] = (/scale\(([^()]*)\)/.exec(t)?.[1] ?? '1').split(/[\s,]+/).map(Number);
  const [tx = 0, ty = 0] = (/translate\(([^()]*)\)/.exec(t)?.[1] ?? '0 0').split(/[\s,]+/).map(Number);
  return { s: s || 1, tx, ty };
}

/** The middle of box `g` as drawn, in its top group's units: of its outline, a path, polygon or ellipse. */
export function middleOf(g: Element): number[] | null {
  const shape = g.querySelector('path, polygon, ellipse');
  if (!shape) return null;
  const cx = shape.getAttribute('cx');
  if (cx !== null) return [Number(cx), Number(shape.getAttribute('cy'))];
  return pointsMiddle(shape.getAttribute('d') ?? shape.getAttribute('points') ?? '');
}

/** A card's lens: what it bends, round which focus, and the drawing's parts as drawn, kept to bend again. */
export class LensSvg {
  private readonly host: LensHost;
  /** The focus, in the drawing's units, and where it glides from while it moves to a new one. */
  private focus: { x: number; y: number } | null = null;
  private from: { x: number; y: number } | null = null;
  private moved = 0;
  /** What the focus follows last: the pointer, or the selected thing, by its key. */
  private pointer = false;
  private following: string | null = null;
  /** Each part's attributes as drawn, before any lens, so each bend starts from the drawing itself. */
  private drawn = new WeakMap<Element, Map<string, string | null>>();
  /** Each box's middle as drawn, read once. */
  private middles = new WeakMap<Element, number[] | null>();
  /** The parts bent last time, put back once the lens no longer reaches them. */
  private bentLast = new Set<Element>();
  private held = false;
  private still = 0;
  private asked = false;

  /** For the card (which owns its listeners) and what the lens asks of it. */
  constructor(card: Lifecycle, host: LensHost) {
    this.host = host;
    const vp = host.viewport,
      svg = host.svg();
    if (svg) lenses.set(svg, this);
    // the selection changed, or what the focus fades: the lens follows it
    if (svg) card.registerDomEvent(svg, MARKED, () => this.changed());
    card.registerDomEvent(vp, 'pointerdown', () => (this.held = true));
    for (const type of ['pointerup', 'pointercancel'] as const)
      card.registerDomEvent(vp, type, () => ((this.held = false), this.again()));
    card.registerDomEvent(vp, 'pointermove', (e: PointerEvent) => {
      // a mouse leads the lens; a finger or pen picks, and the lens follows what is picked
      if (e.pointerType !== 'mouse' || e.buttons || this.held || reducedMotion(vp.win) || this.big()) return;
      const r = vp.getBoundingClientRect(),
        at = host.taps.toDrawing({ x: e.clientX - r.left, y: e.clientY - r.top }, host.zoom().view());
      if (!at) return;
      [this.focus, this.from, this.pointer] = [at, null, true];
      this.again();
    });
  }

  /** The lens the drawing is seen through: the View menu's, else the style graph's. */
  get lens(): Lens {
    return this.host.state?.lens ?? this.host.written ?? 'none';
  }

  /** Picks `lens` in the View menu: the drawing is bent again round the selection, or the middle of the view. */
  pick(lens: Lens): void {
    if (this.host.state) this.host.state.lens = lens;
    this.pointer = false;
    this.focus = null;
    this.again();
  }

  /** The drawing was laid out again: its parts are new. It is bent at once, so it glides to where the lens sees it. */
  redrawn(): void {
    this.bentLast.clear();
    this.drawn = new WeakMap();
    this.middles = new WeakMap();
    this.still = Date.now() + LAYOUT_GLIDE_MS;
    this.bend();
    this.host.viewport.win.setTimeout(() => this.again(), LAYOUT_GLIDE_MS + 20);
  }

  /** The view moved or zoomed, or the selection changed: the lens reaches as far on the screen, and may follow. */
  changed(): void {
    if (this.lens === 'fisheye') this.again();
  }

  /** Whether the drawing is too big to bend at the speed of a mouse: it follows the selection only. */
  private big(): boolean {
    return (this.host.svg()?.querySelectorAll('g.node').length ?? 0) > GLIDE_MOST;
  }

  /** Bends the drawing again on the next frame. */
  private again(): void {
    if (this.asked) return;
    this.asked = true;
    this.host.viewport.win.requestAnimationFrame(() => {
      this.asked = false;
      if (!this.held && Date.now() >= this.still) this.bend();
    });
  }

  /** Where the lens's focus is now: the pointer's, else the selected thing, gliding there, else the view's middle. */
  private focusNow(v: View, svg: SVGSVGElement, { s, tx, ty }: Frame): { x: number; y: number } | null {
    const key = this.host.selected();
    if (!this.pointer || key !== this.following) {
      const box = key ? boxIn(svg, key) : null,
        [mx, my] = (box && middleOf(box)) ?? [];
      const place = mx === undefined || my === undefined ? null : { x: s * (mx + tx), y: s * (my + ty) };
      const middle = this.host.taps.toDrawing({ x: v.x + v.width / 2, y: v.y + v.height / 2 }, v);
      const next = place ?? (key === this.following && this.focus ? this.focus : middle);
      if (next && (next.x !== this.focus?.x || next.y !== this.focus?.y)) {
        // a new focus glides there from the last, so nothing jumps
        [this.from, this.moved] = [
          this.focus && !reducedMotion(this.host.viewport.win) ? this.focus : null,
          Date.now(),
        ];
        this.focus = next;
      }
      [this.following, this.pointer] = [key, false];
    }
    const t = this.from ? Math.min(1, (Date.now() - this.moved) / LAYOUT_GLIDE_MS) : 1;
    if (t < 1) this.again();
    else this.from = null;
    const [f, from] = [this.focus, this.from];
    if (!f || !from) return f;
    const e = easeGlide(t);
    return { x: from.x + (f.x - from.x) * e, y: from.y + (f.y - from.y) * e };
  }

  /** Puts each part of the drawing back as drawn. */
  putAllBack(): void {
    for (const el of this.bentLast) this.putBack(el);
    this.bentLast.clear();
  }

  /** Bends each part of the drawing through the lens, from the drawing as drawn; with none, puts each part back. */
  private bend(): void {
    const svg = this.host.svg();
    if (!svg) return;
    // in space the view there bends itself, from the drawing as drawn (space-view-panel.ts)
    const over = Array.from(svg.parentElement?.children ?? []);
    if (over.some((el) => el.classList.contains('thoughtknot-space-view'))) return this.putAllBack();
    const v = this.host.zoom().view(),
      frame = frameOf(svg),
      { s, tx, ty } = frame;
    const origin = this.host.taps.toDrawing({ x: 0, y: 0 }, v),
      room = Math.min(this.host.viewport.clientWidth || Infinity, this.host.viewport.clientHeight || Infinity),
      across = this.host.taps.toDrawing({ x: Math.min(FISHEYE_PX, room * FISHEYE_SHARE), y: 0 }, v);
    const focus = this.lens !== 'fisheye' ? null : this.focusNow(v, svg, frame);
    // the lens is worked in the units of the drawing's top group, where its parts are written
    const reach = origin && across ? (across.x - origin.x) / s : 0;
    const lens = lensOf(this.lens, focus && [focus.x / s - tx, focus.y / s - ty], reach);
    const now = new Set<Element>();
    for (const g of Array.from(svg.querySelectorAll<SVGGElement>('g.node'))) {
      if (lens && !this.middles.has(g)) this.middles.set(g, middleOf(g));
      const at = lens && this.middles.get(g);
      if (lens && at) this.boxBent(g, lens, at, now);
    }
    if (lens)
      for (const part of Array.from(svg.querySelectorAll<SVGElement>(LINED)))
        for (const el of [part, ...Array.from(part.querySelectorAll<SVGElement>('*'))]) this.pointsBent(el, lens, now);
    for (const el of this.bentLast) if (!now.has(el)) this.putBack(el);
    this.bentLast = now;
  }

  /** A box moved to where `lens` sees its middle `c`, enlarged as the lens enlarges there; left alone beyond its reach. */
  private boxBent(g: SVGGElement, lens: Radial, c: readonly number[], now: Set<Element>): void {
    const {
      at: [x = 0, y = 0],
      times,
    } = bent(lens, c);
    if (times === 1 && x === c[0] && y === c[1]) return;
    const was = this.kept(g).get('transform');
    const t = `translate(${x} ${y}) scale(${times}) translate(${-(c[0] ?? 0)} ${-(c[1] ?? 0)})`;
    g.setAttribute('transform', was ? `${t} ${was}` : t);
    now.add(g);
  }

  /** A link's or an outline's part with its points, words or middle moved by `lens`, if the lens reaches it. */
  private pointsBent(el: Element, lens: Radial, now: Set<Element>): void {
    if (!BENT.some((a) => el.hasAttribute(a))) return;
    const as = this.kept(el);
    const to = (x: number, y: number) => bent(lens, [x, y]).at;
    let moved = false;
    for (const [a, v] of as) {
      if (v === null || a === 'transform') continue;
      const pair = a === 'x' || a === 'cx' ? [a, a === 'x' ? 'y' : 'cy'] : null;
      if (a === 'd' || a === 'points') {
        const b = bentPoints(v, to);
        moved ||= b !== v;
        el.setAttribute(a, b);
      } else if (pair) {
        const [x, y] = to(Number(v), Number(as.get(pair[1] as string) ?? 0));
        moved ||= x !== Number(v);
        el.setAttribute(a, String(x));
        el.setAttribute(pair[1] as string, String(y));
      }
    }
    if (moved || this.bentLast.has(el)) now.add(el);
  }

  /** `el`'s attributes as drawn, read the first time the lens touches it. */
  private kept(el: Element): Map<string, string | null> {
    let as = this.drawn.get(el);
    if (!as) {
      as = new Map(['transform', ...BENT].map((a) => [a, el.getAttribute(a)]));
      this.drawn.set(el, as);
    }
    return as;
  }

  /** `el` as drawn again. */
  private putBack(el: Element): void {
    for (const [a, v] of this.drawn.get(el) ?? []) v === null ? el.removeAttribute(a) : el.setAttribute(a, v);
  }
}

/**
 * The View menu's Lens list, added to `menu` above its status line. Picking a lens bends the drawing at once, and the
 * open view in space too, and `picked` is told. Nothing is written to the note.
 */
export function renderLensChoice(
  menu: HTMLElement,
  lens: LensSvg,
  svg: () => SVGSVGElement | null,
  picked?: () => void,
): HTMLSelectElement {
  const row = menu.createEl('label', { cls: 'thoughtknot-lens-choice', text: word('view.lens') }),
    input = row.createEl('select');
  for (const l of LENSES) input.createEl('option', { text: word(`view.lens.${l}` as WordKey), attr: { value: l } });
  row.createDiv({ cls: 'thoughtknot-switch-hint', text: word('view.hint.lens') });
  input.value = lens.lens;
  input.addEventListener('change', () => {
    lens.pick(input.value as Lens);
    svg()?.dispatchEvent(new Event(MARKED)); // the view in space, if open, bends with it
    picked?.();
  });
  const status = Array.from(menu.children).find((el) => el.getAttribute('role') === 'status');
  if (status) menu.insertBefore(row, status);
  return input;
}
