// The colours of the levels, and the spotlight (editor spec §68, level_colours). Roger, 3 Nov 2026: pick a colour for
// each subject; its areas and topics take shades of it. Point at a colour and the others fade, so that colour's
// things come to the front.
//
// Each subject takes a hue in turn, until you pick another. A cloud at any level takes its subject's hue, a shade
// lighter for each level in. The spotlight marks the things and clouds of one subject. The rest fade, and only
// their look changes, so nothing moves.
import type { DetailLevel } from '../../detail-levels.ts';

/** How many hues the subjects take in turn. */
export const HUES = 6;
/** The class on a drawing while a subject is in the spotlight. */
export const SPOTLIT = 'thoughtknot-spotlit';
/** The class on the things and clouds of the subject in the spotlight. */
export const SPOT = 'is-spot';

/** The hues picked for subjects, by the levels they belong to and the subject's key. */
const picked = new WeakMap<readonly DetailLevel[], Map<string, number>>();

/** The hue of the subject `key`: the one picked for it, else its turn among the subjects. */
export function hueOf(levels: readonly DetailLevel[], key: string): number {
  const own = picked.get(levels)?.get(key);
  if (own !== undefined) return own;
  const i = (levels[0]?.groups ?? []).findIndex((g) => g.key === key);
  return Math.max(0, i) % HUES;
}

/** Picks the next hue for the subject `key`, and gives it back. */
export function nextHue(levels: readonly DetailLevel[], key: string): number {
  const hue = (hueOf(levels, key) + 1) % HUES;
  const map = picked.get(levels) ?? new Map<string, number>();
  map.set(key, hue);
  picked.set(levels, map);
  return hue;
}

/** The subject a group of level `at` is in: the group itself at level 0, else its parent's subject. */
export function subjectOf(levels: readonly DetailLevel[], at: number, key: string): string {
  let k = key;
  for (let i = at; i > 0; i--) k = levels[i]?.groups.find((g) => g.key === k)?.parent ?? k;
  return k;
}

/** Puts the subject `key` in the spotlight in `svg`, or takes the spotlight off (null). */
export function spotlight(svg: SVGSVGElement, levels: readonly DetailLevel[], key: string | null): void {
  const things = new Set(key ? (levels[0]?.groups.find((g) => g.key === key)?.things ?? []) : []);
  svg.classList.toggle(SPOTLIT, !!key);
  for (const g of Array.from(svg.querySelectorAll('g.node')))
    g.classList.toggle(SPOT, things.has(g.getAttribute('data-key') ?? ''));
  for (const u of Array.from(svg.querySelectorAll('g.thoughtknot-cloud-unit')))
    u.classList.toggle(SPOT, !!key && u.getAttribute('data-subject') === key);
}
