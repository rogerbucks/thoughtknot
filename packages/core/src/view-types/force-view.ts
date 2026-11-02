// The force-directed view (editor spec §36, view_types_offered). Links pull the things they join together, and every
// pair of near things pushes apart. After some steps, linked things sit close and the rest spread out. It is drawn as
// marks (drawing-marks.ts), so every painter draws it the same way. Each thing is a rounded card with its name inside
// (thing-card.ts); past NAMED_MOST things, each is a dot.
//
// The layout is the same each time for the same graph. Its places are in its own units, where a link is about one long.
// Those places are what a host saves. Drawing fits them into the space. Given the places from last time, the layout
// starts from them and moves them gently, so a small edit moves little (warm start).
//
// Pushing apart is worked out only between things in nearby squares of a grid. So each step costs about as much as the
// number of things, and the steps are fewer for a big graph.
//
// A key never holds a new line, so the ids this view joins with one never meet a thing's key.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import type { GraphShape } from '../types-shape.ts';
import { isPluginLayoutId, layoutOptions } from '../layouts/layout-options.ts';
import type { LayoutOptions } from '../layouts/layout-options.ts';
import { rowsOf } from '../layouts/layered-rows.ts';
import { cardTall, cardWidth, spreadCards, thingCard } from './thing-card.ts';

/** The most steps a layout takes. */
export const FORCE_STEPS = 300;
/** The most work a layout does, as things times steps, so a big graph takes fewer steps. */
const WORK_MOST = 600_000;
/** How far apart two things push, in the layout's units. Past twice this, they do not push at all. */
const REACH = 2;
/** How strongly every thing is pulled to the middle, so parts that do not link stay near. */
const PULL = 0.02;
/** The share of the space kept empty round the edge. */
const MARGIN_SHARE = 0.05;
/** Past this many things, things are not named. */
const NAMED_MOST = 150;
/** The angle between one thing and the next on the starting spiral: the golden angle. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** How much wider, or taller, the View menu's shape draws the layout than it settles. */
const STRETCH = 1.6;

/** Each thing's place, by its key, in the layout's own units. */
export type Places = ReadonlyMap<string, readonly [number, number]>;
/** Each thing's spot as a plug-in's layout gave it, by its key (plugin-layouts.ts). */
export type Spots = Readonly<Record<string, readonly [number, number]>>;

/**
 * Where each thing of `shape` sits, in the layout's own units, starting from `previous` where it has a place. The View
 * menu's layout options say how (view_options_everywhere): rounds take more or fewer steps; in rows each thing keeps
 * its row, by the way its links run; a plug-in's layout places things at its `spots`; and the shape stretches the
 * whole wider or taller.
 */
export function forceLayout(
  shape: GraphShape,
  previous?: Places,
  options: Partial<LayoutOptions> = {},
  spots?: Spots,
): Map<string, [number, number]> {
  const { spacing, linkLength, rounds, strategy, direction, shape: aim } = layoutOptions(options);
  const given = isPluginLayoutId(strategy) ? givenPlaces(shape, spots) : undefined;
  if (given) return stretched(given, aim);
  // things push apart as far as `spacing` asks, and a link pulls weaker as it is asked to be longer
  const apart = spacing * spacing,
    reach = REACH * spacing,
    pull = 1 / linkLength;
  const keys = shape.things.map((t) => t.key);
  const n = keys.length;
  const out = new Map<string, [number, number]>();
  if (!n) return out;
  const index = new Map(keys.map((k, i) => [k, i]));
  const links: [number, number][] = [];
  for (const l of shape.links) {
    const a = index.get(l.from),
      b = index.get(l.to);
    if (a !== undefined && b !== undefined && a !== b) links.push([a, b]);
  }
  const row = strategy === 'rows' ? rowsOf(n, linksOut(n, links)) : undefined;
  // start from last time's places, else on a spiral out from the middle
  const x = new Float64Array(n),
    y = new Float64Array(n);
  keys.forEach((key, i) => {
    const p = previous?.get(key);
    const r = 0.5 * Math.sqrt(i + 0.5);
    [x[i], y[i]] = p ? [p[0], p[1]] : [r * Math.cos(i * GOLDEN), r * Math.sin(i * GOLDEN)];
    if (row) y[i] = (row[i] ?? 0) * linkLength;
  });
  const warm = keys.some((key) => previous?.has(key));
  // a warm start takes fewer, smaller steps, so things already placed stay near where they were
  const steps = Math.max(1, Math.floor((Math.min(FORCE_STEPS, WORK_MOST / n) * rounds) / (warm ? 4 : 1)));
  const hottest = warm ? 0.2 : Math.max(1, Math.sqrt(n) / 2);
  const dx = new Float64Array(n),
    dy = new Float64Array(n);
  const cellOf = (i: number) => Math.floor((x[i] ?? 0) / reach) * 1_000_003 + Math.floor((y[i] ?? 0) / reach);
  for (let s = 0; s < steps; s++) {
    const heat = (hottest * (steps - s)) / steps;
    dx.fill(0);
    dy.fill(0);
    const grid = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const c = cellOf(i);
      const here = grid.get(c);
      if (here) here.push(i);
      else grid.set(c, [i]);
    }
    for (let i = 0; i < n; i++) {
      const xi = x[i] ?? 0,
        yi = y[i] ?? 0;
      const gx = Math.floor(xi / reach),
        gy = Math.floor(yi / reach);
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++)
          for (const j of grid.get((gx + ox) * 1_000_003 + gy + oy) ?? []) {
            if (j <= i) continue;
            let ex = xi - (x[j] ?? 0),
              ey = yi - (y[j] ?? 0);
            let d2 = ex * ex + ey * ey;
            // two things in one place are pushed apart along a fixed slant, so the layout stays the same each time
            if (d2 < 1e-18) [ex, ey, d2] = [((i - j) % 7) + 0.5, ((i + j) % 5) - 2.5, 1];
            if (d2 > reach * reach) continue;
            const f = apart / d2;
            dx[i] = (dx[i] ?? 0) + ex * f;
            dy[i] = (dy[i] ?? 0) + ey * f;
            dx[j] = (dx[j] ?? 0) - ex * f;
            dy[j] = (dy[j] ?? 0) - ey * f;
          }
    }
    for (const [a, b] of links) {
      const ex = (x[a] ?? 0) - (x[b] ?? 0),
        ey = (y[a] ?? 0) - (y[b] ?? 0);
      const f = Math.hypot(ex, ey) * pull;
      dx[a] = (dx[a] ?? 0) - ex * f;
      dy[a] = (dy[a] ?? 0) - ey * f;
      dx[b] = (dx[b] ?? 0) + ex * f;
      dy[b] = (dy[b] ?? 0) + ey * f;
    }
    for (let i = 0; i < n; i++) {
      const mx = (dx[i] ?? 0) - (x[i] ?? 0) * PULL,
        my = (dy[i] ?? 0) - (y[i] ?? 0) * PULL;
      const d = Math.hypot(mx, my);
      if (d < 1e-12) continue;
      const move = Math.min(d, heat) / d;
      x[i] = (x[i] ?? 0) + mx * move;
      if (!row) y[i] = (y[i] ?? 0) + my * move;
    }
  }
  // rows run down, or across when the View menu says so
  const across = row && direction === 'LR';
  keys.forEach((key, i) => out.set(key, across ? [y[i] ?? 0, x[i] ?? 0] : [x[i] ?? 0, y[i] ?? 0]));
  return stretched(out, aim);
}

/** Each thing's links out, by index, as rows are found from them. */
function linksOut(n: number, links: readonly [number, number][]): number[][] {
  const out: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of links) out[a]?.push(b);
  return out;
}

/** Each thing's place as a plug-in's layout gave it, or none where it left any thing out. */
function givenPlaces(shape: GraphShape, spots?: Spots): Map<string, [number, number]> | undefined {
  const out = new Map<string, [number, number]>();
  for (const { key } of shape.things) {
    const p = spots?.[key];
    if (!p) return undefined;
    out.set(key, [p[0], p[1]]);
  }
  return out;
}

/** `places` stretched wider, or taller, as the View menu's shape says; for a screen's shape, as they are. */
function stretched(places: Map<string, [number, number]>, aim: LayoutOptions['shape']): Map<string, [number, number]> {
  if (aim === 'screen') return places;
  for (const p of places.values()) p[aim === 'wide' ? 0 : 1] *= STRETCH;
  return places;
}

/** `places` fitted inside a `width` by `height` space, keeping their shape, with a margin round the edge. */
export function fitted(places: Places, width: number, height: number): Map<string, [number, number]> {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of places.values()) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const mw = width * MARGIN_SHARE,
    mh = height * MARGIN_SHARE;
  const scale = Math.min((width - 2 * mw) / Math.max(x1 - x0, 1e-9), (height - 2 * mh) / Math.max(y1 - y0, 1e-9));
  const ox = (width - (x1 - x0) * scale) / 2,
    oy = (height - (y1 - y0) * scale) / 2;
  const out = new Map<string, [number, number]>();
  for (const [k, [x, y]] of places) out.set(k, [ox + (x - x0) * scale, oy + (y - y0) * scale]);
  return out;
}

/** The marks of `shape` drawn as a force-directed view in `space`, starting from `previous` places where it has them. */
export function forceMarks({ shape, space }: DiagramGiven, previous?: Places): DrawMark[] {
  const n = shape.things.length;
  if (!n) return [];
  const at = fitted(forceLayout(shape, previous, space.layout, space.spots), space.width, space.height);
  const text = new Map(shape.things.map((t) => [t.key, t.text]));
  const kinds = [...new Set(shape.things.map((t) => t.kinds.join(', ')))];
  const size = Math.max(1, Math.min(24, Math.sqrt((space.width * space.height) / n) / 3));
  const marks: DrawMark[] = [];
  // named, each thing is a card as wide as its name, the cards moved apart where they would cover one another
  const tall =
    n <= NAMED_MOST
      ? cardTall(
          shape.things.map((t) => t.text),
          space.width * space.height,
        )
      : 0;
  const wide = shape.things.map((t) => cardWidth(t.text, tall));
  if (tall > 0)
    spreadCards([...at.values()], wide, tall, space.width, space.height).forEach((c, i) =>
      at.set(shape.things[i]?.key ?? '', c),
    );
  shape.things.forEach((t, i) => {
    const [px, py] = at.get(t.key) ?? [0, 0];
    const style = `kind.${kinds.indexOf(t.kinds.join(', '))}`;
    if (tall > 0) {
      marks.push(...thingCard(t.key, t.text, px, py, wide[i] ?? 0, tall, style));
      return;
    }
    // a box near the edge is moved in, so all of it stays inside the space
    const bx = Math.min(Math.max(px - size / 2, 0), space.width - size),
      by = Math.min(Math.max(py - size / 2, 0), space.height - size);
    marks.push({
      kind: 'box',
      id: t.key,
      of: t.key,
      style,
      x: bx,
      y: by,
      width: size,
      height: size,
      shape: 'ellipse',
      role: 'thing',
      name: t.text,
    });
  });
  shape.links.forEach((l, i) => {
    const p = at.get(l.from),
      q = at.get(l.to);
    if (!p || !q || l.from === l.to) return;
    marks.push({
      kind: 'link',
      id: `link\n${i}`,
      style: 'link',
      points: [p, q],
      from: l.from,
      to: l.to,
      role: 'link',
      name: `${text.get(l.from)} ${l.type} ${text.get(l.to)}`,
      z: -1,
    });
  });
  return marks;
}
