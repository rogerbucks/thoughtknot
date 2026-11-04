// Tags that never overlap (editor spec §68, level_tags). Roger approved this from the UX review, 3 Nov 2026. At a
// level with many clouds, their names and the gates' signposts could fall on each other. Each tag that overlaps one
// above it moves down, just below it, and never across. So every tag stays by its own cloud or gate, readable.
// Host-free and pure: it gives the new heights, and draws nothing.

/** A tag: its middle across, its baseline, and its size, all in the drawing's units. */
export interface Tag {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How near two tags may come before they overlap, so a sum that rounds a little short still parts them. */
const EPSILON = 1e-6;

/** The width a line of `words` takes at `px` units a letter, near enough to keep tags apart. */
export const tagWidth = (words: string, px: number): number => words.length * px * 0.6;

/**
 * The baseline each of `tags` moves to, in their order, so that no two overlap. They are taken from the top down: a
 * tag that overlaps one above it goes just below it. A tag that overlaps none stays, and the order is kept.
 */
export function spreadTags(tags: readonly Tag[]): number[] {
  const ys = tags.map((t) => t.y);
  const order = tags.map((_, i) => i).sort((a, b) => (ys[a] as number) - (ys[b] as number) || a - b);
  const placed: number[] = [];
  for (const i of order) {
    const t = tags[i] as Tag;
    let y = ys[i] as number;
    // pushed down past each one above that it would overlap, until it overlaps none
    for (let again = true; again;) {
      again = false;
      for (const j of placed) {
        const o = tags[j] as Tag,
          oy = ys[j] as number;
        const across = (t.width + o.width) / 2 - Math.abs(t.x - o.x),
          gap = (t.height + o.height) / 2;
        if (across > 0 && Math.abs(y - oy) < gap - EPSILON) {
          y = oy + gap;
          again = true;
        }
      }
    }
    ys[i] = y;
    placed.push(i);
  }
  return ys;
}
