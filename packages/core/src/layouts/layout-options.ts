// The options every layout takes (editor spec §53, layout_options). Roger, 24 Oct 2026: spacing, link length and
// how tightly groups gather, in 2D and 3D, saved with a view. Roger, 25 Oct 2026: "The layout seems very sparse".
// Roger, 25 Oct 2026 (§68, layout_strategy_variables): each strategy's variables are named, each with a default. They
// are set in the style graph and the View menu, by the same names in 2D and 3D: direction, shape, rounds and pinned.
//
// A number is a share of the layout's own default: 1 is as it lays out now, 0.5 half as much and 2 twice. A choice
// is one of a few words, the first being as now. A view saves them. A layout reads them through `layoutOptions`, which
// keeps each in range. Host-free and pure.

/** How a layout lays out a graph's things: each number a share of its default, 1 being as now. */
export interface LayoutOptions {
  /** How far apart things sit beside each other. */
  spacing: number;
  /** How long a link is: the room between rows, or the length a force pulls a link to. */
  linkLength: number;
  /** How tightly a group's things gather: 0 not at all, 0.5 as now, 1 twice as tightly. */
  groupPull: number;
  /** How many rounds a layout takes to settle: ordering rows, pushing boxes apart, or forces in space. */
  rounds: number;
  /** Which way links run: the best fit, left to right, or top to bottom. */
  direction: (typeof LAYOUT_CHOICES.direction)[number];
  /** The shape the whole drawing is packed to: a screen's, wider, or taller. */
  shape: (typeof LAYOUT_CHOICES.shape)[number];
  /** What stays where it was on the screen as a layout changes: the selected thing, the middle of all, or nothing. */
  pinned: (typeof LAYOUT_CHOICES.pinned)[number];
}

/** The options that are numbers. */
export type LayoutShare = 'spacing' | 'linkLength' | 'groupPull' | 'rounds';
/** The options that are choices of words. */
export type LayoutChoice = Exclude<keyof LayoutOptions, LayoutShare>;

/** The words each choice may be, the first being as each layout lays out without it. */
export const LAYOUT_CHOICES = {
  direction: ['best', 'LR', 'TB'],
  shape: ['screen', 'wide', 'tall'],
  pinned: ['selected', 'middle', 'nothing'],
} as const;

/** Every option as each layout lays out without them. */
export const DEFAULT_LAYOUT_OPTIONS: Readonly<LayoutOptions> = {
  spacing: 1,
  linkLength: 1,
  groupPull: 0.5,
  rounds: 1,
  direction: 'best',
  shape: 'screen',
  pinned: 'selected',
};

/** The least and the most of each number. */
export const LAYOUT_OPTION_RANGE: Readonly<Record<LayoutShare, readonly [number, number]>> = {
  spacing: [0.25, 4],
  linkLength: [0.25, 4],
  groupPull: [0, 1],
  rounds: [0.25, 4],
};

/** How a view saved as shown writes each number in its style graph (§53, layout_saved_with_view). */
export const SHOWN_LAYOUT_KEYS = {
  spacing: 'spacing',
  linkLength: 'link_length',
  groupPull: 'group_pull',
  rounds: 'rounds',
} as const satisfies Record<LayoutShare, string>;

/** How it writes each choice there: by the same name in 2D and 3D (layout_strategy_variables). */
export const SHOWN_LAYOUT_CHOICES = {
  direction: 'layout_direction',
  shape: 'shape',
  pinned: 'pinned',
} as const satisfies Record<LayoutChoice, string>;

/** Whether `o` lays out as each layout does without options: one it leaves out is as without. */
export const isDefaultLayout = (o: Partial<LayoutOptions>): boolean =>
  (Object.keys(DEFAULT_LAYOUT_OPTIONS) as (keyof LayoutOptions)[]).every(
    (k) => (o[k] ?? DEFAULT_LAYOUT_OPTIONS[k]) === DEFAULT_LAYOUT_OPTIONS[k],
  );

/** `raw` as options: each kept in its range or its words, and the default where it is missing or wrong. */
export function layoutOptions(raw?: Partial<Record<keyof LayoutOptions, unknown>>): LayoutOptions {
  const read = (k: LayoutShare): number => {
    const v = raw?.[k],
      [lo, hi] = LAYOUT_OPTION_RANGE[k];
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : DEFAULT_LAYOUT_OPTIONS[k];
  };
  const pick = <K extends LayoutChoice>(k: K): LayoutOptions[K] =>
    ((LAYOUT_CHOICES[k] as readonly unknown[]).includes(raw?.[k])
      ? raw?.[k]
      : DEFAULT_LAYOUT_OPTIONS[k]) as LayoutOptions[K];
  return {
    spacing: read('spacing'),
    linkLength: read('linkLength'),
    groupPull: read('groupPull'),
    rounds: read('rounds'),
    direction: pick('direction'),
    shape: pick('shape'),
    pinned: pick('pinned'),
  };
}

/** How many rounds a layout whose own count is `usual` takes, as `rounds` asks: always one at least. */
export const roundsOf = (o: Partial<LayoutOptions> | undefined, usual: number): number =>
  Math.max(1, Math.round(usual * layoutOptions(o).rounds));

/** The width over height a drawing is packed to, as its `shape` asks, from a screen's `screen`. */
export function aspectOf(o: Partial<LayoutOptions> | undefined, screen: number): number {
  const { shape } = layoutOptions(o);
  return shape === 'wide' ? screen * 2 : shape === 'tall' ? 1 / screen : screen;
}
