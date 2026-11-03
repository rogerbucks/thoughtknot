// The pole view (editor spec §58, intent_pole_view). Each intent is a fixed point, a pole, round a circle. A thing sits
// near the intents it supports and away from those it contradicts. A thing pulled two ways sits between, where the
// tension is. Things with no link to any intent sit in a band of their own along the bottom. With two intents the poles
// face each other, left and right, so the view reads as one axis.
// It reads only the written SUPPORTS and CONTRADICTS links of the graph's shape. Nothing is laid out by chance, so the
// same data always gives the same picture. It is drawn as marks (drawing-marks.ts), so every painter draws it the same.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import type { GraphShape } from '../types-shape.ts';
import { word } from '../words.ts';
import { nameSize as nameOf, captionSize } from './type-scale.ts';

/** The share of the space's height kept along the bottom for the band of things not linked. */
const BAND_SHARE = 0.16;
/** How far towards a pole a thing that only supports it sits, as a share of the poles' radius. */
const PULL = 0.72;
/** Past this many things, only the poles and the band are named, not each thing. */
const NAMED_MOST = 40;

/** Where a pole view puts each thing, and which are poles or in the band. */
export interface PolePlaces {
  /** Each thing's centre, by its key. */
  at: Map<string, [number, number]>;
  poles: string[];
  /** The things with no link to any intent, in the order written. */
  band: string[];
  centre: [number, number];
  radius: number;
  /** The top of the band of things not linked. */
  bandTop: number;
  /** The size of a thing's dot. */
  size: number;
}

/** How one thing or group pulls on one pole: how many of its links support it, and how many contradict it. */
export interface Pull {
  for: number;
  against: number;
}

/** How each thing pulls on each pole, from the shape's written SUPPORTS and CONTRADICTS links. */
function pullsOf(shape: GraphShape, poles: ReadonlySet<string>): Map<string, Map<string, Pull>> {
  const pulls = new Map<string, Map<string, Pull>>();
  for (const l of shape.links) {
    const side = l.type === 'SUPPORTS' ? 'for' : l.type === 'CONTRADICTS' ? 'against' : null;
    if (!side || !poles.has(l.to) || poles.has(l.from)) continue;
    const of = pulls.get(l.from) ?? new Map<string, Pull>();
    const pull = of.get(l.to) ?? { for: 0, against: 0 };
    pull[side] += 1;
    of.set(l.to, pull);
    pulls.set(l.from, of);
  }
  return pulls;
}

/**
 * Where each of `keys` sits round `poles` in a space of `width` by `height`, by its pulls. A place is the centre moved
 * towards each pole by what supports it less what contradicts it, over all its links to poles. A thing that only
 * supports one pole sits near it. One pulled both ways sits between, and one with no pull sits in the band. Things at
 * the same place are spread round it, so none hides another. Groups are placed by the same rule (pole-groups.ts).
 */
export function pullPlaces(
  poles: readonly string[],
  keys: readonly string[],
  pulls: ReadonlyMap<string, ReadonlyMap<string, Pull>>,
  width: number,
  height: number,
): PolePlaces {
  const bandTop = height * (1 - BAND_SHARE);
  const centre: [number, number] = [width / 2, bandTop / 2];
  const radius = Math.min(width, bandTop) * 0.4;
  const n = keys.length + poles.length;
  const size = Math.max(Math.min(radius * 0.08, (width / Math.max(n, 1)) * 0.8), 2);
  const at = new Map<string, [number, number]>();
  // two poles face each other on one axis; one sits at the top; more go round from the top
  const turn = (i: number) =>
    poles.length === 2 ? Math.PI * (i + 1) : -Math.PI / 2 + (2 * Math.PI * i) / poles.length;
  poles.forEach((p, i) => at.set(p, [centre[0] + radius * Math.cos(turn(i)), centre[1] + radius * Math.sin(turn(i))]));
  const band: string[] = [];
  const taken = new Map<string, number>();
  for (const key of keys) {
    if (at.has(key)) continue;
    let dx = 0,
      dy = 0,
      weight = 0;
    for (const [pole, pull] of pulls.get(key) ?? []) {
      const [px, py] = at.get(pole) ?? centre;
      dx += (pull.for - pull.against) * (px - centre[0]);
      dy += (pull.for - pull.against) * (py - centre[1]);
      weight += pull.for + pull.against;
    }
    if (!weight) {
      band.push(key);
      continue;
    }
    let x = centre[0] + (PULL * dx) / weight,
      y = centre[1] + (PULL * dy) / weight;
    // things at one place are spread round it, in the order given
    const spot = `${Math.round(x)},${Math.round(y)}`;
    const k = taken.get(spot) ?? 0;
    taken.set(spot, k + 1);
    if (k) {
      const ring = size * 1.6 * Math.ceil(k / 6);
      x += ring * Math.cos((k * Math.PI) / 3);
      y += ring * Math.sin((k * Math.PI) / 3);
    }
    at.set(key, [x, y]);
  }
  const gap = width / (band.length + 1);
  band.forEach((k, i) => at.set(k, [gap * (i + 1), bandTop + (height - bandTop) / 2]));
  return { at, poles: [...poles], band, centre, radius, bandTop, size };
}

/** Where each thing of `shape` sits in a pole view of `width` by `height`: each intent a pole, the rest by their pulls. */
export function polePlaces(shape: GraphShape, width: number, height: number): PolePlaces {
  const poles = shape.things.filter((t) => t.kinds.includes('Intent')).map((t) => t.key);
  const keys = shape.things.map((t) => t.key);
  return pullPlaces(poles, keys, pullsOf(shape, new Set(poles)), width, height);
}

/** The marks of `shape` drawn as poles in `space`: a pole per intent, a dot per thing, a line per link, and the band. */
export function poleMarks({ shape, space }: DiagramGiven): DrawMark[] {
  if (!shape.things.length) return [];
  const p = polePlaces(shape, space.width, space.height);
  const nameSize = nameOf(p.size * 1.5);
  const text = new Map(shape.things.map((t) => [t.key, t.text]));
  const poles = new Set(p.poles);
  const marks: DrawMark[] = [
    {
      kind: 'group',
      id: 'band',
      style: 'group',
      x: 0,
      y: p.bandTop,
      width: space.width,
      height: space.height - p.bandTop,
      role: 'group',
      name: word('view.pole.band'),
      z: -3,
    },
    {
      kind: 'label',
      id: 'band-label',
      style: 'text',
      x: nameSize / 2,
      y: p.bandTop + nameSize,
      text: word('view.pole.band'),
      size: captionSize(nameSize),
      anchor: 'start',
    },
  ];
  for (const t of shape.things) {
    const [x, y] = p.at.get(t.key) ?? p.centre;
    const pole = poles.has(t.key),
      size = pole ? p.size * 2.4 : p.size;
    marks.push({
      kind: 'box',
      id: t.key,
      of: t.key,
      style: 'thing',
      x: x - size / 2,
      y: y - size / 2,
      width: size,
      height: size,
      shape: pole ? 'diamond' : 'ellipse',
      role: 'thing',
      name: pole ? word('view.pole.pole', { name: t.text }) : t.text,
    });
    if (pole || shape.things.length <= NAMED_MOST)
      marks.push({
        kind: 'label',
        id: `${t.key}\nlabel`,
        of: t.key,
        style: 'text',
        x,
        y: y + size / 2 + nameSize,
        text: t.text,
        size: pole ? nameSize : captionSize(nameSize),
        anchor: 'middle',
        maxWidth: p.radius,
      });
  }
  shape.links.forEach((l, i) => {
    const a = p.at.get(l.from),
      b = p.at.get(l.to);
    if (!a || !b || l.from === l.to) return;
    marks.push({
      kind: 'link',
      id: `link\n${i}`,
      style: 'link',
      points: [a, b],
      from: l.from,
      to: l.to,
      role: 'link',
      name: `${text.get(l.from)} ${l.type} ${text.get(l.to)}`,
      z: -1,
    });
  });
  return marks;
}
