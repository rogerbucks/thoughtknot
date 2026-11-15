// The cards a reader chose together, to size at once (render_cards). Roger, 15 Nov 2026: a card's size is "just
// different zoom levels to fit the information in". So several chosen cards take one step together. Nothing here
// draws, so the cards on a whiteboard can choose with it too.
import type { CardFit } from './render/render-cards.ts';

/** A card's step: its name only, its first lines, or all it holds. */
export type CardStep = CardFit | 'lines';

/** The cards chosen together, in the order they were chosen. */
export class CardChoice {
  private readonly keys = new Set<string>();

  /** How many cards are chosen. */
  get size(): number {
    return this.keys.size;
  }

  /** Whether card `key` is chosen. */
  has(key: string): boolean {
    return this.keys.has(key);
  }

  /** Adds card `key`, or takes it out when it is in already. Says whether it is chosen now. */
  toggle(key: string): boolean {
    if (this.keys.delete(key)) return false;
    this.keys.add(key);
    return true;
  }

  /** Chooses just the cards `keys`. */
  set(keys: Iterable<string>): void {
    this.keys.clear();
    for (const k of keys) this.keys.add(k);
  }

  /** Lets every card go. */
  clear(): void {
    this.keys.clear();
  }

  /** The cards chosen, in the order they were chosen. */
  list(): string[] {
    return [...this.keys];
  }

  /** The cards chosen, as a set to look in. */
  all(): ReadonlySet<string> {
    return this.keys;
  }
}

/** The fit a step gives a card: first lines are no fit at all. */
export const fitOfStep = (step: CardStep): CardFit | undefined => (step === 'lines' ? undefined : step);

/** The step all the cards `keys` share in `fits`, or null when they differ. A card not in `fits` shows its first lines. */
export function sharedStep(fits: ReadonlyMap<string, { fit: CardFit }>, keys: readonly string[]): CardStep | null {
  const steps = new Set(keys.map((k) => fits.get(k)?.fit ?? 'lines'));
  return steps.size === 1 ? ([...steps][0] as CardStep) : null;
}
