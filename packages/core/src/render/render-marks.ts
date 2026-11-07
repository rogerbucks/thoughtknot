// The marks: layer L4 of the rendering spec (wiki/Rendering-spec.md; editor spec §73, render_marks). It turns a scene,
// its rooms and its detail into plain marks on the screen: clouds, dots, roads and labels. A painter draws them as
// given and decides nothing. So the look lives here, and every painter shows the same picture.
//
// One label placer serves every view. Names are never under 11 px, never over 16 px, and never overlap. When two
// would clash, the bigger thing keeps its name (Roger: big things first). Host-free and pure.
import type { Detail } from './render-detail.ts';
import type { Look } from './render-look.ts';
import { inkOf, inkOn, mix, shadeOf, subjectColour } from './render-look.ts';
import { signsOf } from './render-signs.ts';
import { groundOf, isTilted, onScreen } from './render-tilt.ts';
export { onScreen } from './render-tilt.ts';
import { roadsOf } from './render-roads.ts';
import { calloutsOf } from './render-callouts.ts';
import { LONGEST, MAX_PX, MIN_PX, MOST_LINES, labelOf, sizeOf, textWidth } from './render-labels.ts';
export { LONGEST, MAX_PX, MIN_PX, labelOf, sizeOf, textWidth, wrapName } from './render-labels.ts';
export { countOf, roadAlpha } from './render-roads.ts';
import type { Spot } from './render-rooms.ts';
import type { Scene, SceneNode } from './render-scene.ts';
import type { Clear } from '../zoom-fit.ts';
import { word } from '../words.ts';

/** An item's name, in pixels: easy to read close in (Roger, 7 Nov 2026). */
export const ITEM_PX = 13;
/** The smallest a group's name gets as its insides open, in pixels: still easy to read. */
export const HEADER_PX = 13;
/** How clear a group's name stays while the level inside it shows. */
const HEADER_ALPHA = 0.9;

/** Where the drawing sits on screen: its own units times `scale`, less the point at the screen's top left. */
export interface View {
  x: number;
  y: number;
  scale: number;
  w: number;
  h: number;
  /** How much of each edge the controls cover (layer L7); names are kept out of it. */
  clear?: Clear;
  /** How far the camera tips back from looking straight down, and turns round the screen's middle, in radians. */
  tilt?: number;
  turn?: number;
  /** In 3D, how far each level stands above the one that holds it: 0 lies flat on the ground, 1 is full height. */
  lift?: number;
}

/** A soft cloud: one group's room. */
export interface CloudMark {
  kind: 'cloud';
  key: string;
  x: number;
  y: number;
  r: number;
  fill: string;
  alpha: number;
  /** Where its room's footprint lies on the ground, when it stands above it in 3D. */
  shadow?: { x: number; y: number; r: number };
}

/** The ground seen from an angle: the faint lines of a grid, each from one end to the other on the screen. */
export interface GroundMark {
  kind: 'ground';
  lines: [number, number, number, number][];
  fill: string;
  alpha: number;
}

/** An item far out: a dot in its subject's colour. */
export interface DotMark {
  kind: 'dot';
  key: string;
  x: number;
  y: number;
  r: number;
  fill: string;
  alpha: number;
  /** Where it stands on the ground, when it stands above it in 3D: a thin stem joins them. */
  foot?: [number, number];
}

/** A road between two rooms: the links between them, counted each way. */
export interface RoadMark {
  kind: 'road';
  a: string;
  b: string;
  from: [number, number];
  to: [number, number];
  /** In 3D, the control point of the arch the road bows up in; a straight road has none. */
  via?: [number, number];
  forward: number;
  back: number;
  width: number;
  fill: string;
  /** The count written on the road, such as "3 ⇄ 1"; empty for a single link. */
  count: string;
  /** The ink of the count, on a chip of `chip` edged in the road's colour. */
  ink: string;
  chip: string;
  alpha: number;
}

/** A name on a card. Its box is where it is drawn. */
export interface LabelMark {
  kind: 'label';
  key: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  px: number;
  fill: string;
  ink: string;
  alpha: number;
  /** An item's name: a dot of this colour at the start of its card. */
  dot?: string;
  /** The thin edge of the card, in its thing's colour. */
  edge?: string;
  /** A long name wrapped onto lines, top to bottom, where it takes more than one; `text` is then the whole name. */
  lines?: string[];
  /** A thin line from the card to its thing, when the card stands away from it: from `x1`, `y1` to `x2`, `y2`. */
  lead?: [number, number, number, number];
  /** A second, smaller line under the name, such as "13 items", in `subInk` at `subPx`. */
  sub?: string;
  subPx?: number;
  subInk?: string;
}

/** Any mark, in the order a painter draws them: clouds, roads, dots, then labels on top. */
export type Mark = GroundMark | CloudMark | DotMark | RoadMark | LabelMark;

/** A subject's own colour, as an index into the look's, where the person picked one on the colour key. */
export type OwnColour = (subject: string) => number | undefined;

/** The colour of every node: subjects in turn, or the one picked for them, their children shades of them. */
export function coloursOf(scene: Scene, look: Look, own?: OwnColour): Map<string, string> {
  const colours = new Map<string, string>();
  const paint = (key: string, colour: string): void => {
    colours.set(key, colour);
    const kids = scene.nodes.get(key)?.children ?? [];
    kids.forEach((k, i) => paint(k, shadeOf(colour, i, kids.length, look)));
  };
  // subjects take colours in the order the note first names them, as the mockups do: Work blue, Money orange
  scene.named.forEach((k, i) => paint(k, subjectColour(look, own?.(k) ?? i)));
  return colours;
}

/** Whether a circle on screen touches the view at all. */
export const inView = (s: Spot, view: View): boolean =>
  s.x + s.r > 0 && s.y + s.r > 0 && s.x - s.r < view.w && s.y - s.r < view.h;

/** Whether the middle of `s`, where its name sits, is on the screen. */
export const onView = (s: Spot, view: View): boolean => s.x >= 0 && s.y >= 0 && s.x <= view.w && s.y <= view.h;

/** How much a node shows: its depth's share, and a group fades back once the level inside it is open. */
function showOf(node: SceneNode, detail: Detail, last: number): number {
  const own = detail.shown[node.depth] ?? 0;
  if (node.depth === last) return own;
  return own * (1 - 0.8 * (detail.shown[node.depth + 1] ?? 0));
}

/**
 * How strong a cloud is: firm while it is the level being read, faint once the level inside is open. A cloud far
 * bigger than the screen is the ground underfoot, so it fades further and never washes the screen out.
 */
export function cloudAlpha(show: number, s: Spot, view: View): number {
  const screen = Math.max(view.w, view.h);
  const ground = s.r > screen ? Math.max(0.3, screen / s.r) : 1;
  return (0.06 + 0.3 * show) * ground;
}

/** The marks of `scene` at one zoom and theme. */
export function marksOf(
  scene: Scene,
  spots: Map<string, Spot>,
  detail: Detail,
  look: Look,
  view: View,
  own?: OwnColour,
): Mark[] {
  const colours = coloursOf(scene, look, own);
  const last = scene.depths.length - 1;
  const clouds: CloudMark[] = [],
    dots: DotMark[] = [],
    asks: LabelAsk[] = [];
  for (const node of scene.nodes.values()) {
    const at = spots.get(node.key);
    if (!at) continue;
    const s = onScreen(at, view, node.depth),
      ground = node.depth && view.lift ? onScreen(at, view) : undefined,
      fill = colours.get(node.key) ?? look.faint;
    if (!inView(s, view)) continue;
    const alpha = showOf(node, detail, last);
    const [at3d, r] = [ground ? { shadow: ground } : {}, Math.max(2, Math.min(s.r, 6))];
    if (node.depth < last)
      clouds.push({ kind: 'cloud', key: node.key, ...s, fill, alpha: cloudAlpha(alpha, s, view), ...at3d });
    else
      dots.push({
        kind: 'dot',
        key: node.key,
        x: s.x,
        y: s.y,
        r,
        fill,
        alpha: 0.8,
        ...(ground ? { foot: [ground.x, ground.y] } : {}),
      });
    // a group's name stays clear as its insides open: its cloud fades, its name does not (Roger, 7 Nov 2026)
    const named = node.depth < last ? Math.max(alpha, (detail.shown[node.depth] ?? 0) * HEADER_ALPHA) : alpha;
    // a name is clear or not drawn: never a ghost of text too faint to read (Roger, 7 Nov 2026)
    const clear = crisp(named);
    if (clear > 0.05) asks.push(askOf(node, s, fill, clear, detail, last, look));
  }
  // seen from an angle, far things are painted first, so near ones lie over them. A room still lies under what it
  // holds
  const depth = (key: string) => scene.nodes.get(key)?.depth ?? 0;
  if (isTilted(view)) for (const m of [clouds, dots]) m.sort((a, b) => depth(a.key) - depth(b.key) || a.y - b.y);
  asks.push(...signsOf(scene, spots, detail, view, colours, look));
  const lines = groundOf(view),
    floor: GroundMark[] = lines.length ? [{ kind: 'ground', lines, fill: look.faint, alpha: 0.5 }] : [];
  // far out, where the top level's names crowd their small clouds, they stand in order round the drawing (Roger)
  const tops = new Map(clouds.filter((m) => scene.nodes.get(m.key)?.depth === 0).map((m) => [m.key, m]));
  const placed = placeLabels(asks, view);
  return [
    ...floor,
    ...clouds,
    ...roadsOf(scene, spots, detail, view, colours, look),
    ...dots,
    ...(calloutsOf(asks, tops, placed, view) ?? placed),
  ];
}

/** How clear a name is drawn as its level fades in: nothing until it is half there, then quickly all of it. */
export const crisp = (alpha: number): number => Math.min(1, Math.max(0, (alpha - 0.35) / 0.3));

/** A name that would like to be drawn, and how much it matters. */
export interface LabelAsk {
  key: string;
  text: string;
  x: number;
  y: number;
  px: number;
  fill: string;
  /** An item's colour, drawn as a dot at the start of its card. */
  dot?: string;
  /** The name's ink, where it is not the plain ink on `fill`; the card's edge; a second line and its ink. */
  ink?: string;
  edge?: string;
  sub?: string;
  subInk?: string;
  alpha: number;
  /** The most lines a long name may wrap onto; one when none is given. */
  lines?: number;
  /** Higher keeps its place when two names clash. */
  weight: number;
  /** How far the name may move up or down, in pixels, to fit: a group's name may move within its cloud. */
  room?: number;
}

/** What `node` asks of the label placer: groups shrink as the level inside opens, items sit on their dot. */
function askOf(
  node: SceneNode,
  s: Spot,
  fill: string,
  alpha: number,
  detail: Detail,
  last: number,
  look: Look,
): LabelAsk {
  const item = node.depth === last;
  const inside = detail.shown[node.depth + 1] ?? 0;
  const px = node.depth === last ? ITEM_PX : MAX_PX - (MAX_PX - HEADER_PX) * inside;
  const y = node.depth === last ? s.y : s.y - s.r * inside * 0.82;
  return {
    key: node.key,
    text: node.name,
    x: s.x,
    y,
    px,
    // a name sits on a white card edged in its colour, as in the mockups. An item's card has a dot of its colour. A
    // group's name is written in its colour, with how many items it holds under it.
    fill: look.card,
    edge: fill,
    ...(item
      ? { dot: fill }
      : {
          ink: inkOf(fill, look.card, look),
          sub: word('levels.card-count', { count: node.items.length }),
          subInk: mix(look.ink, look.card, 0.45),
        }),
    alpha,
    weight: (last - node.depth) * 1e6 + node.items.length,
    // close in, an item's long name may wrap: two lines once items are fully shown, more as they spread apart
    ...(item && (detail.shown[last] ?? 0) >= 1 ? { lines: linesFor(detail.span?.[last] ?? 0) } : {}),
    // a group's name may move within its cloud, and always by one line, so a small cloud's name still shows
    ...(item ? {} : { room: Math.max(s.r * 0.8, px * 1.6 + MIN_PX * 1.2 + GAP) }),
  };
}

/** How many lines an item's name may take when items sit `span` pixels apart: two, up to six as they spread. */
const linesFor = (span: number): number => Math.max(2, Math.min(MOST_LINES, Math.floor(span / (ITEM_PX * 1.6))));

/** The pixels kept between two names, and between a name and a control. */
const GAP = 2;

/**
 * The one label placer. It takes names heaviest first and keeps each that fits (spotFor). A name fits inside the part of the
 * view the controls leave clear, and away from every name kept before it. Sizes stay between MIN_PX and MAX_PX.
 */
export function placeLabels(asks: readonly LabelAsk[], view: View): LabelMark[] {
  const order = [...asks].sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : 1));
  const kept: LabelMark[] = [];
  for (const ask of order)
    // a long name close in may take several lines: as many as fit, down to one
    for (let lines = ask.lines ?? 1; lines >= 1; lines--) {
      const size = sizeOf(ask, lines);
      const box = spotFor(ask, size.w, size.h, view, kept);
      if (box) {
        kept.push(labelOf(ask, size, box));
        break;
      }
    }
  return kept;
}

/**
 * Where a name `w` by `h` fits: on its spot, else as near above or below it as its room allows. It may slide across
 * while it still covers its spot. It must sit inside the clear part of the view and away from every name kept. Null
 * when it fits nowhere.
 */
function spotFor(
  ask: LabelAsk,
  w: number,
  h: number,
  view: View,
  kept: readonly LabelMark[],
): { x: number; y: number; w: number; h: number } | null {
  const c = view.clear ?? { top: 0, right: 0, bottom: 0, left: 0 };
  // the clear part, a gap in from each edge a control covers, as the painted edge of a name reaches past its box
  const gap = (edge: number) => (edge > 0 ? edge + GAP : 0);
  const [left, top, right, bottom] = [gap(c.left), gap(c.top), view.w - gap(c.right), view.h - gap(c.bottom)];
  const room = ask.room ?? 0;
  const step = h + GAP; // a name and the gap kept between names
  // it may sit just clear of a name kept before it, within its room and half a line more
  const snaps = room ? kept.flatMap((k) => [k.y + k.h + GAP + h / 2, k.y - GAP - h / 2].map((y) => y - ask.y)) : [];
  const ups = [0, -step, step, -2 * step, 2 * step].filter((d) => Math.abs(d) <= room);
  ups.push(...snaps.filter((d) => Math.abs(d) <= room + step / 2).sort((p, q) => Math.abs(p) - Math.abs(q)));
  // a group's name may also slide half its width to a side, still over its spot, before it gives up its place
  const tries = [
    ...ups.map((dy) => [0, dy]),
    ...(room ? ups.flatMap((dy) => [-w * 0.45, w * 0.45].map((dx) => [dx, dy])) : []),
  ];
  for (const [dx = 0, dy = 0] of tries) {
    // slid across to stay clear of the controls, if it still covers its spot
    const at = ask.x + dx;
    const x = Math.min(Math.max(at - w / 2, left), right - w);
    const box = { x: x <= ask.x && ask.x <= x + w ? x : at - w / 2, y: ask.y + dy - h / 2, w, h };
    if (box.x < left || box.y < top || box.x + w > right || box.y + h > bottom) continue;
    const apart = (k: LabelMark) =>
      box.x >= k.x + k.w + GAP || k.x >= box.x + w + GAP || box.y >= k.y + k.h + GAP || k.y >= box.y + h + GAP;
    if (kept.every(apart)) return box;
  }
  return null;
}
