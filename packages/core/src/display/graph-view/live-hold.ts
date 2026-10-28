// A layout shown as it improves (editor spec §68, layout_live_loop). Roger, 25 Oct 2026. A big drawing comes first as
// a quick picture, in rows. Its settled layout is still coming (render.ts, `Drawn.better`). When it comes, it glides
// in. While a person holds the drawing down, it waits until they let go. So nothing moves under their hand.
import type { Drawn } from '@thoughtknot/core';

/** The ways a pointer lets go of the drawing. */
const LET_GO = ['pointerup', 'pointercancel'] as const;

/** One card's settled layouts, each put in once nothing holds the drawing. */
export class LiveHold {
  private readonly down = new Set<number>();
  private waiting: (() => void) | null = null;
  private heard: HTMLElement | null = null;
  private readonly press = (e: PointerEvent) => this.pressed(e);
  private readonly letGo = (e: PointerEvent) => this.released(e);

  private readonly viewportOf: () => HTMLElement;

  /** For the card's viewport, made once the card is built. */
  constructor(viewport: () => HTMLElement) {
    this.viewportOf = viewport;
  }

  /** Whether a pointer holds the drawing down now. */
  get held(): boolean {
    return this.down.size > 0;
  }

  /** Puts `drawn`'s settled layout in by `put` once it comes, at once or when the drawing is let go. */
  follow(drawn: Drawn, put: (better: Drawn) => void): void {
    if (!drawn.better) return;
    this.listen();
    void drawn.better.then((b) => {
      if (!b) return; // no longer wanted, or it could not settle: the quick picture stays
      if (this.held) this.waiting = () => put(b);
      else put(b);
    });
  }

  private listen(): void {
    const el = this.viewportOf();
    if (this.heard === el) return;
    this.heard?.removeEventListener('pointerdown', this.press, { capture: true });
    el.addEventListener('pointerdown', this.press, { capture: true });
    this.heard = el;
  }

  /** The page the card is on, a pop-out window's own where it is in one. */
  private doc(): Document | undefined {
    return this.heard?.ownerDocument;
  }

  private pressed(e: PointerEvent): void {
    // its letting go is heard anywhere on the page, as a drag may end outside the card
    if (!this.down.size) for (const type of LET_GO) this.doc()?.addEventListener(type, this.letGo, true);
    this.down.add(e.pointerId);
  }

  private released(e: PointerEvent): void {
    this.down.delete(e.pointerId);
    if (this.down.size) return;
    for (const type of LET_GO) this.doc()?.removeEventListener(type, this.letGo, true);
    const waiting = this.waiting;
    this.waiting = null;
    waiting?.();
  }
}
