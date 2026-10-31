// An exploration saved in the style graph (editor spec §71, explore_saved). Roger chose, 31 Oct 2026, to build saving
// now. In edit mode the explore sidebar saves it as one Explore line in the graph's style block:
//
//   (explore_1:Explore {centre: 'Ada', shown: 'Bob, Cy', shape: 'balanced', per_branch: 12})
//
// `shown` lists the things shown besides the centre, comma-joined. Opened again, each thing's parent is read again from
// the centre, as a recentre reads it. An Explore with `view` is for that view; with none, for the whole graph. A shown
// thing the graph no longer has is left out without a word, as the data may have changed since it was saved.
import { BRANCH_FIRST } from './explore-map.ts';
import type { Problem } from './note-reading.ts';
import type { RawThing, StyledNames } from './style-checks.ts';
import type { StyleAt } from './style-graph.ts';
import { reader } from './style-reader.ts';
import { EXPLORE_SHAPES } from './layouts/explore-shapes.ts';
import type { ExploreShape } from './layouts/explore-shapes.ts';
import { word } from './words.ts';

/** An exploration as the style graph saves it: its centre, what else is shown, its shape and things per branch. */
export interface ExploreSave {
  centre: string;
  /** The things shown besides the centre, in the order they were shown. */
  shown: string[];
  shape: ExploreShape;
  perBranch: number;
  /** The view it is for; none, the whole graph. */
  view?: string;
}

/** An Explore read from the style graph, checked. */
export interface SavedExplore extends ExploreSave {
  at: StyleAt;
}

/** The text a saved exploration's `shown` is written as: its things, comma-joined. */
export function shownText(keys: readonly string[]): string {
  return keys.join(', ');
}

/** Why `e` cannot be saved, or null: a thing whose name is empty or holds the comma its list is split by. */
export function exploreRefusal(e: ExploreSave): string | null {
  for (const key of [e.centre, ...e.shown])
    if (!key.trim() || key.includes(',')) return word('styling.explore.unsaved', { thing: key });
  return null;
}

/**
 * An Explore, checked against the graph it styles. Its centre must be a thing of the graph, and its shape one of the
 * six. Things shown that the graph lacks are left out. With no centre it is a problem with its fix, and left out.
 */
export function exploreOf(raw: RawThing, names: StyledNames, out: Problem[]): SavedExplore | null {
  const r = reader(raw, names, out);
  if (r.text('centre') === undefined) {
    r.missing(word('styling.explore.centre'), word('styling.explore.centre.fix'));
    return null;
  }
  const centre = r.name('centre', names.things, word('styling.what.thing'));
  if (centre === undefined) return null;
  const shape = r.word('shape', EXPLORE_SHAPES, (s) => word('styling.explore.shape', { shape: s })) ?? 'balanced';
  const shown = (r.text('shown') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k && k !== centre && names.things.has(k));
  const view = r.text('view');
  return {
    centre,
    shown: [...new Set(shown)],
    shape,
    perBranch: r.number('per_branch') ?? BRANCH_FIRST,
    ...(view === undefined ? {} : { view }),
    at: raw.at,
  };
}

/** The Explore for `view`, or for the whole graph with none: the first written of those for it. */
export function savedExploreFor(explores: readonly SavedExplore[], view?: string): ExploreSave | undefined {
  return explores.find((e) => e.view === view);
}
