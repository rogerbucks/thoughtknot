// The 3D view laid out in space (editor spec §53, space_spread). Roger, 24 Oct 2026: "There should be spheres of varying
// sizes. Arrow heads should be shown and clear. Labels on arrows should be visible. Use the 3D space to make the
// connectors more obvious to see."
//
// The drawing's things and links are laid out again, in space, by the 3D force layout (layouts/force-3d.ts). So links
// a page would cross pass in front or behind. Each thing is a sphere. The more links it has, the larger it is: by the
// square root, so a hub stands out without hiding its neighbours. Each link runs straight from sphere to sphere, ending
// in an arrowhead on the sphere it points to. Two links between the same two things bow apart, so both show. A link's
// words float at its middle, and a thing's name just above its sphere.
//
// A drawing of any type but a network is kept as drawn (space_follows_type). Each thing stays where its type put it,
// across and down, and only its depth is laid out. So a flow, a tree or a radial drawing looks like itself in space.
// Host-free and pure.
import type { DrawMark } from './drawing-marks.ts';
import { FORCE_3D } from './layouts/layouts.ts';
import { layoutOptions } from './layouts/layout-options.ts';
import type { LayoutOptions } from './layouts/layout-options.ts';
import type { Spot, Spots } from './layouts/layouts.ts';
import type { GraphShape } from './types-shape.ts';
import { boundsOf } from './space-view.ts';
import { isCluster } from './space-cards.ts';
import { isJoint, jointsBetween, partsNear, withoutJoints } from './space-parts.ts';
import type { SpaceGroup } from './space-cards.ts';
import type { Block, SpaceArrow, SpaceLabel, SpaceLine, SpaceMarks, Vec3 } from './space-view.ts';

/** How many pixels of the space one unit of the layout is: about one link's length. */
export const SPREAD_UNIT = 120;
/** How much further apart cards are laid than balls, so a box-sized card leaves its links room to show. */
const CARD_SPREAD = 2.2;
/**
 * The clear room kept between two things laid out afresh, in pixels of the space. It is enough for a link and its
 * arrowhead to show between them, at the View menu's usual spacing.
 */
export const ROOM = 70;
/** How much further apart the force layout spaces things in space than its own spacing: a share of it. */
export const SPACE_SPACING = 1.4;
/** `options` as the 3D view lays out with them: spaced SPACE_SPACING times as far. */
const roomier = (options: LayoutOptions): LayoutOptions => ({ ...options, spacing: options.spacing * SPACE_SPACING });
/** How far apart two planes of kinds are, in units of the layout: about two links. */
const PLANE_STEP = 2;

/** `spots` with each thing of `planes` moved in depth to its lane's plane, the middle plane at no depth. */
function onPlanes(spots: Spots<3>, planes: ReadonlyMap<string, number>): Map<string, Spot<3>> {
  const middle = Math.max(...planes.values()) / 2;
  return new Map(
    [...spots].map(([k, [x, y, z]]) => [
      k,
      [x, y, planes.has(k) ? ((planes.get(k) as number) - middle) * PLANE_STEP : z],
    ]),
  );
}

/** The most rounds of pushing apart things that sit too close. */
const APART_ROUNDS = 40;
/** A sphere's radius with no links, and how much it grows by the square root of its count of links. */
const RADIUS_LEAST = 12,
  RADIUS_GROWTH = 7,
  RADIUS_MOST = 46;
/** An arrowhead's length: a share of its link, kept between a least and a most. */
const ARROW_SHARE = 0.12,
  ARROW_LEAST = 12,
  ARROW_MOST = 22;
/** How far two links between the same things bow apart at their middle, as a share of their length. */
const BOW = 0.18;
/** How many straight pieces a bowed link is painted with. */
const BOW_STEPS = 12;
/** The size of a thing's name, of a link's words and of a group's name, in pixels of the space. */
const NAME_SIZE = 14,
  WORDS_SIZE = 11,
  GROUP_SIZE = 18;

/**
 * Whether box `m` is a trunk's joint (fold-source.ts). Drawn as a point, it stays one in space (untangle_merge). The
 * layout source names it `trunk: 1 in`. The drawing on screen has no title to read, so there it is `trunk_1_in`.
 */
const isPoint = (m: { of?: string }) => /^(?:trunk: \d+ (?:in|out)|trunk_\d+_(?:in|out))$/.test(m.of ?? '');

/** A thing's sphere radius, by its count of links. */
export const radiusOf = (links: number) => Math.min(RADIUS_MOST, RADIUS_LEAST + RADIUS_GROWTH * Math.sqrt(links));

/** The things and links of `marks`, as the layouts read them: each box that draws a thing, and links between them. */
export function shapeOfMarks(marks: readonly DrawMark[]): GraphShape {
  const things = new Map<string, string>();
  for (const m of marks)
    if (m.kind === 'box' && m.of !== undefined && !things.has(m.of)) things.set(m.of, m.name ?? m.of);
  const links: GraphShape['links'] = [];
  for (const m of marks)
    if (m.kind === 'link' && m.from !== undefined && m.to !== undefined && things.has(m.from) && things.has(m.to))
      links.push({ from: m.from, type: m.name ?? '', to: m.to });
  // each group drawn, by its label, with the things whose boxes sit in it: the 2D drawing's groups, found or written
  const named = new Map<string, string>();
  for (const m of marks) if (m.kind === 'group') named.set(m.id, m.name ?? m.id);
  const held = new Map<string, string[]>();
  for (const m of marks)
    if (m.kind === 'box' && m.of !== undefined && m.group !== undefined && named.has(m.group)) {
      const here = held.get(m.group);
      if (!here) held.set(m.group, [m.of]);
      else if (!here.includes(m.of)) here.push(m.of);
    }
  const groups = [...held].map(([id, keys]): [string, string[]] => [named.get(id) ?? id, keys]);
  return {
    things: [...things].map(([key, text]) => ({ key, text, kinds: [] })),
    links,
    ...(groups.length ? { groups } : {}),
  };
}

/**
 * Whether a drawing of the diagram type `choice` says is kept as drawn in space (space_follows_type). A network is
 * laid out afresh there, by the 3D force layout. Any other type keeps its places, so choosing a type changes the view
 * in space as it does in 2D (Roger, 25 Oct 2026). So does a view type a plug-in draws as marks.
 */
export const asDrawnFor = (choice?: { drawn: string; plugin?: unknown }): boolean =>
  !!choice && (choice.drawn !== 'network' || !!choice.plugin);

/** Each thing's middle on the page, by its key: where its first box is drawn. */
function middlesOf(marks: readonly DrawMark[]): Map<string, [number, number]> {
  const at = new Map<string, [number, number]>();
  for (const m of marks)
    if (m.kind === 'box' && m.of !== undefined && !at.has(m.of)) at.set(m.of, [m.x + m.width / 2, m.y + m.height / 2]);
  return at;
}

/**
 * The spots of things kept where the drawing put them, `at`, in the layout's units: a link about one long. Each starts
 * a little off the page, so the force layout can lift what lies close apart in depth. Gives back the pixels per unit.
 */
function drawnSpots(shape: GraphShape, at: Map<string, [number, number]>): { seeds: Spots<3>; unit: number } {
  const lengths = shape.links
    .map((l) => [at.get(l.from), at.get(l.to)])
    .flatMap(([a, b]) => (a && b && (a[0] !== b[0] || a[1] !== b[1]) ? [Math.hypot(a[0] - b[0], a[1] - b[1])] : []))
    .sort((p, q) => p - q);
  const unit = lengths[Math.floor(lengths.length / 2)] ?? SPREAD_UNIT;
  const seeds = new Map<string, [number, number, number]>();
  shape.things.forEach((t, i) => {
    const [x, y] = at.get(t.key) ?? [0, 0];
    // down the page is back along the space, as spaceOf lifts it: so the drawing's top is at the top of the view
    seeds.set(t.key, [x / unit, -y / unit, ((i % 3) - 1) * 0.1]);
  });
  return { seeds, unit };
}

/**
 * `marks` laid out in space as spheres and arrows, starting from `previous` spots where a thing has one. It gives
 * back the spots used too, so the next layout can start from them. Each sphere keeps the style of the box it stands for.
 * With `cards`, each thing is a card the size of its box instead (space-cards.ts), its links running to its middle.
 * With `asDrawn`, each thing stays where the drawing put it, across and down, and only its depth is laid out
 * (space_follows_type). The View menu's `layout` spaces it, as it spaces the flat drawing (layout_saved_with_view).
 * `planes` puts kinds in order each on a plane of their own, by each thing's lane (layout_kind_lanes). A layout the
 * person chose in rows, or a plug-in's, keeps its places too, so the same choice shows in every view (layout_plugins).
 */
export function spreadSpace(
  marks: readonly DrawMark[],
  previous?: Spots<3>,
  cards = false,
  asDrawn = false,
  layout?: Partial<LayoutOptions>,
  planes: ReadonlyMap<string, number> = new Map(),
): { space: SpaceMarks; spots: Spots<3> } {
  const shape = shapeOfMarks(marks);
  const strategy = layoutOptions(layout).strategy;
  const middles = asDrawn || (strategy !== 'auto' && strategy !== 'spread') ? middlesOf(marks) : null;
  const drawn = middles && drawnSpots(shape, middles);
  // space is roomier than a page. Things laid out afresh sit further apart there, so how they link shows (Roger, 25 Oct
  // 2026: "give more spacing between the blocks")
  const options = layoutOptions(layout);
  // laid out afresh, a trunk's joints are set between its groups once the things are laid out (space-parts.ts)
  const things = drawn ? shape : withoutJoints(shape);
  const laid = FORCE_3D.place(things, drawn?.seeds ?? previous, drawn ? options : roomier(options));
  // laid out again from last time's spots, each part stays where it was (cluster_in_place); afresh, they are packed
  const packed = drawn ? laid : jointsBetween(shape, previous ? laid : partsNear(things, laid));
  const spots = planes.size ? onPlanes(packed, planes) : packed;
  const count = new Map<string, number>();
  for (const l of shape.links)
    if (l.from !== l.to) for (const end of [l.from, l.to]) count.set(end, (count.get(end) ?? 0) + 1);
  const centre = new Map<string, Vec3>(),
    radius = new Map<string, number>();
  const blocks: Block[] = [];
  const labels: SpaceLabel[] = [];
  const done = new Set<string>();
  const boxes = marks.filter((m): m is DrawMark & { kind: 'box'; of: string } => {
    if (m.kind !== 'box' || m.of === undefined || done.has(m.of)) return false;
    done.add(m.of);
    return true;
  });
  for (const m of boxes) {
    const [x, y, z] = spots.get(m.of) ?? [0, 0, 0],
      unit = drawn?.unit ?? (cards ? SPREAD_UNIT * CARD_SPREAD : SPREAD_UNIT),
      page = middles?.get(m.of);
    centre.set(m.of, page ? [page[0], -page[1], z * unit] : [x * unit, y * unit, z * unit]);
    radius.set(
      m.of,
      cards || isPoint(m) || isCluster(m.of) ? Math.max(m.width, m.height) / 2 : radiusOf(count.get(m.of) ?? 0),
    );
  }
  // things laid out afresh keep clear room round each, so links show between them (Roger, 25 Oct 2026). Things kept
  // where the drawing put them are spaced as the drawing is. A trunk's joints then sit between the things kept apart
  if (!drawn) {
    const apart = new Map([...centre].filter(([k]) => !isJoint(k)));
    keepApart(apart, radius, ROOM * options.spacing);
    for (const [k, at] of jointsBetween(shape, apart)) centre.set(k, [...at]);
  }
  for (const m of boxes) {
    const c = centre.get(m.of) as Vec3,
      r = radius.get(m.of) ?? 0;
    const block: Block = {
      id: m.id,
      style: m.style,
      of: m.of,
      x: c[0] - r,
      y: c[1] - r,
      width: 2 * r,
      depth: 2 * r,
      floor: c[2] - r,
      tall: 2 * r,
    };
    if (m.name !== undefined) block.name = m.name;
    // a folded group is a card among balls too, so its name and count always show (cluster_named_everywhere)
    if (cards || isCluster(m.of)) block.card = { width: m.width, height: m.height };
    blocks.push(block);
  }
  // a thing's name is the words its label mark says, else its own name
  const named = new Map<string, DrawMark & { kind: 'label' }>();
  for (const m of marks) if (m.kind === 'label' && m.of !== undefined && !named.has(m.of)) named.set(m.of, m);
  for (const b of blocks) {
    const words = b.of === undefined ? undefined : named.get(b.of);
    const text = words?.text ?? b.name;
    if (!text || b.of === undefined) continue;
    const c = centre.get(b.of) as Vec3;
    labels.push({
      id: words?.id ?? `${b.id}\nname`,
      style: words?.style ?? b.style,
      at: [c[0], c[1], c[2] + b.tall / 2 + NAME_SIZE],
      text,
      size: NAME_SIZE,
      of: b.of,
    });
  }
  // a group's name floats over the middle of its things, above the highest of them (space_groups)
  const groupOf = new Map(marks.flatMap((m) => (m.kind === 'box' && m.group ? [[m.id, m.group] as const] : [])));
  const groups: SpaceGroup[] = [];
  for (const m of marks) {
    if (m.kind !== 'group' || !m.name) continue;
    const inside = blocks.filter((b) => groupOf.get(b.id) === m.id);
    if (!inside.length) continue;
    groups.push({
      id: m.id,
      style: m.style,
      name: m.name,
      of: inside.flatMap((b) => (b.of === undefined ? [] : [b.of])),
      ...(m.of ? { folds: m.of } : {}),
    });
    const mid = (k: 0 | 1) => inside.reduce((t, b) => t + (centre.get(b.of ?? '')?.[k] ?? 0), 0) / inside.length;
    const top = Math.max(...inside.map((b) => b.floor + b.tall));
    labels.push({
      id: `${m.id}\ngroup`,
      style: m.style,
      at: [mid(0), mid(1), top + GROUP_SIZE * 2],
      text: m.name,
      size: GROUP_SIZE,
    });
  }

  // links between the same two things, either way round, bow apart: each one's place among them, and how many there are
  const between = new Map<string, number>(),
    seen = new Map<string, number>();
  const pairOf = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);
  for (const m of marks)
    if (m.kind === 'link' && m.from !== undefined && m.to !== undefined && m.from !== m.to)
      between.set(pairOf(m.from, m.to), (between.get(pairOf(m.from, m.to)) ?? 0) + 1);
  const lines: SpaceLine[] = [];
  const arrows: SpaceArrow[] = [];
  for (const m of marks) {
    if (m.kind !== 'link' || m.from === undefined || m.to === undefined || m.from === m.to) continue;
    const a = centre.get(m.from),
      b = centre.get(m.to);
    if (!a || !b) continue;
    const pair = pairOf(m.from, m.to),
      many = between.get(pair) ?? 1,
      nth = seen.get(pair) ?? 0;
    seen.set(pair, nth + 1);
    const along = sub(b, a),
      length = Math.hypot(...along);
    if (length < 1e-9) continue;
    // the same side for both ways round, so a link and its reverse bow away from each other
    const side = norm(m.from < m.to ? sideOf(along) : sideOf(sub(a, b)));
    const bow = (nth - (many - 1) / 2) * BOW * length;
    const mid = add(scale(add(a, b), 0.5), scale(side, bow));
    const curve = (t: number): Vec3 =>
      add(add(scale(a, (1 - t) * (1 - t)), scale(mid, 2 * t * (1 - t))), scale(b, t * t));
    // where the link leaves its first sphere and meets its last: found along the curve, by the spheres' radii
    const ra = cards ? 0 : (radius.get(m.from) ?? 0),
      rb = cards ? 0 : (radius.get(m.to) ?? 0);
    // never bigger than the ball it points to (Roger, 24 Oct 2026)
    const head = m.headless
      ? 0
      : Math.min(ARROW_MOST, cards ? ARROW_MOST : rb, Math.max(ARROW_LEAST, length * ARROW_SHARE));
    const t0 = Math.min(0.45, ra / length),
      tTip = Math.max(0.55, 1 - rb / length),
      tEnd = Math.max(0.5, tTip - head / length);
    const steps = bow === 0 ? 1 : BOW_STEPS;
    const points = Array.from({ length: steps + 1 }, (_, i) => curve(t0 + ((tEnd - t0) * i) / steps));
    const line: SpaceLine = { id: m.id, style: m.style, points, from: m.from, to: m.to };
    if (m.name) line.words = m.name;
    if (m.of !== undefined) line.of = m.of;
    lines.push(line);
    // a line drawn with no arrowhead, such as a merged link's to its trunk, has none in space either
    if (!m.headless)
      arrows.push({ id: `${m.id}\narrow`, style: m.style, tip: curve(tTip), back: curve(tEnd), size: head });
    if (m.name)
      labels.push({ id: `${m.id}\nwords`, style: m.style, at: curve(0.5), text: m.name, size: WORDS_SIZE, link: m.id });
  }
  const space: SpaceMarks = { blocks, lines, labels, arrows, round: true, ...boundsOf(blocks, lines, labels) };
  if (groups.length) space.groups = groups;
  if (cards) space.cards = true;
  return { space, spots };
}

/**
 * Pushes apart each two things whose middles, `centre`, sit closer than their radii, `radius`, and `room` between. Each
 * moves half the shortfall, along the line between them, over a few rounds. Only near things are compared: by cubes of
 * a grid. The same places give the same result.
 */
export function keepApart(centre: Map<string, Vec3>, radius: ReadonlyMap<string, number>, room: number): void {
  const keys = [...centre.keys()];
  if (keys.length < 2) return;
  const cube = 2 * Math.max(...keys.map((k) => radius.get(k) ?? 0)) + room;
  const cubeOf = (v: number) => Math.floor(v / cube);
  for (let round = 0; round < APART_ROUNDS; round++) {
    const grid = new Map<string, number[]>();
    keys.forEach((k, i) => {
      const at = (centre.get(k) as Vec3).map(cubeOf).join(' ');
      const here = grid.get(at);
      if (here) here.push(i);
      else grid.set(at, [i]);
    });
    let moved = false;
    keys.forEach((a, i) => {
      const [gx, gy, gz] = (centre.get(a) as Vec3).map(cubeOf) as [number, number, number];
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++)
          for (let oz = -1; oz <= 1; oz++)
            for (const j of grid.get(`${gx + ox} ${gy + oy} ${gz + oz}`) ?? []) {
              if (j <= i) continue;
              const b = keys[j] as string;
              const p = centre.get(a) as Vec3,
                q = centre.get(b) as Vec3;
              const least = (radius.get(a) ?? 0) + (radius.get(b) ?? 0) + room;
              let e = sub(p, q),
                d = Math.hypot(...e);
              if (d >= least) continue;
              // two things in one place part along a fixed slant, so the result is the same each time
              if (d < 1e-9) [e, d] = [[((i % 7) + 1) / 7, ((i % 5) - 2) / 5, 0.25], 1];
              const half = scale(e, (least - d) / d / 2);
              centre.set(a, add(p, half));
              centre.set(b, sub(q, half));
              moved = true;
            }
    });
    if (!moved) return;
  }
}

/** A line square to `v` that is level, or across where `v` points straight up or down. */
function sideOf(v: Vec3): Vec3 {
  const level: Vec3 = [-v[1], v[0], 0];
  return Math.hypot(...level) > 1e-9 * Math.hypot(...v) ? level : [1, 0, 0];
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(...a) || 1));
