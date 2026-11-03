// Watching a rule (editor spec §60, discover_watch_rule). A person watches one bucket of a lens rule and is told when
// things start or stop being in it. The state is the rule and what it matched last time. Each look at the graph gives the new state and
// at most one notice. The first look sets the baseline and says nothing. The engine that runs this in the background
// is §40; this part is what it asks of each edit.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';
import { compareSets } from './compare-sets.ts';
import { word } from './words.ts';

/** A watched rule and the bucket that counts as matching, with the things in it at the last look; null before the first. */
export interface Watch {
  rule: string;
  bucket: string;
  matched: string[] | null;
}

/** The things a lens rule puts in `bucket` in `g`; none for a rule that cannot be run. */
export function matchesOf(g: Graph, rule: string, bucket: string): string[] {
  return Object.entries(gs.lensBuckets(g, rule) ?? {})
    .filter(([, b]) => b === bucket)
    .map(([id]) => id);
}

/** Watches a rule: nothing matched yet is known. */
export const watching = (rule: string, bucket: string): Watch => ({ rule, bucket, matched: null });

/** One look at `g`: the new state, and one notice if things started or stopped matching since the last look. */
export function look(w: Watch, g: Graph): { watch: Watch; notice: string | null } {
  const now = matchesOf(g, w.rule, w.bucket);
  if (w.matched === null) return { watch: { ...w, matched: now }, notice: null };
  const { onlyA: stopped, onlyB: started } = compareSets(w.matched, now);
  const parts = [
    started.length ? word('watch.started', { rule: w.rule, things: started.join(', ') }) : '',
    stopped.length ? word('watch.stopped', { rule: w.rule, things: stopped.join(', ') }) : '',
  ].filter(Boolean);
  return { watch: { ...w, matched: now }, notice: parts.length ? parts.join(' ') : null };
}
