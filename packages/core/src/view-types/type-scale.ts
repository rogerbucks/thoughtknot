// One type scale for every view (design review, 1 Nov 2026; Zen-led refresh step 1). A view's names were 6 pixels in one
// view and 30 in the next. Now each view sizes its names in one band: never too small to read, never shouting. A
// caption, such as a count or an axis name, is one step smaller. A view with too little room shows fewer names.

/** The least and most size a thing's name is drawn at, in pixels of a screen-shaped view. */
export const NAME_LEAST = 9,
  NAME_MOST = 12;
/** A caption's size, as a share of a name's. */
export const CAPTION = 0.85;

/** A name's size in the band, from the size a view would want for its room. */
export const nameSize = (want: number): number => Math.min(NAME_MOST, Math.max(want, NAME_LEAST));

/** A caption's size, for names of `name` size: one step smaller, but never under the least a name may be. */
export const captionSize = (name: number): number => Math.max(name * CAPTION, NAME_LEAST * CAPTION);
