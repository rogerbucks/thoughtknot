// A card drawn again keeps the room it took and what it showed (editor spec §73, render_type_morph). While a new
// diagram type is drawn, the card holds its height, so the page does not jump. The new drawing is handed where each
// thing was on the screen, so it can glide them to their new places. Only then may the card change size (Roger, 8 Nov
// 2026). What was shown is kept per note and graph, on the plugin. So it holds when reading view draws the card again
// in place, and when Obsidian draws a fresh card after a write in edit view.
import type { Seen } from '@thoughtknot/core/display/graph-view/stage-morph';

/** What a card last showed: how tall it was, and what its stage showed, read when the next card asks. */
interface Shown {
  height: number;
  seen?: () => Seen;
}

/** A little longer than the new card's things take to glide to their places (stage-morph.ts). */
const SETTLED_MS = 450;

const kept = new WeakMap<object, Map<string, Shown>>();
const shownOf = (owner: object, key: string): Shown => {
  const all = kept.get(owner) ?? new Map<string, Shown>();
  kept.set(owner, all);
  const one = all.get(key) ?? { height: 0 };
  all.set(key, one);
  return one;
};

/** What the next card of `graph` in the note at `path` is handed: what the last one showed, and how to keep its own. */
export function seenFor(owner: object, path: string, graph: string) {
  const one = shownOf(owner, `${path}\n${graph}`);
  return { before: one.seen?.(), keep: (seen: () => Seen) => void (one.seen = seen) };
}

/**
 * Holds `el` at the height the last card of `graph` took, while it is drawn again. The returned function lets it go
 * once the new card's things have glided to their places, and keeps the new card's height for next time.
 */
export function holdHeight(owner: object, path: string, graph: string | null, el: HTMLElement): () => void {
  if (!graph) return () => {};
  const one = shownOf(owner, `${path}\n${graph}`);
  const tall = el.offsetHeight || one.height;
  if (tall) el.style.minHeight = `${tall}px`;
  const free = () => {
    if (tall) el.style.minHeight = '';
    one.height = el.offsetHeight || one.height;
  };
  // the page may be gone by the time the card is drawn, as when a note is closed at once
  return () => void (typeof window === 'undefined' ? undefined : window.setTimeout(free, SETTLED_MS));
}
