// Direct links (editor spec §25, untangle_direct). Roger, 24 Oct 2026: "With the 2d lines... they route all over the
// place. Make them curve directly but move the nodes around to make the connections more optimised."
//
// Graphviz places the boxes, ordering each row to cut crossings. Then, in place of its routing, each link here is one
// gentle curve from box to box. Where a link would pass through a box it does not join, that box moves aside, just
// clear of it. Boxes moved into each other are pushed apart again. A few rounds of this settle, within a budget, so a
// big graph stays quick. Two links between the same two boxes bow apart, so both show. A link's arrowhead lands on the
// box it points to, and its words sit at its middle. First the boxes are given a little more room, and each link takes the
// slight bend that crosses fewest boxes and links (direct-bends.ts).
//
// It works on the marks Graphviz's layout gives (graphviz-marks.ts). The SVG is written from them (graphviz-svg.ts), so
// every part keeps its id, class and title. Host-free and pure.
import type { DrawMark } from './drawing-marks.ts';
import type { LaidMarks } from './graphviz-marks.ts';
import type { MarkPoint } from './plugin-diagrams.ts';
import { WORDS_OFF, fans, wordSpots } from './direct-words.ts';
import { curveOf } from './direct-curve.ts';
import type { Curve, Placed } from './direct-curve.ts';
import { routedCurve } from './layouts/routed-curve.ts';
import { CLEARANCE, HUG, bends, crowded, hug, hugged, spread, towardMiddle, trunkEnds } from './direct-bends.ts';
import type { Edges, ToBend } from './direct-bends.ts';
export type { Curve, Placed } from './direct-curve.ts';
export { CLEARANCE, GENTLE } from './direct-bends.ts';

/** The room kept round a line or words at the edge of the drawing, in pixels. */
const EDGE = 2;
/** The room kept between two boxes pushed apart, in pixels. */
const BOX_GAP = 12;
/** The most rounds of moving boxes off links and apart again. */
const ROUNDS = 6;
/** The most box and link pairs looked at in all, so a big graph stays quick. */
const WORK_MOST = 4_000_000;
/** How far two links between the same boxes bow apart at their middle, as a share of their length. */
const BOW = 0.16;

/**
 * `laid` with its links drawn directly and its boxes moved off them. A self link keeps its loop, moved with its box.
 * Given `at`, each box is first moved to its spot there, as our own engine placed it (layouts/own-engine.ts).
 */
export function directLinks(
  laid: LaidMarks,
  at?: ReadonlyMap<string, readonly [number, number]>,
  via?: ReadonlyMap<string, readonly MarkPoint[]>,
  rankdir: 'LR' | 'TB' = 'LR',
): LaidMarks {
  const boxes = new Map<string, Placed>();
  const groups = new Map<string, Edges>();
  for (const m of laid.marks)
    if (m.kind === 'group') groups.set(m.id, { x0: m.x, y0: m.y, x1: m.x + m.width, y1: m.y + m.height });
  for (const m of laid.marks)
    if (m.kind === 'box' && m.role === 'thing' && m.of !== undefined && !boxes.has(m.of)) {
      const p: Placed = { key: m.of, x: m.x + m.width / 2, y: m.y + m.height / 2, hw: m.width / 2, hh: m.height / 2 };
      // its group as marked, else the smallest one round it, as Graphviz drew it: it stays inside, so the group still holds it
      const g = m.group === undefined ? groupRound(groups, m) : groups.get(m.group);
      if (g) p.inside = g;
      boxes.set(m.of, p);
    }
  const links = laid.marks.filter(
    (m): m is DrawMark & { kind: 'link' } =>
      m.kind === 'link' && m.from !== undefined && m.to !== undefined && boxes.has(m.from) && boxes.has(m.to),
  );
  const start = new Map([...boxes].map(([k, b]) => [k, [b.x, b.y] as const]));
  // a little more room, where a link drawn straight would run through a box or cross another
  const ends = links.flatMap((l) =>
    l.from === l.to ? [] : [[boxes.get(l.from ?? ''), boxes.get(l.to ?? '')] as [Placed, Placed]],
  );
  for (const [k, b] of at ?? []) {
    const p = boxes.get(k);
    if (!p) continue;
    [p.x, p.y] = b;
    // the group our engine placed it in holds it, not the one round its stand-in spot, so no box is drawn inside out
    const round = groupRound(groups, { x: p.x - p.hw, y: p.y - p.hh, width: 2 * p.hw, height: 2 * p.hh });
    if (round) p.inside = round;
    else delete p.inside;
  }
  const groupMoved =
    !at && crowded(ends, [...boxes.values()])
      ? spread([...boxes.values()], groups, middleOf([...boxes.values()]))
      : new Map<string, MarkPoint>();
  // boxes our own engine placed stay where it put them, its links bent round boxes; only overlaps are pushed apart
  if (!at) settle([...boxes.values()], links);
  else for (let r = 0; r < ROUNDS * 4 && apart([...boxes.values()]); r++);
  // each group drawn just round its things, its name above them. Then each bundle runs from beside the group its links
  // leave to beside the group they reach
  const drawnAs = new Map<string, Edges>(),
    heads = new Map<string, [number, number]>();
  for (const m of laid.marks) {
    if (m.kind === 'group') drawnAs.set(m.id, { x0: m.x, y0: m.y, x1: m.x + m.width, y1: m.y + m.height });
    const owner = m.kind === 'label' ? /^l:(.*)$/s.exec(m.id)?.[1] : undefined;
    const was = owner === undefined ? undefined : drawnAs.get(owner);
    if (m.kind === 'label' && owner !== undefined && was)
      heads.set(owner, [m.y - was.y0 + HUG, (m.maxWidth ?? 0) + 2 * HUG]);
  }
  hug(boxes.values(), groups, heads);
  // our own engine placed each trunk's ends in its rows and routed their links round boxes: kept where it put them
  if (!at) trunkEnds(boxes, links);

  // every mark of a moved box's part goes with it: its outline, its words, its pictures
  const moved = new Map<string, [number, number]>();
  for (const [k, b] of boxes) {
    const [x0, y0] = start.get(k) ?? [b.x, b.y];
    if (b.x !== x0 || b.y !== y0) moved.set(k, [b.x - x0, b.y - y0]);
  }
  const shiftOf = new Map<string, [number, number]>();
  for (const part of laid.layout?.parts ?? [])
    if (part.kind === 'node') {
      const by = moved.get(part.title);
      if (by) for (const id of part.marks) shiftOf.set(id, by);
    }
  for (const m of laid.marks) {
    const by = shiftOf.get(m.id) ?? (laid.layout ? undefined : m.of === undefined ? undefined : moved.get(m.of));
    if (by && m.kind !== 'link') shiftOf.set(m.id, by);
  }
  // a group moved whole takes its outline and its words
  const clusters =
    laid.layout?.parts.filter((p) => p.kind === 'cluster') ?? [...groups.keys()].map((id) => ({ marks: [id] }));
  for (const part of clusters) {
    const by = part.marks.map((id) => groupMoved.get(id)).find(Boolean);
    if (by && (by[0] || by[1])) for (const id of part.marks) shiftOf.set(id, by);
  }
  // a self link's loop, its arrowheads and its words go with its box
  for (const l of links) {
    const by = l.from === l.to ? moved.get(l.from ?? '') : undefined;
    if (by)
      for (const m of laid.marks) if (m.id === l.id || (l.of !== undefined && m.of === l.of)) shiftOf.set(m.id, by);
  }

  // links between the same two boxes, either way round: how many, and each one's place among them
  const pairOf = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);
  const many = new Map<string, number>(),
    nth = new Map<string, number>();
  for (const l of links)
    if (l.from !== l.to)
      many.set(pairOf(l.from ?? '', l.to ?? ''), (many.get(pairOf(l.from ?? '', l.to ?? '')) ?? 0) + 1);
  const all = [...boxes.values()];
  const middle = middleOf(all);
  // each lone link takes the bend that crosses least; links between the same two boxes bow apart, as they must. A
  // bundle goes round the groups as round boxes
  const walls: Placed[] = [...groups].map(([key, g]) => {
    const hw = (g.x1 - g.x0) / 2,
      hh = (g.y1 - g.y0) / 2;
    return { key, x: g.x0 + hw, y: g.y0 + hh, hw, hh };
  });
  const toBend: (ToBend & { id: string })[] = [];
  for (const l of links) {
    const a = boxes.get(l.from ?? '') as Placed,
      b = boxes.get(l.to ?? '') as Placed;
    if (a === b) continue;
    const pair = pairOf(a.key, b.key),
      i = nth.get(pair) ?? 0,
      count = many.get(pair) ?? 1;
    nth.set(pair, i + 1);
    const side = a.key < b.key ? 1 : -1;
    // with our own engine, a trunk's links run as one into it and out of it, as its one line does
    const merged = at !== undefined && (a.key.startsWith('trunk: ') || b.key.startsWith('trunk: '));
    const fixed = count > 1 ? { fixed: merged ? 0 : (i - (count - 1) / 2) * BOW * side } : {};
    const trunk = a.key.startsWith('trunk: ') && b.key.startsWith('trunk: ') ? { avoid: walls } : {};
    toBend.push({ id: l.of ?? l.id, a, b, toward: towardMiddle(a, b, side, middle), ...fixed, ...trunk });
  }
  const bows = bends(toBend, all);
  // a link our own engine routed bends through its lanes (layouts/routed-curve.ts). Links between the same two boxes
  // take the same bends, moved apart across the drawing's way
  const across = rankdir === 'TB' ? 0 : 1;
  const routed = (l: ToBend) =>
    via
      ?.get(`${l.a.key}\n${l.b.key}`)
      ?.map((p): MarkPoint => (across ? [p[0], p[1] + (l.fixed ?? 0)] : [p[0] + (l.fixed ?? 0), p[1]]));
  const curves = new Map<string, Curve>(
    toBend.map((l, i) => {
      const bendsAt = routed(l);
      return [
        l.id,
        bendsAt?.length
          ? routedCurve(l.a, l.b, bendsAt, rankdir === 'TB' ? 1 : 0)
          : curveOf(l.a, l.b, bows[i] as number),
      ];
    }),
  );
  // our own engine labels each fan of links once, near the end its links share
  const fan = at ? fans(laid.marks) : undefined;
  const spots = wordSpots(laid.marks, boxes, curves, fan);
  // each link's arrowheads, and the first line drawn for it, found by what it is of: looked up once, not per mark
  const headsBy = new Map<string, (DrawMark & { kind: 'arrowhead' })[]>(),
    lineBy = new Map<string, DrawMark & { kind: 'link' }>();
  for (const m of laid.marks)
    if (m.kind === 'arrowhead' && m.of !== undefined) headsBy.set(m.of, [...(headsBy.get(m.of) ?? []), m]);
    else if (m.kind === 'link' && m.of !== undefined && !lineBy.has(m.of)) lineBy.set(m.of, m);

  const marks = laid.marks.flatMap((m): DrawMark[] => (fan?.gone.has(m.id) ? [] : [drawnNow(m)]));
  return grown({ ...laid, marks });

  /** `m` where it is drawn now: a link along its curve, its words beside it, and the rest moved with its box. */
  function drawnNow(m: DrawMark): DrawMark {
    const by = shiftOf.get(m.id);
    const c = m.of === undefined ? undefined : curves.get(m.of);
    if (m.kind === 'link' && c) {
      // the line stops where an arrowhead begins, at either end that has one
      const heads = headsOf(m.of === undefined ? [] : (headsBy.get(m.of) ?? []), m);
      const points = c.cubic(heads.start, heads.end);
      const { outline: _gone, ...rest } = m;
      return { ...rest, points, curve: true };
    }
    if (m.kind === 'arrowhead' && c) {
      // which end it is at, as Graphviz drew it: the boxes have moved since
      const line = m.of === undefined ? undefined : lineBy.get(m.of);
      const atStart = line ? atFirstEnd(line, m) : m.id.startsWith('tail:');
      const [tip, angle] = c.tipAt(atStart);
      const { outline: _gone, ...rest } = m;
      return { ...rest, x: tip[0], y: tip[1], angle };
    }
    if (m.kind === 'label' && c && !boxes.has(m.of ?? '')) {
      const [x, y] = spots.get(m.id) ?? c.wordsAt(0.5, m.size * WORDS_OFF);
      return { ...m, x, y };
    }
    // a group's outline and its name, where it hugs its things now; its corners keep their curve
    const owner = m.kind === 'group' ? m.id : m.kind === 'label' ? /^l\d*:(.*)$/s.exec(m.id)?.[1] : undefined;
    const was = owner === undefined ? undefined : drawnAs.get(owner),
      now = owner === undefined ? undefined : groups.get(owner);
    if (was && now) return hugged(m, was, now);
    if (!by) return m;
    return shifted(m, by[0], by[1]);
  }
}

/** The smallest group of `groups` round the box `m`, if any. */
function groupRound(groups: ReadonlyMap<string, Edges>, m: { x: number; y: number; width: number; height: number }) {
  let best: Edges | undefined;
  for (const g of groups.values())
    if (g.x0 <= m.x && g.y0 <= m.y && m.x + m.width <= g.x1 && m.y + m.height <= g.y1)
      if (!best || (g.x1 - g.x0) * (g.y1 - g.y0) < (best.x1 - best.x0) * (best.y1 - best.y0)) best = g;
  return best;
}

/** The middle of `boxes`: the mean of their middles. */
const middleOf = (boxes: readonly Placed[]): MarkPoint => [
  boxes.reduce((n, b) => n + b.x, 0) / Math.max(1, boxes.length),
  boxes.reduce((n, b) => n + b.y, 0) / Math.max(1, boxes.length),
];

/** Moves boxes off links they do not join and apart from each other, a few rounds, within the budget. */
function settle(boxes: Placed[], links: readonly (DrawMark & { kind: 'link' })[]): void {
  const byKey = new Map(boxes.map((b) => [b.key, b]));
  const rounds = Math.max(1, Math.min(ROUNDS, Math.floor(WORK_MOST / Math.max(1, boxes.length * links.length))));
  for (let r = 0; r < rounds; r++) {
    let moves = 0;
    for (const l of links) {
      const a = byKey.get(l.from ?? ''),
        b = byKey.get(l.to ?? '');
      if (!a || !b || a === b) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        long = Math.hypot(dx, dy);
      if (long < 1e-6) continue;
      const nx = -dy / long,
        ny = dx / long;
      for (const c of boxes) {
        if (c === a || c === b) continue;
        // how far along the link the box's middle is, and how far to one side
        const t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / (long * long);
        if (t <= 0 || t >= 1) continue;
        const off = (c.x - a.x) * nx + (c.y - a.y) * ny;
        // the box's reach across the link: its half size seen square to the link, and the room it keeps
        const reach = Math.abs(nx) * c.hw + Math.abs(ny) * c.hh + CLEARANCE;
        if (Math.abs(off) >= reach) continue;
        const push = (off >= 0 ? 1 : -1) * (reach - Math.abs(off));
        moveTo(c, c.x + nx * push, c.y + ny * push);
        moves++;
      }
    }
    moves += apart(boxes);
    if (!moves) break;
  }
}

/** Pushes apart boxes that overlap, along the way that parts them least, and says how many moved. */
function apart(boxes: Placed[]): number {
  let moves = 0;
  const sorted = [...boxes].sort((p, q) => p.x - p.hw - (q.x - q.hw));
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i] as Placed;
    for (let j = i + 1; j < sorted.length; j++) {
      const q = sorted[j] as Placed;
      if (q.x - q.hw >= p.x + p.hw + BOX_GAP) break;
      const ox = p.hw + q.hw + BOX_GAP - Math.abs(q.x - p.x),
        oy = p.hh + q.hh + BOX_GAP - Math.abs(q.y - p.y);
      if (ox <= 0 || oy <= 0) continue;
      // each moves half the overlap, along the way that is shorter
      if (oy <= ox) {
        const s = (q.y >= p.y ? 1 : -1) * (oy / 2);
        moveTo(p, p.x, p.y - s);
        moveTo(q, q.x, q.y + s);
      } else {
        const s = (q.x >= p.x ? 1 : -1) * (ox / 2);
        moveTo(p, p.x - s, p.y);
        moveTo(q, q.x + s, q.y);
      }
      moves++;
    }
  }
  return moves;
}

/** Puts box `b`'s middle at (`x`, `y`), kept inside its group. */
function moveTo(b: Placed, x: number, y: number): void {
  const g = b.inside;
  b.x = g ? Math.min(Math.max(x, g.x0 + b.hw), g.x1 - b.hw) : x;
  b.y = g ? Math.min(Math.max(y, g.y0 + b.hh), g.y1 - b.hh) : y;
}

/** How long the arrowheads `heads` of `link` are, at its first and last ends: none at an end, 0. */
function headsOf(
  heads: readonly (DrawMark & { kind: 'arrowhead' })[],
  link: DrawMark & { kind: 'link' },
): { start: number; end: number } {
  const out = { start: 0, end: 0 };
  for (const h of heads) out[atFirstEnd(link, h) ? 'start' : 'end'] = h.size;
  return out;
}

/** Whether arrowhead `h` is at the first end of `link`, as Graphviz drew them. */
function atFirstEnd(link: DrawMark & { kind: 'link' }, h: DrawMark & { kind: 'arrowhead' }): boolean {
  const first = link.points[0],
    last = link.points[link.points.length - 1];
  const gap = (p: MarkPoint | undefined) => (p ? Math.hypot(p[0] - h.x, p[1] - h.y) : Infinity);
  return h.id.startsWith('tail:') || gap(first) < gap(last);
}

/** `m` moved by (`dx`, `dy`), its outline too. */
function shifted(m: DrawMark, dx: number, dy: number): DrawMark {
  const move = (ps: readonly MarkPoint[]) => ps.map(([x, y]): MarkPoint => [x + dx, y + dy]);
  if (m.kind === 'link') return { ...m, points: move(m.points) };
  const out = { ...m, x: m.x + dx, y: m.y + dy } as DrawMark;
  if ('outline' in m && m.outline && 'outline' in out) out.outline = { ...m.outline, points: move(m.outline.points) };
  return out;
}

/** `laid` with its space grown to hold every mark, should a box have moved past its edge. */
function grown(laid: LaidMarks): LaidMarks {
  let x0 = 0,
    y0 = 0,
    x1 = laid.space.width,
    y1 = laid.space.height;
  const take = (ax: number, ay: number, bx: number, by: number) => {
    x0 = Math.min(x0, ax);
    y0 = Math.min(y0, ay);
    x1 = Math.max(x1, bx);
    y1 = Math.max(y1, by);
  };
  // every part, so a curve bowed past the edge is never cut off (Roger, 24 Oct 2026). A curve lies inside its points
  for (const m of laid.marks) {
    if (m.id === 'background') continue;
    if (m.kind === 'box' || m.kind === 'group') take(m.x, m.y, m.x + m.width, m.y + m.height);
    else if (m.kind === 'link') for (const [x, y] of m.points) take(x - EDGE, y - EDGE, x + EDGE, y + EDGE);
    else if (m.kind === 'arrowhead') take(m.x - m.size, m.y - m.size, m.x + m.size, m.y + m.size);
    else if (m.kind === 'label') {
      const wide = m.maxWidth ?? m.text.length * m.size * 0.5;
      const left = m.anchor === 'start' ? m.x : m.anchor === 'end' ? m.x - wide : m.x - wide / 2;
      take(left - EDGE, m.y - m.size, left + wide + EDGE, m.y + m.size * 0.3);
    }
  }
  if (x0 >= 0 && y0 >= 0 && x1 <= laid.space.width && y1 <= laid.space.height) return laid;
  const dx = -x0,
    dy = -y0;
  const space = { width: x1 - x0, height: y1 - y0 };
  const marks = laid.marks.map((m) => {
    if (m.id !== 'background') return shifted(m, dx, dy);
    const { outline: _gone, ...rest } = m as DrawMark & { kind: 'box' };
    return { ...rest, x: 0, y: 0, width: space.width, height: space.height };
  });
  return { ...laid, space, marks };
}
