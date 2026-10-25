// The options every layout takes (editor spec §53, layout_options). Roger, 24 Oct 2026: spacing, link length and
// how tightly groups gather, in 2D and 3D, saved with a view. Roger, 25 Oct 2026: "The layout seems very sparse".
//
// Each option is a share of the layout's own default: 1 is as it lays out now, 0.5 half as much and 2 twice. A view
// saves them. A layout reads them through `layoutOptions`, which keeps each in range. Host-free and pure.

/** How a layout spaces a graph's things: each a share of its default, 1 being as now. */
export interface LayoutOptions {
  /** How far apart things sit beside each other. */
  spacing: number;
  /** How long a link is: the room between rows, or the length a force pulls a link to. */
  linkLength: number;
  /** How tightly a group's things gather: 0 not at all, 0.5 as now, 1 twice as tightly. */
  groupPull: number;
}

/** Every option as each layout lays out without them. */
export const DEFAULT_LAYOUT_OPTIONS: Readonly<LayoutOptions> = { spacing: 1, linkLength: 1, groupPull: 0.5 };

/** The least and the most of each option. */
export const LAYOUT_OPTION_RANGE: Readonly<Record<keyof LayoutOptions, readonly [number, number]>> = {
  spacing: [0.25, 4],
  linkLength: [0.25, 4],
  groupPull: [0, 1],
};

/** How a view saved as shown writes each option in its style graph (§53, layout_saved_with_view). */
export const SHOWN_LAYOUT_KEYS = {
  spacing: 'spacing',
  linkLength: 'link_length',
  groupPull: 'group_pull',
} as const satisfies Record<keyof LayoutOptions, string>;

/** Whether `o` lays out as each layout does without options. */
export const isDefaultLayout = (o: LayoutOptions): boolean =>
  (Object.keys(DEFAULT_LAYOUT_OPTIONS) as (keyof LayoutOptions)[]).every((k) => o[k] === DEFAULT_LAYOUT_OPTIONS[k]);

/** `raw` as options: each kept in its range, and the default where it is missing or not a number. */
export function layoutOptions(raw?: Partial<Record<keyof LayoutOptions, unknown>>): LayoutOptions {
  const read = (k: keyof LayoutOptions): number => {
    const v = raw?.[k],
      [lo, hi] = LAYOUT_OPTION_RANGE[k];
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : DEFAULT_LAYOUT_OPTIONS[k];
  };
  return { spacing: read('spacing'), linkLength: read('linkLength'), groupPull: read('groupPull') };
}
