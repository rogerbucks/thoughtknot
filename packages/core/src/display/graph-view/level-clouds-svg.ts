// The levels of detail drawn in a 2D drawing (editor spec §68, level_clouds), for the graph view's viewer-aids.ts.
// Roger, 3 Nov 2026: far out, show the subjects as clouds with their names; zoom in for areas, topics, then every item.
//
// Each time the view changes, the level that fits the things on screen is found (detail-levels.ts, levelAt). Its groups are drawn
// as clouds under the things (level-clouds.ts), each named with its count at a readable size. While a level of groups
// shows, the things fade so the clouds read first (the class FAR). At the last level the clouds go, and every item shows
// as drawn. Nothing moves: the things stay put and the drawing's own attributes are left as drawn.
import { detailLevels, levelAt, levelBadge } from '../../detail-levels.ts';
import type { DetailLevel } from '../../detail-levels.ts';
import { cloudsAt } from '../../level-clouds.ts';
import { roadsAt } from '../../level-roads.ts';
import type { Cloud, Rect } from '../../level-clouds.ts';
import { spreadTags, tagWidth } from '../../level-tags.ts';
import { word } from '../../words.ts';
import { hueOf, subjectOf } from './level-colours.ts';
import type { GraphDrawing } from '../../note-reading.ts';
import { shapeOf } from '../../types-shape.ts';
import type { GraphShape } from '../../types-shape.ts';
import type { Graph } from '@thoughtknot/graph-spec';
import { BY_KIND, ownChoices, withOwnLevel } from '../../own-levels.ts';
import { namedLevels } from '../../named-levels.ts';
import type { OwnLevel } from '../../own-levels.ts';
import { make } from './note-callouts.ts';
import { REGION_BLUR, card, cloudBlur, dots, puffs, region } from './level-look.ts';
import { outlineOf, shownOf } from './readable-names.ts';

/** The class of the group that holds the clouds, the first in the drawing's top group so it is under everything. */
export const CLOUDS = 'thoughtknot-clouds';
/** The class of the group that holds the subjects' regions, under the clouds at every level (level_regions). */
export const REGIONS = 'thoughtknot-regions';
/** The class on the drawing while a level of groups shows: its things fade so the clouds read first. */
export const FAR = 'thoughtknot-far';
/** The room round a cloud's things, and the size of its name, in pixels of the screen. */
const PAD_PX = 14;
/** The size of a preview's names and of its hint, in pixels. */
const PEEK_PX = 12,
  HINT_PX = 11;
/** The room between a road's two lanes, how far its gate sits from its port, and the size of a gate's words, in pixels. */
const LANE_PX = 5,
  GATE_PX = 26,
  GATE_NAME_PX = 11;
/** How far a signpost sits from its cloud's middle, toward where it leads, and how far a region reaches past its things. */
const POST_PX = 80,
  REGION_PX = 46;
/** The most signposts by one cloud: the busiest ways out. */
const POSTS_MOST = 1;

/** The things in each cloud drawn now, by the cloud's key, for each drawing's SVG: what a tap on a cloud flies to. */
const held = new WeakMap<SVGSVGElement, Map<string, string[]>>();

/** The level each drawing shows now, and how many it has: for the hints and the arrow legend (level_hints). */
const shownAt = new WeakMap<Element, { at: number; count: number }>();

/** The level `svg` shows now, from 0 (farthest), and how many levels it has; null when it shows none. */
export const levelShown = (svg: Element): { at: number; count: number } | null => shownAt.get(svg) ?? null;

/** The things of the cloud `key` drawn in `svg` now; none when it shows no such cloud. */
export const cloudThings = (svg: SVGSVGElement, key: string): string[] => held.get(svg)?.get(key) ?? [];

/** The levels and links of each drawing, found once. */
const found = new WeakMap<GraphDrawing, Found>();

interface Found {
  shape: GraphShape;
  /** The levels found from the links, and those shown: with your own level put in, if you chose one. */
  found: DetailLevel[];
  levels: DetailLevel[];
  own: OwnLevel | null;
  links: { from: string; to: string }[];
  texts: Map<string, string>;
}

/** The levels of `drawing`, and its links, found the first time they are asked for. */
function foundOf(drawing: GraphDrawing, g?: Graph): Found {
  let f = found.get(drawing);
  if (!f) {
    const shape = shapeOf(drawing, g),
      levels = namedLevels(shape) ?? detailLevels(shape);
    const texts = new Map(shape.things.map((t) => [t.key, t.text]));
    f = { shape, found: levels, levels, own: null, links: shape.links, texts };
    found.set(drawing, f);
  }
  return f;
}

/** The own level chosen for `drawing`, if any (own_levels). */
export const ownLevelOf = (drawing: GraphDrawing): OwnLevel | null => foundOf(drawing).own;

/** The values `drawing`'s things could make their own level by: kind, then each property. */
export const ownChoicesOf = (drawing: GraphDrawing): string[] => ownChoices(foundOf(drawing).shape);

/** Chooses your own level for `drawing`, or none (null): its levels are worked out again. */
export function chooseOwnLevel(drawing: GraphDrawing, own: OwnLevel | null): void {
  const f = foundOf(drawing);
  f.own = own;
  const name = own?.by === BY_KIND ? word('levels.kind') : (own?.by ?? '');
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  f.levels = own ? withOwnLevel(f.found, f.shape, own, title, word('levels.none', { name: title })) : f.found;
}

/** The levels of `drawing`, with its graph `g` as read for its properties, found the first time they are asked for. */
export const levelsOf = (drawing: GraphDrawing, g?: Graph): DetailLevel[] => foundOf(drawing, g).levels;

/** The box of each thing drawn in `top`, by its key. */
function rectsOf(top: Element): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  for (const g of Array.from(top.querySelectorAll('g.node'))) {
    const key = g.getAttribute('data-key'),
      box = outlineOf(g);
    if (key && box) rects.set(key, box);
  }
  return rects;
}

/**
 * Draws in `svg` the clouds of the level of `drawing` that fits the part shown at the zoom shown now. Gives back the
 * badge that says which level shows, or null when the drawing has one level only.
 */
export function levelClouds(svg: SVGSVGElement, drawing: GraphDrawing | undefined, g?: Graph): string | null {
  const top = svg.querySelector('g.graph');
  const levels = drawing ? levelsOf(drawing, g) : [],
    shown = shownOf(svg);
  if (!top || !shown || levels.length < 2) {
    shownAt.delete(svg);
    for (const old of Array.from(top?.children ?? [])) if (old.classList.contains(CLOUDS)) old.remove();
    svg.classList.remove(FAR);
    return null;
  }
  return levelsInto(svg, top, levels, drawing, rectsOf(top), shown);
}

/**
 * Draws into `top` of `svg` the clouds of `levels` that fit the things in `rects`. They are shown in `view`, at `k`
 * pixels a unit. The view in space draws them the same way, over its canvas (level_space). Gives back the badge.
 */
export function levelsInto(
  svg: SVGSVGElement,
  top: Element,
  levels: readonly DetailLevel[],
  drawing: GraphDrawing | undefined,
  rects: ReadonlyMap<string, Rect>,
  { k, view }: { k: number; view: Rect },
): string | null {
  for (const old of Array.from(top.children))
    if (old.classList.contains(CLOUDS) || old.classList.contains(REGIONS)) old.remove();
  shownAt.delete(svg);
  if (levels.length < 2) return null;
  // the things on screen now: far out all of them, zoomed in fewer, so a nearer level fits
  const seen = new Set<string>();
  const inView = (x: number, y: number) => x >= view.left && x <= view.right && y >= view.top && y <= view.bottom;
  for (const [key, r] of rects)
    if (r.right >= view.left && r.left <= view.right && r.bottom >= view.top && r.top <= view.bottom) seen.add(key);
  const at = levelAt(levels, seen);
  shownAt.set(svg, { at, count: levels.length });
  svg.classList.toggle(FAR, at < levels.length - 1);
  if (at < levels.length - 1) {
    const group = make('g', { class: CLOUDS }),
      clouds = cloudsAt(levels, at, rects, PAD_PX / k);
    cloudBlur(svg, (PAD_PX * 1.4) / k);
    const f = drawing ? foundOf(drawing) : null,
      inside = new Map<string, string[]>();
    for (const c of clouds) {
      group.appendChild(unitOf(c, levels, at, rects, f?.texts ?? new Map(), k));
      inside.set(c.key, levels[at]?.groups.find((x) => x.key === c.key)?.things ?? []);
    }
    held.set(svg, inside);
    const parentOf = new Map((levels[at]?.groups ?? []).map((g) => [g.key, g.parent]));
    roads(group, roadsAt(levels, at, f?.links ?? [], clouds, LANE_PX / k, GATE_PX / k), clouds, k, {
      hue: (key) => hueOf(levels, subjectOf(levels, at, key)),
      inside: at > 0 ? (key) => parentOf.get(key) : undefined,
      name: (key) => levels[at]?.groups.find((g) => g.key === key)?.name ?? key,
      outName: (key) => levels[at - 1]?.groups.find((g) => g.key === key)?.name ?? key,
      inView,
    });
    unclash(group);
    top.prepend(group);
  }
  // under every level, each subject's region in a soft wash of its colour (level_regions)
  const regions = make('g', { class: REGIONS });
  cloudBlur(svg, (REGION_PX * 0.8) / k, REGION_BLUR);
  for (const g of levels[0]?.groups ?? []) {
    const rs = g.things.flatMap((t) => rects.get(t) ?? []);
    if (rs.length) regions.appendChild(region(rs, REGION_PX / k, hueOf(levels, g.key)));
  }
  top.prepend(regions);
  return levelBadge(levels, at);
}

/**
 * The roads between the clouds drawn into `group`, under the cards. Each lane is a ribbon in the colour it leaves from.
 * It is as wide as its links are many, with their count at its middle (level_look).
 */
function roads(
  group: Element,
  all: ReturnType<typeof roadsAt>,
  clouds: readonly Cloud[],
  k: number,
  how: {
    hue: (key: string) => number;
    inside?: ((key: string) => string | undefined) | undefined;
    name: (key: string) => string;
    outName: (key: string) => string;
    inView: (x: number, y: number) => boolean;
  },
): void {
  const { hue, inside, name, outName, inView } = how;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const middle = new Map(clouds.map((c) => [c.key, [(c.box.left + c.box.right) / 2, (c.box.top + c.box.bottom) / 2]]));
  const lanes = make('g', { class: 'thoughtknot-roads' });
  for (const r of all)
    for (const l of r.lanes) {
      const a = middle.get(l.from),
        b = middle.get(l.to);
      // past the first level, roads join the clouds of one cloud. One to another cloud's shows only while both are on
      // screen: otherwise a signpost points its way
      const across = !!inside && inside(l.from) !== inside(l.to);
      if (!a || !b || (across && !(inView(a[0] as number, a[1] as number) && inView(b[0] as number, b[1] as number))))
        continue;
      // a road to another cloud's is thin and faint, so the roads inside each cloud lead the eye
      const wide = across ? 2 : Math.min(13, 3 + Math.sqrt(l.count) * 2.4);
      // one gentle bend to the right of the way it runs, so the lane back runs beside it, not on it
      const [dx, dy] = [(b[0] as number) - (a[0] as number), (b[1] as number) - (a[1] as number)],
        long = Math.hypot(dx, dy) || 1;
      const [nx, ny] = [-dy / long, dx / long],
        side = (wide * 0.6 + LANE_PX) / k,
        bend = long * 0.12;
      const [x1, y1, x2, y2] = [(a[0] as number) + nx * side, (a[1] as number) + ny * side,
        (b[0] as number) + nx * side, (b[1] as number) + ny * side]; // prettier-ignore
      const [cx, cy] = [(x1 + x2) / 2 + nx * bend, (y1 + y2) / 2 + ny * bend];
      lanes.appendChild(
        make('path', {
          class: across ? 'thoughtknot-road thoughtknot-road-far' : 'thoughtknot-road',
          d: `M${round1(x1)},${round1(y1)} Q${round1(cx)},${round1(cy)} ${round1(x2)},${round1(y2)}`,
          'data-from': l.from,
          'data-to': l.to,
          'data-hue': hue(l.from),
          'stroke-width': round1(wide / k),
        }),
      );
      const t = make('text', {
        class: 'thoughtknot-road-count',
        x: round1(0.25 * x1 + 0.5 * cx + 0.25 * x2),
        y: round1(0.25 * y1 + 0.5 * cy + 0.25 * y2),
        'text-anchor': 'middle',
      });
      t.setAttribute('font-size', String(round1(GATE_NAME_PX / k)));
      t.setAttribute('data-hue', String(hue(l.from)));
      t.setAttribute('stroke-width', String(round1(3 / k)));
      t.textContent = word('levels.road-count', { count: l.count });
      if (l.count > 1 && !across) lanes.appendChild(t); // a road of one link needs no count
    }
  // where a road's far end is off screen, a signpost by its cloud points its way: "→ Money · 4" (level_roads). A link
  // to another cloud a level out is named for that cloud
  const posts = new Map<string, Post>();
  for (const r of all)
    for (const l of r.lanes)
      for (const [own, other, way] of [
        [l.from, l.to, 'out'],
        [l.to, l.from, 'back'],
      ] as const) {
        const a = middle.get(own),
          b = middle.get(other);
        if (!a || !b || !inView(a[0] as number, a[1] as number) || inView(b[0] as number, b[1] as number)) continue;
        const across = !!inside && inside(own) !== inside(other);
        const label = across ? outName(inside?.(other) ?? other) : name(other);
        const key = `${own}\u0000${label}`,
          post = posts.get(key) ?? { from: own, label, out: 0, back: 0, at: [0, 0] };
        const [dx, dy] = [(b[0] as number) - (a[0] as number), (b[1] as number) - (a[1] as number)],
          long = Math.hypot(dx, dy) || 1;
        post[way] += l.count;
        post.at = [(a[0] as number) + (dx / long) * (POST_PX / k), (a[1] as number) + (dy / long) * (POST_PX / k)];
        posts.set(key, post);
      }
  // the busiest few by each cloud, so the signposts never crowd the names
  const byCloud = new Map<string, Post[]>();
  for (const post of posts.values()) byCloud.set(post.from, [...(byCloud.get(post.from) ?? []), post]);
  for (const list of byCloud.values())
    for (const post of list.sort((x, y) => y.out + y.back - (x.out + x.back)).slice(0, POSTS_MOST)) {
      const arrow = post.out && post.back ? '⇄' : post.out ? '→' : '←';
      const t = make('text', { class: 'thoughtknot-gate', x: round1(post.at[0] ?? 0), y: round1(post.at[1] ?? 0) });
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', String(round1(GATE_NAME_PX / k)));
      t.setAttribute('data-hue', String(hue(post.from)));
      t.setAttribute('stroke-width', String(round1(3 / k)));
      t.textContent = word('levels.gate', { arrow, name: post.label, count: post.out + post.back });
      lanes.appendChild(t);
    }
  // under the clouds' cards, so every name reads (level_look)
  group.prepend(lanes);
}

/** A signpost: the cloud it stands by, where it leads, its links each way, and where it stands. */
interface Post {
  from: string;
  label: string;
  out: number;
  back: number;
  at: number[];
}

/** Moves the cards and signposts in `group` down just below any they overlap, so no two names cover each other. */
export function unclash(group: Element): void {
  const cards = Array.from(group.querySelectorAll('g.thoughtknot-cloud-card-svg')),
    gates = Array.from(group.querySelectorAll('text.thoughtknot-gate'));
  const tags = [
    ...cards.map((c) => {
      const back = c.querySelector('rect');
      const at = (name: string) => Number(back?.getAttribute(name)) || 0;
      return { x: at('x') + at('width') / 2, y: at('y') + at('height') / 2, width: at('width'), height: at('height') };
    }),
    ...gates.map((t) => {
      const px = Number(t.getAttribute('font-size')) || 1;
      const at = (name: string) => Number(t.getAttribute(name)) || 0;
      return { x: at('x'), y: at('y'), width: tagWidth(t.textContent ?? '', px), height: px * 1.2 };
    }),
  ];
  spreadTags(tags).forEach((y, i) => {
    const by = Math.round((y - (tags[i]?.y ?? y)) * 100) / 100;
    if (!by) return;
    if (i < cards.length) cards[i]?.setAttribute('transform', `translate(0 ${by})`);
    else gates[i - cards.length]?.setAttribute('y', String(Math.round(y * 100) / 100));
  });
}

/** The most names a cloud previews of the level in it. */
const PEEK_MOST = 6;

/**
 * One cloud drawn: its outline, its name with its count, and a preview of the level in it. The preview names its own
 * groups, or its biggest things when the next level is every item. It shows when the cloud is pointed at or picked.
 */
function unitOf(
  c: Cloud,
  levels: readonly DetailLevel[],
  at: number,
  rects: ReadonlyMap<string, Rect>,
  texts: ReadonlyMap<string, string>,
  k: number,
): Element {
  // each cloud takes its subject's hue, a shade lighter for each level in (level_colours)
  const subject = subjectOf(levels, at, c.key);
  // Tab reaches each cloud, and a screen reader says what it is and how to open it (level_keys)
  const unit = make('g', {
    class: 'thoughtknot-cloud-unit',
    'data-cloud': c.key,
    'data-subject': subject,
    tabindex: 0,
    role: 'button',
    'aria-label': word('levels.cloud-label', { name: c.name, count: c.count, level: levels[at]?.name ?? '' }),
  });
  const look = { 'data-hue': hueOf(levels, subject), 'data-shade': Math.min(at, 2) };
  // soft puffs round its things, a dot for each, and its name on a frosted card, as the mockup draws them (level_look)
  const inside = (levels[at]?.groups.find((g) => g.key === c.key)?.things ?? []).flatMap((t) => rects.get(t) ?? []);
  const soft = puffs(inside, PAD_PX / k);
  for (const [name, value] of Object.entries(look)) soft.setAttribute(name, String(value));
  unit.appendChild(soft);
  const dotted = dots(inside, k);
  dotted.setAttribute('data-hue', String(look['data-hue']));
  unit.appendChild(dotted);
  const label = card(c.x, (c.box.top + c.box.bottom) / 2, c.name, word('levels.card-count', { count: c.count }), k);
  label.setAttribute('data-hue', String(look['data-hue']));
  unit.appendChild(label);
  const text = (cls: string, x: number, y: number, px: number, words: string) => {
    const t = make('text', { class: cls, x, y, 'text-anchor': 'middle', 'font-size': px / k });
    t.textContent = words;
    return t;
  };
  const peek = make('g', { class: 'thoughtknot-cloud-peek' });
  const middle = (keys: readonly string[]) => {
    const rs = keys.flatMap((key) => rects.get(key) ?? []);
    return rs.length
      ? [
          rs.reduce((t, r) => t + r.left + r.right, 0) / (2 * rs.length),
          rs.reduce((t, r) => t + r.top + r.bottom, 0) / (2 * rs.length),
        ]
      : null;
  };
  const next = at + 1 < levels.length - 1 ? levels[at + 1] : null;
  const named = next
    ? next.groups.filter((g) => g.parent === c.key).map((g) => ({ words: g.name, keys: g.things }))
    : (levels[at]?.groups.find((g) => g.key === c.key)?.things ?? []).map((key) => ({
        words: texts.get(key) ?? key,
        keys: [key],
      }));
  for (const n of named.slice(0, PEEK_MOST)) {
    const m = middle(n.keys);
    if (m) peek.appendChild(text('thoughtknot-cloud-peek-name', m[0] as number, m[1] as number, PEEK_PX, n.words));
  }
  peek.appendChild(text('thoughtknot-cloud-hint', c.x, c.box.bottom + 14 / k, HINT_PX, word('levels.open')));
  unit.appendChild(peek);
  return unit;
}
