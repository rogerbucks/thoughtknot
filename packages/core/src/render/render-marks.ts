// The marks: layer L4 of the rendering spec (wiki/Rendering-spec.md; editor spec §73, render_marks). It turns a scene,
// its rooms and its detail into plain marks on the screen: clouds, dots, roads and labels. A painter draws them as
// given and decides nothing. So the look lives here, and every painter shows the same picture.
//
// One label placer serves every view. Names are never under 11 px, never over 16 px, and never overlap. When two
// would clash, the bigger thing keeps its name (Roger: big things first). Host-free and pure.
import type { Detail } from './render-detail.ts';
import type { Look } from './render-look.ts';
import { inkOn, shadeOf, subjectColour } from './render-look.ts';
import type { Spot } from './render-rooms.ts';
import type { Scene, SceneNode } from './render-scene.ts';
import type { Clear } from '../zoom-fit.ts';

/** The smallest name drawn, in pixels. */
export const MIN_PX = 11;
/** The largest name drawn, in pixels. */
export const MAX_PX = 16;

/** Where the drawing sits on screen: its own units times `scale`, less the point at the screen's top left. */
export interface View {
  x: number;
  y: number;
  scale: number;
  w: number;
  h: number;
  /** How much of each edge the controls cover (layer L7); names are kept out of it. */
  clear?: Clear;
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
}

/** A road between two rooms: the links between them, counted each way. */
export interface RoadMark {
  kind: 'road';
  a: string;
  b: string;
  from: [number, number];
  to: [number, number];
  forward: number;
  back: number;
  width: number;
  fill: string;
  /** The count written on the road, such as "3 ⇄ 1"; empty for a single link. */
  count: string;
  /** The ink of the count. */
  ink: string;
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
}

/** Any mark, in the order a painter draws them: clouds, roads, dots, then labels on top. */
export type Mark = CloudMark | DotMark | RoadMark | LabelMark;

/** The colour of every node: subjects in turn, their children shades of them. */
export function coloursOf(scene: Scene, look: Look): Map<string, string> {
  const colours = new Map<string, string>();
  const paint = (key: string, colour: string): void => {
    colours.set(key, colour);
    const kids = scene.nodes.get(key)?.children ?? [];
    kids.forEach((k, i) => paint(k, shadeOf(colour, i, kids.length, look)));
  };
  // subjects take colours in the order the note first names them, as the mockups do: Work blue, Money orange
  scene.named.forEach((k, i) => paint(k, subjectColour(look, i)));
  return colours;
}

/** `spot` on screen. */
const onScreen = (spot: Spot, view: View): Spot => ({
  x: (spot.x - view.x) * view.scale,
  y: (spot.y - view.y) * view.scale,
  r: spot.r * view.scale,
});

/** Whether a circle on screen touches the view at all. */
const inView = (s: Spot, view: View): boolean =>
  s.x + s.r > 0 && s.y + s.r > 0 && s.x - s.r < view.w && s.y - s.r < view.h;

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
export function marksOf(scene: Scene, spots: Map<string, Spot>, detail: Detail, look: Look, view: View): Mark[] {
  const colours = coloursOf(scene, look);
  const last = scene.depths.length - 1;
  const clouds: CloudMark[] = [],
    dots: DotMark[] = [],
    asks: LabelAsk[] = [];
  for (const node of scene.nodes.values()) {
    const at = spots.get(node.key);
    if (!at) continue;
    const s = onScreen(at, view),
      fill = colours.get(node.key) ?? look.faint;
    if (!inView(s, view)) continue;
    const alpha = showOf(node, detail, last);
    if (node.depth < last) clouds.push({ kind: 'cloud', key: node.key, ...s, fill, alpha: cloudAlpha(alpha, s, view) });
    else dots.push({ kind: 'dot', key: node.key, x: s.x, y: s.y, r: Math.max(2, Math.min(s.r, 6)), fill, alpha: 0.8 });
    if (alpha > 0.05) asks.push(askOf(node, s, fill, alpha, detail, last, look));
  }
  return [...clouds, ...roadsOf(scene, spots, detail, view, colours, look), ...dots, ...placeLabels(asks, view)];
}

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
  alpha: number;
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
  const px = node.depth === last ? MIN_PX + 1 : MAX_PX - (MAX_PX - MIN_PX) * inside;
  const y = node.depth === last ? s.y : s.y - s.r * inside * 0.82;
  return {
    key: node.key,
    text: node.name,
    x: s.x,
    y,
    px,
    // an item sits on a white card with a dot of its colour, as in the mockups; a group's name is in its colour
    ...(item ? { fill: look.card, dot: fill } : { fill }),
    alpha,
    weight: (last - node.depth) * 1e6 + node.items.length,
    // a group's name may move within its cloud, and always by one line, so a small cloud's name still shows
    ...(item ? {} : { room: Math.max(s.r * 0.8, px * 1.6 + 2) }),
  };
}

/** The width of `text` at `px`, near enough to keep names apart. */
export const textWidth = (text: string, px: number): number => text.length * px * 0.56;

/** The pixels kept between two names, and between a name and a control. */
const GAP = 2;

/** The longest name drawn, in letters; longer names end in an ellipsis. */
const LONGEST = 28;

/**
 * The one label placer. It takes names heaviest first and keeps each that fits (spotFor). A name fits inside the part of the
 * view the controls leave clear, and away from every name kept before it. Sizes stay between MIN_PX and MAX_PX.
 */
export function placeLabels(asks: readonly LabelAsk[], view: View): LabelMark[] {
  const order = [...asks].sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : 1));
  const kept: LabelMark[] = [];
  for (const ask of order) {
    const px = Math.min(MAX_PX, Math.max(MIN_PX, ask.px));
    const text = ask.text.length > LONGEST ? `${ask.text.slice(0, LONGEST - 1)}…` : ask.text;
    const w = textWidth(text, px) + px + (ask.dot ? px : 0),
      h = px * 1.6;
    const box = spotFor(ask, w, h, view, kept);
    if (!box) continue;
    kept.push({
      kind: 'label',
      key: ask.key,
      text,
      ...box,
      px,
      fill: ask.fill,
      ink: inkOn(ask.fill),
      alpha: ask.alpha,
      ...(ask.dot ? { dot: ask.dot } : {}),
    });
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
  for (const dy of [0, -step, step, -2 * step, 2 * step].filter((d) => Math.abs(d) <= room)) {
    // slid across to stay clear of the controls, if it still covers its spot
    const x = Math.min(Math.max(ask.x - w / 2, left), right - w);
    const box = { x: x <= ask.x && ask.x <= x + w ? x : ask.x - w / 2, y: ask.y + dy - h / 2, w, h };
    if (box.x < left || box.y < top || box.x + w > right || box.y + h > bottom) continue;
    const apart = (k: LabelMark) =>
      box.x >= k.x + k.w + GAP || k.x >= box.x + w + GAP || box.y >= k.y + k.h + GAP || k.y >= box.y + h + GAP;
    if (!kept.every(apart)) continue;
    return box;
  }
  return null;
}

/** What a road says of its links: both ways, one way, or nothing for a single link. */
export function countOf(forward: number, back: number): string {
  if (forward + back < 2) return '';
  if (forward && back) return `${forward} ⇄ ${back}`;
  return forward ? `${forward} →` : `← ${back}`;
}

/** The roads at each open depth. A level's roads fade out as the level inside it opens, as its names do. */
function roadsOf(
  scene: Scene,
  spots: Map<string, Spot>,
  detail: Detail,
  view: View,
  colours: Map<string, string>,
  look: Look,
): RoadMark[] {
  const roads: RoadMark[] = [];
  scene.roads.forEach((at, depth) => {
    // a level's roads stay, fainter, while the level inside it opens: a road never just vanishes (R20)
    const alpha = (detail.shown[depth] ?? 0) * (1 - 0.7 * (detail.shown[depth + 1] ?? 0));
    if (alpha < 0.05) return;
    for (const road of at) {
      const p = spots.get(road.a),
        q = spots.get(road.b);
      // only neighbours in the same room: links that leave it ride on the road of the room itself
      if (!p || !q || scene.nodes.get(road.a)?.parent !== scene.nodes.get(road.b)?.parent) continue;
      const [s, t] = [onScreen(p, view), onScreen(q, view)];
      roads.push({
        kind: 'road',
        a: road.a,
        b: road.b,
        from: [s.x, s.y],
        to: [t.x, t.y],
        forward: road.forward,
        back: road.back,
        width: 2 + Math.log2(road.forward + road.back),
        fill: colours.get(road.a) ?? look.faint,
        count: countOf(road.forward, road.back),
        ink: inkOn(colours.get(road.a) ?? look.faint),
        alpha,
      });
    }
  });
  return roads;
}
