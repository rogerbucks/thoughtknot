// Tapping a cloud, and going back (editor spec §68, level_click_back). Roger's click rule, 24 Oct 2026: the first click
// on something picks it and shows what it is; the second turns to it. So the first tap on a cloud picks it: its outline
// dashes and it previews the level in it. The second flies in until it fills the screen. Back flies out to where you
// were, one step at a time. Pointing at a cloud previews it too, but never moves anything.
import type { Lifecycle } from '../lifecycle.ts';
import type { Place, Zoom } from '../../zoom.ts';
import { Glide } from './details-nav.ts';
import { boxIn } from './taps.ts';
import type { Taps } from './taps.ts';
import { cloudThings } from './level-clouds-svg.ts';

/** The class on a picked cloud. */
export const PICKED = 'is-picked';
/** How far a press may move and still be a tap, in pixels. */
const TAP_PX = 10;
/** How much of the screen a cloud flown into fills. */
const FILL = 0.85;

/** What the cloud taps need from their card. */
export interface LevelTapsHost {
  viewport: HTMLElement;
  svg: () => SVGSVGElement | null;
  zoom: () => Zoom;
  size: () => { width: number; height: number };
  taps: Taps;
  /** Told when the way back changes, so the badge shows Back or not. */
  changed: () => void;
}

/** The taps on one card's clouds: which is picked, and the views to go back to. */
export class LevelTaps {
  private picked: string | null = null;
  private down: { id: number; x: number; y: number; key: string } | null = null;
  private readonly back: Place[] = [];
  private readonly glide: Glide;
  private readonly host: LevelTapsHost;

  /** Listens on the card's viewport, for as long as the card is loaded. */
  constructor(card: Lifecycle, host: LevelTapsHost) {
    this.host = host;
    this.glide = new Glide(host.viewport);
    card.registerDomEvent(host.viewport, 'pointerdown', (e: PointerEvent) => {
      const key = cloudAt(e.target);
      this.down = key ? { id: e.pointerId, x: e.clientX, y: e.clientY, key } : null;
    });
    card.registerDomEvent(host.viewport, 'pointerup', (e: PointerEvent) => {
      const d = this.down;
      this.down = null;
      if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= TAP_PX) return;
      if (cloudAt(e.target) === d.key) this.tapped(d.key);
    });
  }

  /** A tap on the cloud `key`: the first picks it, the second flies into it. */
  tapped(key: string): void {
    if (this.picked === key) this.fly(key);
    else {
      this.picked = key;
      this.mark();
    }
  }

  /** Marks the picked cloud, after the clouds are drawn again. */
  mark(): void {
    for (const unit of Array.from(this.host.svg()?.querySelectorAll('g.thoughtknot-cloud-unit') ?? []))
      unit.classList.toggle(PICKED, unit.getAttribute('data-cloud') === this.picked);
  }

  /** Whether there is a view to go back to. */
  canGoBack(): boolean {
    return this.back.length > 0;
  }

  /** Flies back out to the view before the last fly in. */
  goBack(): void {
    const to = this.back.pop();
    if (to) this.glide.to(this.host.zoom(), to);
    this.picked = null;
    this.mark();
    this.host.changed();
  }

  /** Flies in until the cloud `key` fills most of the screen, keeping the view it left to go back to. */
  fly(key: string): void {
    const svg = this.host.svg(),
      zoom = this.host.zoom();
    const boxes = cloudThings(svg as SVGSVGElement, key).flatMap((k) => {
      const id = boxIn(svg, k)?.getAttribute('id');
      return (id && this.host.taps.bounds(id)) || [];
    });
    if (!svg || !boxes.length) return;
    const left = Math.min(...boxes.map((b) => b.x)),
      top = Math.min(...boxes.map((b) => b.y)),
      right = Math.max(...boxes.map((b) => b.x + b.width)),
      bottom = Math.max(...boxes.map((b) => b.y + b.height));
    const v = zoom.view(),
      { width, height } = this.host.size(),
      cw = v.width / v.scale,
      ch = v.height / v.scale;
    const scale = FILL * Math.min(width / Math.max(1, (right - left) * cw), height / Math.max(1, (bottom - top) * ch));
    const to = zoom.aim({ x: left, y: top, width: right - left, height: bottom - top }, scale, true);
    if (!to) return;
    this.back.push({ scale: v.scale, x: v.x, y: v.y });
    this.picked = null;
    this.glide.to(zoom, to);
    this.host.changed();
  }
}

/** The key of the cloud an event's target is in, if any. */
function cloudAt(target: EventTarget | null): string | null {
  const el = target as Element | null;
  return el?.closest?.('g.thoughtknot-cloud-unit')?.getAttribute('data-cloud') ?? null;
}
