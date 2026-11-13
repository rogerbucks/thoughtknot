// Cards kept inside their groups' clouds: part of the card view (render-cards.ts; ES§73, render_cards). With Cards on,
// cards are moved apart so none covers another. Moved freely, a card could leave its group's cloud, or stand in
// another's. So the cards are parted one room at a time, from the innermost rooms out:
// - the cards in one room are moved apart from one another only;
// - the room then fits round its cards, keeping its middle;
// - the rooms in one room, or at the top, are moved apart whole, with all they hold.
// No room then covers another, so every card lies inside its own group's clouds and no other. Host-free and pure.
import type { Spot } from './render-rooms.ts';
import type { Scene } from './render-scene.ts';

/** A card where it is drawn: its key, its middle and its size. */
interface Box {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The room kept between two cards, or two rooms, in pixels. */
export const ROOM_GAP = 28;
/** The room kept inside a cloud's edge, round the cards it holds: its edge fades, so the cards stay in its solid part. */
export const ROOM_PAD = 28;
/** How many rounds of moving apart, in each room. */
const ROUNDS = 120;
/** How many pairs the rounds in one room may weigh in all, at most. */
const WORK = 4_000_000;

const byKey = (a: { key: string }, b: { key: string }) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** How many rounds `n` things in one room get: fewer for many, so pressing Cards never holds the page for long. */
const roundsFor = (n: number) => Math.max(1, Math.min(ROUNDS, Math.floor(WORK / (n * n || 1))));

/**
 * Moves the cards `p` apart, in place, so that none covers another. Any two still covering one another are pushed
 * apart the shorter way, each half the overlap. Two in one place part down, the first above. The same cards always end
 * in the same places, whatever order they come in.
 */
export function partCards(p: Box[]): void {
  p.sort(byKey);
  for (let round = 0, n = roundsFor(p.length); round < n; round++) {
    let moved = false;
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++) {
        const a = p[i] as Box,
          b = p[j] as Box;
        const ox = (a.w + b.w) / 2 + ROOM_GAP - Math.abs(a.x - b.x),
          oy = (a.h + b.h) / 2 + ROOM_GAP - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (oy <= ox) {
          const s = (a.y <= b.y ? -1 : 1) * (oy / 2 + 0.01);
          [a.y, b.y] = [a.y + s, b.y - s];
        } else {
          const s = (a.x <= b.x ? -1 : 1) * (ox / 2 + 0.01);
          [a.x, b.x] = [a.x + s, b.x - s];
        }
      }
    if (!moved) break;
  }
}

/** A thing in a room, to be moved apart from the rest: a round room, or a card taken as the round that holds it. */
interface Body {
  key: string;
  x: number;
  y: number;
  r: number;
  /** Moves it, and all it holds, by `dx` across and `dy` down. */
  move: (dx: number, dy: number) => void;
}

/** Moves the rounds `p` apart, each half the overlap, along the line between their middles; one place parts down. */
function partRounds(p: Body[]): void {
  p.sort(byKey);
  for (let round = 0, n = roundsFor(p.length); round < n; round++) {
    let moved = false;
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++) {
        const a = p[i] as Body,
          b = p[j] as Body;
        const [dx, dy] = [b.x - a.x, b.y - a.y];
        const d = Math.hypot(dx, dy),
          over = a.r + b.r + ROOM_GAP - d;
        if (over <= 0) continue;
        moved = true;
        const [ux, uy] = d ? [dx / d, dy / d] : [0, 1];
        const s = over / 2 + 0.01;
        a.move(-ux * s, -uy * s);
        b.move(ux * s, uy * s);
      }
    if (!moved) break;
  }
}

/**
 * Keeps each of the cards `boxes` inside its group's rooms in `scene`, and no room over another. It moves the cards and
 * the rooms' places in `spots`, in place, and grows each room round what it holds. A drawing with no groups has its
 * cards moved apart only. The same scene and places always give the same result.
 */
export function keepInRooms(scene: Scene, spots: Map<string, Spot>, boxes: Box[]): void {
  const card = new Map(boxes.map((b) => [b.key, b]));
  const rooms = [...scene.nodes.values()].filter((n) => n.children.length && spots.has(n.key));
  if (!rooms.length) return partCards(boxes);
  /** Moves room `key`, every room inside it, and every card it holds. */
  const moveRoom = (key: string, dx: number, dy: number): void => {
    const s = spots.get(key);
    if (s) spots.set(key, { ...s, x: s.x + dx, y: s.y + dy });
    for (const c of scene.nodes.get(key)?.children ?? []) {
      const b = card.get(c);
      if (b) [b.x, b.y] = [b.x + dx, b.y + dy];
      else moveRoom(c, dx, dy);
    }
  };
  /** The things in a room, or at the top, as rounds, moved apart. */
  const part = (keys: readonly string[]): void => {
    const cards = keys.flatMap((k) => (card.has(k) ? [card.get(k) as Box] : []));
    const inner = keys.filter((k) => !card.has(k) && spots.has(k));
    // a room of cards only parts them as cards, close; mixed with rooms, each card is the round that holds it
    if (!inner.length) return partCards(cards);
    const bodies: Body[] = [
      ...cards.map((b): Body => {
        const body: Body = {
          key: b.key,
          x: b.x,
          y: b.y,
          r: Math.hypot(b.w, b.h) / 2,
          move: (dx, dy) => void ([body.x, body.y, b.x, b.y] = [body.x + dx, body.y + dy, b.x + dx, b.y + dy]),
        };
        return body;
      }),
      ...inner.map((k): Body => {
        const s = spots.get(k) as Spot;
        const body: Body = {
          key: k,
          x: s.x,
          y: s.y,
          r: s.r,
          move: (dx, dy) => {
            [body.x, body.y] = [body.x + dx, body.y + dy];
            moveRoom(k, dx, dy);
          },
        };
        return body;
      }),
    ];
    partRounds(bodies);
  };
  // the innermost rooms first, so each room grows round rooms already final
  rooms.sort((a, b) => b.depth - a.depth || byKey(a, b));
  for (const room of rooms) {
    part(room.children);
    const s = spots.get(room.key) as Spot;
    let r = 0;
    for (const c of room.children) {
      const b = card.get(c),
        inner = spots.get(c);
      if (b)
        for (const [cx, cy] of [
          [b.x - b.w / 2, b.y - b.h / 2],
          [b.x + b.w / 2, b.y + b.h / 2],
          [b.x - b.w / 2, b.y + b.h / 2],
          [b.x + b.w / 2, b.y - b.h / 2],
        ] as const)
          r = Math.max(r, Math.hypot(cx - s.x, cy - s.y) + ROOM_PAD);
      else if (inner) r = Math.max(r, Math.hypot(inner.x - s.x, inner.y - s.y) + inner.r + ROOM_PAD);
    }
    spots.set(room.key, { ...s, r });
  }
  part(scene.roots);
}
