// The hive view (editor spec §68, projection_hive). A graph's things sit on two to five axes running out from the
// middle. The axes are the things' kinds. With one kind, they are what the links do: a thing only sends, sends and
// receives, only receives, or has no links. Along its axis, a thing with more links sits further out. Each link is a
// curve between two axes. Nothing is laid out by chance, so the same data always gives the same picture. It is drawn as
// marks (drawing-marks.ts), so every painter draws it the same way.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import type { GraphShape } from '../types-shape.ts';
import { word } from '../words.ts';

/** The most axes a hive has: past this, the smallest kinds share the last. */
const MOST_AXES = 5;
/** The share of the radius kept clear in the middle, so the axes stand apart where they start. */
const INNER_SHARE = 0.15;
/** The share of the radius kept outside the axes for their names. */
const NAMES_SHARE = 0.18;
/** Past this many things, only each axis is named, not each thing. */
const NAMED_MOST = 40;
/** How far a link between two things on one axis swings out to the side, in radians. */
const SAME_AXIS_SWING = 0.35;

/** One axis: its name and its things, from the middle outwards. */
interface Axis {
  name: string;
  keys: string[];
}

/** The axes of `shape`: by kind when it has two or more, else by what each thing's links do, each axis not empty. */
export function hiveAxes(shape: GraphShape): Axis[] {
  const degree = new Map<string, number>();
  const sends = new Set<string>(),
    receives = new Set<string>();
  for (const l of shape.links) {
    for (const k of [l.from, l.to]) degree.set(k, (degree.get(k) ?? 0) + 1);
    sends.add(l.from);
    receives.add(l.to);
  }
  const byKind = new Map<string, string[]>();
  for (const t of shape.things) {
    const kind = t.kinds.join(', ') || 'Thing';
    byKind.set(kind, [...(byKind.get(kind) ?? []), t.key]);
  }
  let axes: Axis[];
  if (byKind.size > 1) {
    const kinds = [...byKind].sort((a, b) => b[1].length - a[1].length);
    axes = kinds.slice(0, MOST_AXES - 1).map(([name, keys]) => ({ name, keys }));
    const rest = kinds.slice(MOST_AXES - 1);
    if (rest.length === 1) axes.push({ name: rest[0]?.[0] ?? '', keys: rest[0]?.[1] ?? [] });
    else if (rest.length)
      axes.push({ name: word('view.hive.other', { count: rest.length }), keys: rest.flatMap(([, ks]) => ks) });
  } else {
    const roleOf = (k: string) => (sends.has(k) ? (receives.has(k) ? 1 : 0) : receives.has(k) ? 2 : 3);
    axes = (['sends', 'both', 'receives', 'unlinked'] as const).map((role, i) => ({
      name: word(`view.hive.${role}`),
      keys: shape.things.map((t) => t.key).filter((k) => roleOf(k) === i),
    }));
    axes = axes.filter((a) => a.keys.length);
  }
  // along an axis, the most linked furthest out; as many links, in the order written
  const written = new Map(shape.things.map((t, i) => [t.key, i]));
  const rank = (a: string, b: string) =>
    (degree.get(a) ?? 0) - (degree.get(b) ?? 0) || (written.get(a) ?? 0) - (written.get(b) ?? 0);
  return axes.map((a) => ({ ...a, keys: [...a.keys].sort(rank) }));
}

/** The marks of `shape` drawn as a hive in `space`: an axis for each kind, a dot for each thing, a curve per link. */
export function hiveMarks({ shape, space }: DiagramGiven): DrawMark[] {
  const n = shape.things.length;
  if (!n) return [];
  const axes = hiveAxes(shape);
  const cx = space.width / 2,
    cy = space.height / 2,
    outer = Math.min(space.width, space.height) / 2,
    long = outer * (1 - NAMES_SHARE),
    inner = long * INNER_SHARE;
  // a lone axis points up, as the first of two would
  const turn = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / Math.max(axes.length, 2);
  const at = (th: number, r: number): [number, number] => [cx + r * Math.cos(th), cy + r * Math.sin(th)];
  const most = Math.max(...axes.map((a) => a.keys.length));
  const step = (long - inner) / Math.max(most, 1);
  const size = Math.max(Math.min(step * 0.7, outer * 0.04), 1),
    nameSize = Math.min(12, Math.max(size, 7));
  const place = new Map<string, { th: number; r: number }>();
  const marks: DrawMark[] = [];
  axes.forEach((axis, i) => {
    const th = turn(i);
    marks.push({
      kind: 'link',
      id: `spoke\n${i}`,
      style: 'group',
      points: [at(th, inner), at(th, long)],
      headless: true,
      name: axis.name,
      z: -2,
    });
    const [lx, ly] = at(th, long + nameSize);
    marks.push({
      kind: 'label',
      id: `axis\n${i}`,
      style: 'text',
      x: lx,
      y: ly + nameSize / 3,
      text: axis.name,
      size: nameSize,
      anchor: Math.abs(Math.cos(th)) < 0.2 ? 'middle' : Math.cos(th) > 0 ? 'start' : 'end',
      maxWidth: outer - long,
    });
    axis.keys.forEach((k, j) => {
      const r = inner + step * (j + 0.5);
      place.set(k, { th, r });
    });
  });
  const text = new Map(shape.things.map((t) => [t.key, t.text]));
  for (const axis of axes)
    for (const k of axis.keys) {
      const { th, r } = place.get(k) ?? { th: 0, r: 0 };
      const [x, y] = at(th, r),
        name = text.get(k) ?? k;
      marks.push({
        kind: 'box',
        id: k,
        of: k,
        style: 'thing',
        x: x - size / 2,
        y: y - size / 2,
        width: size,
        height: size,
        shape: 'ellipse',
        role: 'thing',
        name,
      });
      if (n <= NAMED_MOST)
        marks.push({
          kind: 'label',
          id: `${k}\nlabel`,
          of: k,
          style: 'text',
          x: x + size,
          y: y + nameSize / 3,
          text: name,
          size: nameSize * 0.85,
          anchor: 'start',
          maxWidth: step * 4,
        });
    }
  shape.links.forEach((l, i) => {
    const a = place.get(l.from),
      b = place.get(l.to);
    if (!a || !b || l.from === l.to) return;
    // between two axes the curve bends through the middle of the turn between them; on one axis it swings aside
    let mid = (a.th + b.th) / 2;
    if (Math.abs(b.th - a.th) > Math.PI) mid += Math.PI;
    const ca = a.th === b.th ? a.th + SAME_AXIS_SWING : mid,
      cb = a.th === b.th ? b.th + SAME_AXIS_SWING : mid;
    marks.push({
      kind: 'link',
      id: `link\n${i}`,
      style: 'link',
      points: [at(a.th, a.r), at(ca, a.r), at(cb, b.r), at(b.th, b.r)],
      curve: true,
      from: l.from,
      to: l.to,
      role: 'link',
      name: `${text.get(l.from)} ${l.type} ${text.get(l.to)}`,
      z: -1,
    });
  });
  return marks;
}
