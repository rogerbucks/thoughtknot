// How a connector of a board runs from one item to the other (editor spec ES§45, board_routes). A connector runs
// straight while nothing is in its way. With an item in its way it bows round it, by the curve router's own rule
// (direct-bends.ts). It may also be told to run straight, as an elbow from side to side, or curved. Pure and host-free.
import { ROUTES, TIPS, type Board, type Connector, type Route, type Tips } from './board.ts';
import { GENTLE, aside } from './direct-bends.ts';
import { curveOf, type Placed } from './direct-curve.ts';

/** A box on the board: its corner and its size. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Spot = [number, number];

/** A connector as it is drawn: a straight line by its two ends, or a path, and the spot its label sits at. */
export interface Run {
  line?: [Spot, Spot];
  path?: string;
  mid: Spot;
}

/** What a change sets on a connector: its route, where null is the board's own choice, and its arrowheads. */
export interface RouteSet {
  route?: Route | null;
  tips?: Tips;
}

const num = (v: number) => String(Math.round(v * 100) / 100);
const placed = (b: Box, key: string): Placed => ({ key, x: b.x + b.w / 2, y: b.y + b.h / 2, hw: b.w / 2, hh: b.h / 2 });

/** Where the line from a box's centre toward a point leaves the box. */
function edgeOf(box: Box, toward: Spot): Spot {
  const cx = box.x + box.w / 2,
    cy = box.y + box.h / 2;
  const dx = toward[0] - cx,
    dy = toward[1] - cy;
  if (!dx && !dy) return [cx, cy];
  const t = Math.min(dx ? box.w / 2 / Math.abs(dx) : Infinity, dy ? box.h / 2 / Math.abs(dy) : Infinity);
  return [cx + dx * t, cy + dy * t];
}

/** An elbow from the side of `a` that faces `b` to the side of `b` that faces it; none when neither side is clear. */
function elbow(a: Box, b: Box): Run | null {
  const ay = a.y + a.h / 2,
    by = b.y + b.h / 2,
    ax = a.x + a.w / 2,
    bx = b.x + b.w / 2;
  if (b.x >= a.x + a.w || a.x >= b.x + b.w) {
    const right = b.x >= a.x + a.w;
    const [x1, x2] = right ? [a.x + a.w, b.x] : [a.x, b.x + b.w];
    const mx = (x1 + x2) / 2;
    return { path: `M${num(x1)} ${num(ay)}H${num(mx)}V${num(by)}H${num(x2)}`, mid: [mx, (ay + by) / 2] };
  }
  if (b.y >= a.y + a.h || a.y >= b.y + b.h) {
    const down = b.y >= a.y + a.h;
    const [y1, y2] = down ? [a.y + a.h, b.y] : [a.y, b.y + b.h];
    const my = (y1 + y2) / 2;
    return { path: `M${num(ax)} ${num(y1)}V${num(my)}H${num(bx)}V${num(y2)}`, mid: [(ax + bx) / 2, my] };
  }
  return null;
}

/**
 * How the connector `c` runs from the box `a` to the box `b`, past the boxes of the `others`. With no route of its
 * own it is straight, and bows only round an item in its way.
 */
export function connectorRun(c: Connector, a: Box, b: Box, others: readonly Box[]): Run {
  const bent = c.route === 'elbow' ? elbow(a, b) : null;
  if (bent) return bent;
  const from = placed(a, 'from'),
    to = placed(b, 'to');
  const round =
    c.route === 'straight'
      ? 0
      : aside(
          from,
          to,
          others.map((o, i) => placed(o, String(i))),
        );
  const bow = round || (c.route === 'curved' ? GENTLE : 0);
  if (!bow) {
    const p = edgeOf(a, [to.x, to.y]),
      q = edgeOf(b, [from.x, from.y]);
    return { line: [p, q], mid: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] };
  }
  const curve = curveOf(from, to, bow);
  const [s, c1, c2, e] = curve.cubic(0, 0) as [Spot, Spot, Spot, Spot];
  const at = (p: Spot) => `${num(p[0])} ${num(p[1])}`;
  return { path: `M${at(s)}C${at(c1)} ${at(c2)} ${at(e)}`, mid: curve.at(0.5) };
}

/** The connectors a change of route is for: those between the items chosen, or else every one that touches them. */
export function connectorsOf(board: Board, ids: readonly string[]): Connector[] {
  const chosen = new Set(ids);
  const among = board.connectors.filter((c) => chosen.has(c.from) && chosen.has(c.to));
  return among.length ? among : board.connectors.filter((c) => chosen.has(c.from) || chosen.has(c.to));
}

/** The route and arrowheads the connectors share; a part in which they differ is left out. */
export function sharedRoute(links: readonly Connector[]): { route?: Route | null; tips?: Tips } {
  const [first, ...rest] = links;
  if (!first) return {};
  const shared: { route?: Route | null; tips?: Tips } = {};
  if (rest.every((c) => c.route === first.route)) shared.route = first.route ?? null;
  if (rest.every((c) => (c.tips ?? 'end') === (first.tips ?? 'end'))) shared.tips = first.tips ?? 'end';
  return shared;
}

/**
 * The connector with what `set` names changed. The board's own route and an arrow at the end are not written.
 * Only the words a board knows are taken: any other is read as the board's own choice, so none is written to the note.
 */
export function routedAs(c: Connector, set: RouteSet): Connector {
  const next = { ...c };
  if ('route' in set) {
    const route = ROUTES.find((r) => r === set.route);
    if (route) next.route = route;
    else delete next.route;
  }
  const tips = TIPS.find((t) => t === set.tips);
  if (tips) {
    if (tips === 'end') delete next.tips;
    else next.tips = tips;
  }
  return next;
}
