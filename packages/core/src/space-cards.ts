// Things as cards in the 3D view (editor spec §53, space_cards). Roger, 24 Oct 2026: "the whole name/title ... should be
// shown". He asked for the text in the shape: a "2.5D" view of boxes that always face the user, while the view turns.
// He chose cards as the way the view opens, with balls a press away.
//
// Each thing is laid out in space as a ball is (space-spread.ts), but painted as a card flat to the screen. It is the
// size of the thing's box in 2D, smaller as it is further off, with the thing's whole name inside, wrapped to fit. Far
// ones are painted first, so near ones cover them. A card far off still shows its name, at a size that can be read, where
// it covers no nearer card's name. Else it is a small plain card, unless it is picked. Plain cards are painted before
// named ones, so nothing covers a name. Each arrowhead is painted at the
// edge of the card it points to. Host-free and pure.
import { FIELD, projectPoint } from './space-view.ts';
import { isPlane } from './space-planes.ts';
import type { Block, SpaceMarks, Vec3 } from './space-view.ts';
import {
  ARROW_LEAST,
  ARROW_WIDE,
  READABLE_LEAST,
  arrowsOnScreen,
  largestName,
  labelsOnScreen,
  pickedRing,
} from './space-labels.ts';
import type { ScreenArrow, ScreenLabel } from './space-labels.ts';
import { facesOnScreen, rowsOf } from './space-faces.ts';
import type { FaceText } from './space-faces.ts';

export { rowsOf };

/** A card on the screen: its middle, its size, its words in rows and their size, all in pixels. */
export interface ScreenCard {
  block: Block;
  x: number;
  y: number;
  width: number;
  height: number;
  far: number;
  rows: string[];
  size: number;
  picked?: boolean;
}

/** The size of a card's words, in pixels of the space: as a 2D box's. */
const WORDS_SIZE = 14;
/** The smallest a card's words would be, unclamped, for them to be painted whatever they cover. */
const WORDS_LEAST = 6;
/** The most cards whose names are painted only where they cover no other's, so a huge graph stays quick. */
const NAMES_MOST = 200;
/** The room kept between two cards' names, in pixels. */
const NAMES_APART = 3;
/** The room inside a card round its words, as a share of their size. */
const PAD = 0.5;
/** How wide a letter is, about, as a share of its size. */
const LETTER_WIDTH = 0.52;
/** How much wider than its box a card may grow before its words wrap, and the fewest letters in a row. */
const WIDER = 1.5,
  ROW_LEAST = 14;
/** How tall a row of words is, as a share of their size. */
const ROW = 1.25;
/** How long an arrowhead is on the screen, as a share of a card's words, kept between ARROW_LEAST and a most. */
const ARROW_SHARE = 1.2,
  ARROW_MOST = 22;
/** The most an arrowhead is long, as a share of the card it points to's height: never bigger than the card. */
const ARROW_OF_CARD = 0.8;
/**
 * How thick a link is drawn, in pixels of the space, and the least and most it is on the screen. So a near link is a
 * little bolder than a far one, and none is a hairline (Roger, 25 Oct 2026: "more diagrammatic ... rather than just thin
 * lines").
 */
const SHAFT = 2.5,
  SHAFT_LEAST = 1.5,
  SHAFT_MOST = 3.5;
/** The most links drawn thick. Past it only the graphics chip's thin lines are drawn, so a huge graph stays quick. */
export const SHAFTS_MOST = 3000;

/** The middle of a block, in the space. */
const middle = (b: Block): Vec3 => [b.x + b.width / 2, b.y + b.depth / 2, b.floor + b.tall / 2];

/** The cards of `space` in the order they are painted, with `picked` marked. Each thing's words are its name, whole. */
export function cardsOnScreen(
  space: SpaceMarks,
  matrix: Float32Array,
  width: number,
  height: number,
  picked?: string,
): ScreenCard[] {
  const focal = height / 2 / Math.tan(FIELD / 2);
  const names = new Map<string, string>();
  for (const l of space.labels) if (l.of !== undefined && l.link === undefined) names.set(l.of, l.text);
  // nearest first, the picked one before all: a name is painted where it covers none painted already
  const seen = space.blocks.flatMap((b) => {
    const c = projectPoint(matrix, middle(b), width, height);
    return c ? [{ b, c, mine: picked !== undefined && b.of === picked }] : [];
  });
  seen.sort((p, q) => Number(q.mine) - Number(p.mine) || p.c.far - q.c.far);
  const named: { x: number; y: number; width: number; height: number }[] = [];
  const free = (x: number, y: number, w: number, h: number) =>
    named.length < NAMES_MOST &&
    named.every(
      (n) => Math.abs(n.x - x) * 2 >= n.width + w + NAMES_APART || Math.abs(n.y - y) * 2 >= n.height + h + NAMES_APART,
    );
  const out: ScreenCard[] = [],
    largest = largestName(width, height);
  for (const { b, c, mine } of seen) {
    const scale = focal / c.far;
    const natural = WORDS_SIZE * scale;
    const text = (b.of === undefined ? undefined : names.get(b.of)) ?? b.name ?? '';
    const size = Math.max(READABLE_LEAST, Math.min(largest, natural));
    const w = (b.card?.width ?? b.width) * scale,
      h = (b.card?.height ?? b.tall) * scale;
    // its name wrapped to fit, and the card grown to hold it
    const room = size * PAD * 2;
    const wrapped = rowsOf(text, Math.max(ROW_LEAST, Math.floor((w * WIDER - room) / (size * LETTER_WIDTH))));
    const ww = Math.max(w, Math.max(0, ...wrapped.map((r) => r.length)) * size * LETTER_WIDTH + room),
      hh = Math.max(h, wrapped.length * size * ROW + room);
    const r = Math.hypot(ww, hh) / 2;
    if (c.x + r < 0 || c.y + r < 0 || c.x - r > width || c.y - r > height) continue;
    const read = wrapped.length > 0 && (mine || natural >= WORDS_LEAST || free(c.x, c.y, ww, hh));
    if (read) named.push({ x: c.x, y: c.y, width: ww, height: hh });
    const [rows, cw, ch] = read ? [wrapped, ww, hh] : [[], w, h];
    const card: ScreenCard = { block: b, x: c.x, y: c.y, width: cw, height: ch, far: c.far, rows, size };
    if (mine) card.picked = true;
    out.push(card);
  }
  // plain cards first, so no name is ever covered; then named ones, the picked last; far ones first in each
  const rank = (c: ScreenCard) => (c.picked ? 2 : c.rows.length ? 1 : 0);
  return out.sort((p, q) => rank(p) - rank(q) || q.far - p.far);
}

/** The nearest card under the point (`x`, `y`) of the screen, if any. */
export function cardAt(cards: readonly ScreenCard[], x: number, y: number): ScreenCard | undefined {
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i] as ScreenCard;
    if (Math.abs(x - c.x) <= c.width / 2 && Math.abs(y - c.y) <= c.height / 2) return c;
  }
  return undefined;
}

/**
 * The arrowheads of `space`'s links on the screen. Each has its tip at the edge of the card it points to, and points
 * from where its link comes in. A link with both ends on one card, as seen, has no way to point, so it has none.
 */
export function cardArrows(
  space: SpaceMarks,
  matrix: Float32Array,
  width: number,
  height: number,
  cards: readonly ScreenCard[],
): ScreenArrow[] {
  const byKey = new Map(cards.flatMap((c) => (c.block.of === undefined ? [] : [[c.block.of, c] as const])));
  // a line with no arrowhead in space, such as a merged link's to its trunk, has none at a card either
  const headed = new Set(space.arrows.map((a) => a.id));
  const out: ScreenArrow[] = [];
  for (const l of space.lines) {
    const to = l.to === undefined || !headed.has(`${l.id}\narrow`) ? undefined : byKey.get(l.to);
    if (!to) continue;
    // the last point of the line outside the card: where the link comes in from
    let from: { x: number; y: number } | null = null;
    for (let i = l.points.length - 1; i >= 0 && !from; i--) {
      const p = projectPoint(matrix, l.points[i] as Vec3, width, height);
      if (p && (Math.abs(p.x - to.x) > to.width / 2 || Math.abs(p.y - to.y) > to.height / 2)) from = p;
    }
    const back = from ?? (l.from === undefined ? undefined : byKey.get(l.from));
    if (!back) continue;
    const vx = back.x - to.x,
      vy = back.y - to.y;
    const s = Math.min(to.width / 2 / Math.max(Math.abs(vx), 1e-9), to.height / 2 / Math.max(Math.abs(vy), 1e-9));
    if (s >= 1) continue;
    const tip = { x: to.x + vx * s, y: to.y + vy * s },
      seen = Math.hypot(vx, vy);
    const dx = -vx / seen,
      dy = -vy / seen;
    const long = Math.min(
        Math.max(ARROW_LEAST, Math.min(ARROW_MOST, to.size * ARROW_SHARE)),
        Math.max(ARROW_LEAST, to.height * ARROW_OF_CARD),
      ),
      half = (long * ARROW_WIDE) / 2;
    const bx = tip.x - dx * long,
      by = tip.y - dy * long;
    out.push({
      id: `${l.id}\narrow`,
      style: l.style,
      tip,
      left: { x: bx - dy * half, y: by + dx * half },
      right: { x: bx + dy * half, y: by - dx * half },
      far: to.far,
    });
  }
  return out;
}

/** What one frame of the 3D view paints: the shapes for the graphics chip, and over them cards, arrowheads and words. */
export interface SpaceFrame {
  shapes: SpaceMarks;
  cards: ScreenCard[];
  /** In 3D, the things' names, each on the face of its box or ball the camera sees best (space_text_on_face). */
  faces: FaceText[];
  arrows: ScreenArrow[];
  labels: ScreenLabel[];
  ring: { x: number; y: number; r: number } | null;
  /** The picked thing's links, or the picked link, on the screen: drawn a little thicker over the rest (Roger, 25 Oct). */
  strong: { style: string; points: { x: number; y: number }[] }[];
  /** Every link on the screen, with how thick it is drawn, in pixels: none past SHAFTS_MOST links. */
  shafts: { style: string; points: { x: number; y: number }[]; width: number }[];
  /** Each open group outlined round its things on the screen, its name on its top edge (cluster_named_everywhere). */
  outlines: ScreenOutline[];
}

/** An open group in the space: its id, its style, its name and the keys of the things in it. */
export type SpaceGroup = NonNullable<SpaceMarks['groups']>[number];

/**
 * Whether a thing's key is a folded group's box. The layout source names it `group: 2` (fold-source.ts). The drawing
 * on screen has no title to read, so there it is `fold_group_2` (drawing-svg.ts).
 */
export const isCluster = (of: string | undefined): boolean => /^(?:group: \d+|fold_group_\d+)$/.test(of ?? '');

/** How much of the screen, wide or high, a folded group fills before zooming in opens it (cluster_opens). */
export const ZOOM_OPENS = 0.5;

/** Whether a box of `box`'s size fills enough of a screen `width` by `height` for zooming in to open it. */
export const fills = (box: { width: number; height: number }, width: number, height: number): boolean =>
  box.width >= width * ZOOM_OPENS || box.height >= height * ZOOM_OPENS;

/** The key of the folded group whose card is under `x`, `y` and fills the screen, if any: zooming in opens it. */
export function clusterFilling(
  space: SpaceMarks,
  matrix: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): string | undefined {
  const clusters = { ...space, blocks: space.blocks.filter((b) => isCluster(b.of)) };
  const card = cardAt(cardsOnScreen(clusters, matrix, width, height), x, y);
  return card && fills(card, width, height) ? card.block.of : undefined;
}

/** An open group's outline on the screen: its corner and size in pixels, its style and its name. */
export interface ScreenOutline {
  id: string;
  style: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The room round a group's things inside its outline, and above them for its name, in pixels. */
const OUTLINE_ROOM = 10,
  OUTLINE_NAME = 18;

/** The outlines of `space`'s open groups, as the camera's `matrix` sees their things: each round all of them. */
export function outlinesOf(space: SpaceMarks, matrix: Float32Array, width: number, height: number): ScreenOutline[] {
  if (!space.groups?.length) return [];
  const focal = height / 2 / Math.tan(FIELD / 2);
  const byKey = new Map(space.blocks.flatMap((b) => (b.of === undefined ? [] : [[b.of, b] as const])));
  return space.groups.flatMap((g) => {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const key of g.of) {
      const b = byKey.get(key),
        c = b && projectPoint(matrix, middle(b), width, height);
      if (!b || !c) continue;
      const scale = focal / c.far,
        w = ((b.card?.width ?? b.width) * scale) / 2,
        h = ((b.card?.height ?? b.depth) * scale) / 2;
      [x0, y0, x1, y1] = [Math.min(x0, c.x - w), Math.min(y0, c.y - h), Math.max(x1, c.x + w), Math.max(y1, c.y + h)];
    }
    if (x0 > x1) return [];
    const x = x0 - OUTLINE_ROOM,
      y = y0 - OUTLINE_ROOM - OUTLINE_NAME;
    return [
      { id: g.id, style: g.style, name: g.name, x, y, width: x1 - x + OUTLINE_ROOM, height: y1 - y + OUTLINE_ROOM },
    ];
  });
}

/** `labels` less each group's floating name where its outline carries it. */
const outlined = <L extends { id: string }>(labels: readonly L[], outlines: readonly ScreenOutline[]): L[] => {
  const named = new Set(outlines.map((o) => `${o.id}\ngroup`));
  return labels.filter((l) => !named.has(l.id));
};

/** Every line of `space` as the camera's `matrix` sees it, each as thick as its middle is near (space_link_shafts). */
export function shaftsOf(space: SpaceMarks, matrix: Float32Array, width: number, height: number): SpaceFrame['shafts'] {
  if (space.lines.length > SHAFTS_MOST) return [];
  const focal = height / 2 / Math.tan(FIELD / 2);
  return space.lines.flatMap((l) => {
    const points = l.points.flatMap((p) => projectPoint(matrix, p, width, height) ?? []);
    if (points.length < 2) return [];
    const far = points.reduce((t, p) => t + p.far, 0) / points.length;
    const seen = Math.min(SHAFT_MOST, Math.max(SHAFT_LEAST, (SHAFT * focal) / Math.max(far, 1e-9)));
    return [{ style: l.style, points: points.map(({ x, y }) => ({ x, y })), width: seen }];
  });
}

/** The lines of `space` that join the thing `picked`, or are the link `pickedLink`, as the camera's `matrix` sees them. */
function strongLines(
  space: SpaceMarks,
  matrix: Float32Array,
  width: number,
  height: number,
  picked?: string,
  pickedLink?: string,
): SpaceFrame['strong'] {
  if (picked === undefined && pickedLink === undefined) return [];
  return space.lines
    .filter((l) => (picked !== undefined && (l.from === picked || l.to === picked)) || l.id === pickedLink)
    .map((l) => ({
      style: l.style,
      points: l.points.flatMap((p) => projectPoint(matrix, p, width, height) ?? []),
    }));
}

/**
 * One frame of `space`, as the camera's `matrix` sees it, with `picked` and `pickedLink` marked. With cards, the graphics
 * chip paints only the lines, and the cards hold the things' names. Else it paints the blocks or balls, and the names
 * float beside them, the picked one ringed.
 */
export function frameOf(
  space: SpaceMarks,
  matrix: Float32Array,
  width: number,
  height: number,
  picked: Block | null,
  pickedLink?: string,
): SpaceFrame {
  const chosen = {
    ...(picked?.of === undefined ? {} : { picked: picked.of }),
    ...(pickedLink === undefined ? {} : { pickedLink }),
  };
  if (!space.cards) {
    // a folded group is a card here too, never a nameless ball, and so is a group's card above (cluster_planes)
    const carded = (b: Block | null | undefined) => isCluster(b?.of) || isPlane(b?.of);
    const clusters = space.blocks.filter(carded);
    if (clusters.length) {
      const into = new Set(clusters.map((b) => b.of)),
        edged = new Set(space.lines.filter((l) => into.has(l.to)).map((l) => `${l.id}\narrow`));
      // its arrowheads sit at the card's edge, drawn once
      const balls = {
        ...space,
        blocks: space.blocks.filter((b) => !carded(b)),
        arrows: space.arrows.filter((a) => !edged.has(a.id)),
      };
      const frame = frameOf(balls, matrix, width, height, carded(picked) ? null : picked, pickedLink);
      const cards = cardsOnScreen({ ...space, blocks: clusters }, matrix, width, height, picked?.of);
      return { ...frame, cards, arrows: [...frame.arrows, ...cardArrows(space, matrix, width, height, cards)] };
    }
    const ring = picked && pickedRing(space, picked, matrix, width, height);
    // each name goes on its thing; one with no face to fit on floats beside it only when picked, so it always shows
    const faces = facesOnScreen(space, matrix, width, height, chosen);
    const onFace = new Set(faces.map((f) => f.id));
    const floats = space.labels.filter(
      (l) => !onFace.has(l.id) && (l.of === undefined || l.link !== undefined || l.of === chosen.picked),
    );
    const outlines = outlinesOf(space, matrix, width, height);
    return {
      shapes: space,
      cards: [],
      faces,
      arrows: arrowsOnScreen(space, matrix, width, height),
      labels: labelsOnScreen({ ...space, labels: outlined(floats, outlines) }, matrix, width, height, chosen),
      outlines,
      ring,
      strong: strongLines(space, matrix, width, height, picked?.of, pickedLink),
      shafts: shaftsOf(space, matrix, width, height),
    };
  }
  const cards = cardsOnScreen(space, matrix, width, height, picked?.of);
  const words = { ...space, labels: space.labels.filter((l) => l.link !== undefined) };
  return {
    outlines: outlinesOf(space, matrix, width, height),
    shapes: { ...space, blocks: [], arrows: [] },
    cards,
    faces: [],
    arrows: cardArrows(space, matrix, width, height, cards),
    labels: labelsOnScreen(words, matrix, width, height, chosen),
    ring: null,
    strong: strongLines(space, matrix, width, height, picked?.of, pickedLink),
    shafts: shaftsOf(space, matrix, width, height),
  };
}
