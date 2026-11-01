// Room for things a view drew, as they are lifted into space (editor spec §53, space_room_as_drawn). A force, a chord
// or an arc keeps its places in space. But space shows each thing larger than the view drew it. A card
// grows to hold its name. A ball grows with its links. So kept at the page's own spacing, they piled on one another.
// Now the places are spread out evenly, from the drawing's middle, until most things stand clear of each other. The
// view's shape is kept: it is only larger. Host-free and pure.
import type { DrawMark } from './drawing-marks.ts';
import { isCluster } from './space-cards.ts';
import { rowsOf } from './space-faces.ts';
import type { Vec3 } from './space-view.ts';

/** The size of a card's words in space, its room inside, a letter's width and a row's height, as space-cards.ts paints. */
const WORDS = 14,
  PAD = WORDS,
  LETTER = WORDS * 0.52,
  ROW = WORDS * 1.25;
/** How much wider than its box a card may grow before its words wrap, and the fewest letters in a row. */
const WIDER = 1.5,
  ROW_LEAST = 14;
/** The room kept between two things, in space's pixels. */
const GAP = 8;
/** The share of things that must stand clear of all others. A few may still touch, so one crowded spot spreads no more. */
const CLEAR = 0.8;
/** The most the places are spread, so a view drawn as a line stays in sight. */
const MOST = 12;
/** The most things checked against each other; beyond, the first so many are, to stay quick. */
const CHECKED = 1200;

/** The width and height of the card a thing's name `text` needs, from its box `width` by `height`, as it is painted. */
export function cardRoom(text: string, width: number, height: number): [number, number] {
  const rows = text ? rowsOf(text, Math.max(ROW_LEAST, Math.floor((width * WIDER - PAD) / LETTER))) : [];
  const longest = Math.max(0, ...rows.map((r) => r.length));
  return [Math.max(width, longest * LETTER + PAD), Math.max(height, rows.length * ROW + PAD)];
}

/**
 * How much to spread the places `at` so that most things stand clear of each other, each `room` wide and high. It is
 * 1 when they already do. Two things stand clear when they are apart across, or down, by half their sizes and a gap.
 */
export function roomyScale(at: readonly [number, number][], room: readonly [number, number][]): number {
  const n = Math.min(at.length, CHECKED);
  if (n < 2) return 1;
  const needs: number[] = [];
  for (let i = 0; i < n; i++) {
    let need = 1;
    const [x, y] = at[i] as [number, number],
      [w, h] = room[i] as [number, number];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const [u, v] = at[j] as [number, number],
        [ww, hh] = room[j] as [number, number];
      const across = Math.abs(u - x),
        down = Math.abs(v - y);
      if (!across && !down) continue; // two at one spot spread no further apart, whatever the scale
      const wantX = (w + ww) / 2 + GAP,
        wantY = (h + hh) / 2 + GAP;
      if (across >= wantX || down >= wantY) continue;
      // the scale that clears them the cheaper way, across or down
      need = Math.max(need, Math.min(across ? wantX / across : Infinity, down ? wantY / down : Infinity));
    }
    needs.push(need);
  }
  needs.sort((a, b) => a - b);
  return Math.min(MOST, needs[Math.ceil(n * CLEAR) - 1] ?? 1);
}

/**
 * Spreads the things `centre` holds, across and down, from the middle of them all, so that most stand clear. A card,
 * as `cards` paints each thing and a folded group always, is as large as its name's card, from the label marks of
 * `marks`. A ball is as wide as `radius` says.
 */
export function spreadToRoom(
  centre: Map<string, Vec3>,
  boxes: readonly (DrawMark & { kind: 'box'; of: string })[],
  marks: readonly DrawMark[],
  cards: boolean,
  radius: ReadonlyMap<string, number>,
): void {
  const size = (b: DrawMark & { kind: 'box'; of: string }, name: string): [number, number] => {
    const r = 2 * (radius.get(b.of) ?? 0);
    return cards || isCluster(b.of) ? cardRoom(name, b.width, b.height) : [r, r];
  };
  const names = new Map<string, string>();
  for (const m of marks) if (m.kind === 'label' && m.of !== undefined && !names.has(m.of)) names.set(m.of, m.text);
  const kept = boxes.filter((b) => centre.has(b.of));
  const at = kept.map((b) => [centre.get(b.of)?.[0] ?? 0, centre.get(b.of)?.[1] ?? 0] as [number, number]);
  const f = roomyScale(
    at,
    kept.map((b) => size(b, names.get(b.of) ?? b.name ?? '')),
  );
  if (f <= 1) return;
  const mx = at.reduce((t, p) => t + p[0], 0) / at.length,
    my = at.reduce((t, p) => t + p[1], 0) / at.length;
  for (const [k, c] of centre) centre.set(k, [mx + (c[0] - mx) * f, my + (c[1] - my) * f, c[2]]);
}
