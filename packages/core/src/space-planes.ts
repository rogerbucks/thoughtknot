// The ladder of detail as stacked planes in 2.5D and 3D (editor spec §53, cluster_planes). Roger chose it on 26 Oct
// 2026: "A + stacked 3D planes". The things stay where they were laid out, on the lower plane. Above them floats a plane
// of overview: one named card for each open group, over the middle of its things, with its count. A stalk drops from
// each card to its things, and the links between two groups run as one line between their cards, with their count.
// Host-free and pure: it adds to a space from space-spread.ts, and changes nothing there.
import type { Block, SpaceLabel, SpaceLine, SpaceMarks, Vec3 } from './space-view.ts';
import { FLOOR_GAP, middleOf } from './space-view.ts';
import { word } from './words.ts';

/** The key of a group's card on the plane of overview: `plane: ` and the group's id. */
export const isPlane = (of: string | undefined): boolean => (of ?? '').startsWith('plane: ');

/** How high the plane of overview floats over the highest thing, as a share of the drawing's wider side. */
const LIFT = 0.3;
/** The size of a card's words, and how wide a card is for each letter of them, in pixels of the space. */
const NAME = 14,
  LETTER = 8;
/** The least size of a card, in pixels of the space. */
const CARD = { width: 120, height: 48 };

/** `space` with its plane of overview above it: a card for each open group, its stalk, and the links between groups. */
export function stackedPlanes(space: SpaceMarks): SpaceMarks {
  const groups = space.groups ?? [];
  if (groups.length < 2) return space;
  const byKey = new Map(space.blocks.flatMap((b) => (b.of === undefined ? [] : [[b.of, b] as const])));
  const top = Math.max(...space.blocks.map((b) => b.floor + b.tall));
  const wide = Math.max(space.most[0] - space.least[0], space.most[1] - space.least[1]);
  const floor = top + Math.max(FLOOR_GAP, wide * LIFT);
  const groupOf = new Map<string, string>();
  const blocks: Block[] = [],
    labels: SpaceLabel[] = [],
    lines: SpaceLine[] = [];
  for (const g of groups) {
    const inside = g.of.flatMap((k) => byKey.get(k) ?? []);
    if (!inside.length) continue;
    for (const k of g.of) groupOf.set(k, g.id);
    const mid = (i: 0 | 1) => inside.reduce((t, b) => t + middleOf(b)[i], 0) / inside.length;
    const [x, y] = [mid(0), mid(1)];
    const of = `plane: ${g.id}`,
      text = `${g.name} · ${word('summary.things', { count: inside.length })}`;
    const card = { width: Math.max(CARD.width, text.length * LETTER), height: CARD.height };
    blocks.push({
      id: `p:${g.id}`,
      style: g.style,
      of,
      name: text,
      x: x - 1,
      y: y - 1,
      width: 2,
      depth: 2,
      floor,
      tall: 2,
      card,
    });
    labels.push({ id: `l:p:${g.id}`, style: g.style, at: [x, y, floor + 1], text, size: NAME, of });
    // the stalk: from the card down to the highest of its things, over their middle
    const under = Math.max(...inside.map((b) => b.floor + b.tall));
    lines.push({
      id: `${of}\nstalk`,
      style: g.style,
      points: [
        [x, y, floor],
        [x, y, under],
      ],
    });
  }
  // the links between two groups, counted, as one line between their cards
  const between = new Map<string, number>();
  for (const l of space.lines) {
    const a = l.from === undefined ? undefined : groupOf.get(l.from),
      b = l.to === undefined ? undefined : groupOf.get(l.to);
    if (a && b && a !== b) between.set(`${a}\n${b}`, (between.get(`${a}\n${b}`) ?? 0) + 1);
  }
  const cardOf = new Map(blocks.map((b) => [b.of ?? '', middleOf(b)]));
  for (const [pair, count] of between) {
    const [a, b] = pair.split('\n') as [string, string];
    const from = cardOf.get(`plane: ${a}`),
      to = cardOf.get(`plane: ${b}`);
    if (!from || !to) continue;
    lines.push({
      id: `plane: ${pair}`,
      style: 'link',
      points: [from, to] as Vec3[],
      from: `plane: ${a}`,
      to: `plane: ${b}`,
      words: word('summary.links', { count }),
    });
  }
  return {
    ...space,
    blocks: [...space.blocks, ...blocks],
    labels: [...space.labels, ...labels],
    lines: [...space.lines, ...lines],
    most: [space.most[0], space.most[1], Math.max(space.most[2], floor + CARD.height)],
  };
}
