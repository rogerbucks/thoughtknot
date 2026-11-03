// Saving an exploring trail (editor spec §60, discover_saved_trail). A trail (explore-trail.ts) can be saved to open
// again or to share, in one of two ways. As a lens it keeps the last picture's rule. As a path it keeps every step's
// rule in order, and opening it replays them. Both are lines of graph text, read back as written.
import { lensText } from './lens-library.ts';
import { word } from './words.ts';

/** Marks a path's steps are split by, which no rule may hold. */
const SPLIT = ' | ';

/** The line that saves the trail's last rule as a lens; refused for a trail with no step. */
export function trailAsLens(id: string, name: string, rules: readonly string[]): string {
  const last = rules.at(-1);
  if (last === undefined) throw new Error(word('trail.empty'));
  return lensText({ id, name, query: last });
}

/** The line that saves every step of the trail, in order, as a path. */
export function trailAsPath(id: string, name: string, rules: readonly string[]): string {
  if (!rules.length || rules.some((r) => r.includes(SPLIT))) throw new Error(word('trail.path-refused'));
  const q = (v: string) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return `(${id}:Path {name: ${q(name)}, steps: ${q(rules.join(SPLIT))}})`;
}

/** The steps a path's `steps` property holds, in the order to replay them. */
export const pathSteps = (steps: string): string[] => steps.split(SPLIT);
