// How the view in space keeps its look from one frame to the next (editor spec §53, space_label_hold). Roger, 5 Nov 2026:
// the labels sometimes completely change format unexpectedly. So a name floated beside its thing stays there until
// plainly readable on it. A card keeps its name, and near in a card stops growing. Far out, the levels' clouds
// stand for the things.
import type { SpaceFrame } from './space-cards.ts';

/** The largest a card's words grow on the screen, in pixels, however near it comes: as the mockup's cards. Roger,
 * 5 Nov 2026: near in, names were huge and covered each other. */
export const WORDS_MOST = 18;
/** The widest a card grows on the screen, in pixels, however near it comes. */
export const CARD_MOST = 220;
/** How much a name floated beside its thing must grow past the least readable size before it goes back on its thing. So
 * a name near the edge never flips between the two at each step of a zoom (Roger, 5 Nov 2026). */
export const LABEL_HOLD = 1.3;

/**
 * What the last frame showed, kept between frames so a name keeps its look. `named` holds the cards whose names were
 * placed. `beside` holds the names floated beside their things. Each frame reads it, then writes its own.
 */
export interface LabelMemory {
  named: Set<string>;
  beside: Set<string>;
}

/**
 * `frame` as it shows in `view`. Far out, the levels' clouds over it are marked far, and they hold its things
 * (level_look). They show each thing as a dot and its links in their roads. So no card, name, ball or link is painted. The picked
 * thing keeps its ring and its links. Near in, every thing shows as before.
 */
export function farFrame(frame: SpaceFrame, view: { querySelector(q: string): unknown }): SpaceFrame {
  if (!view.querySelector('svg.thoughtknot-far')) return frame;
  const shapes = { ...frame.shapes, blocks: [], lines: [], labels: [], arrows: [] };
  return { ...frame, shapes, cards: [], faces: [], arrows: [], labels: [], shafts: [], outlines: [] };
}
