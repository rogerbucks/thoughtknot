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
import type { Rect } from '../../level-clouds.ts';
import type { GraphDrawing } from '../../note-reading.ts';
import { shapeOf } from '../../types-shape.ts';
import { make } from './note-callouts.ts';
import { outlineOf, shownOf } from './readable-names.ts';

/** The class of the group that holds the clouds, the first in the drawing's top group so it is under everything. */
export const CLOUDS = 'thoughtknot-clouds';
/** The class on the drawing while a level of groups shows: its things fade so the clouds read first. */
export const FAR = 'thoughtknot-far';
/** The room round a cloud's things, and the size of its name, in pixels of the screen. */
const PAD_PX = 14,
  NAME_PX = 14;
/** The room between a road's two lanes, how far its gate sits from its port, and the size of a gate's words, in pixels. */
const LANE_PX = 5,
  GATE_PX = 26,
  GATE_NAME_PX = 11;
/** How many colours the clouds take in turn. */
const HUES = 6;

/** The levels and links of each drawing, found once. */
const found = new WeakMap<GraphDrawing, Found>();

interface Found {
  levels: DetailLevel[];
  links: { from: string; to: string }[];
}

/** The levels of `drawing`, and its links, found the first time they are asked for. */
function foundOf(drawing: GraphDrawing): Found {
  let f = found.get(drawing);
  if (!f) {
    const shape = shapeOf(drawing);
    f = { levels: detailLevels(shape), links: shape.links };
    found.set(drawing, f);
  }
  return f;
}

/** The levels of `drawing`, found the first time they are asked for. */
export const levelsOf = (drawing: GraphDrawing): DetailLevel[] => foundOf(drawing).levels;

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
export function levelClouds(svg: SVGSVGElement, drawing: GraphDrawing | undefined): string | null {
  const top = svg.querySelector('g.graph');
  for (const old of Array.from(top?.children ?? [])) if (old.classList.contains(CLOUDS)) old.remove();
  const levels = drawing ? levelsOf(drawing) : [],
    shown = shownOf(svg);
  if (!top || !shown || levels.length < 2) {
    svg.classList.remove(FAR);
    return null;
  }
  const { k, view } = shown,
    rects = rectsOf(top);
  // the things on screen now: far out all of them, zoomed in fewer, so a nearer level fits
  const seen = new Set<string>();
  for (const [key, r] of rects)
    if (r.right >= view.left && r.left <= view.right && r.bottom >= view.top && r.top <= view.bottom) seen.add(key);
  const at = levelAt(levels, seen);
  svg.classList.toggle(FAR, at < levels.length - 1);
  if (at < levels.length - 1) {
    const group = make('g', { class: CLOUDS }),
      clouds = cloudsAt(levels, at, rects, PAD_PX / k);
    for (const c of clouds) {
      group.appendChild(make('path', { class: 'thoughtknot-cloud', d: c.path, 'data-hue': c.index % HUES }));
      const name = make('text', {
        class: 'thoughtknot-cloud-name',
        x: c.x,
        y: c.y - 4 / k,
        'text-anchor': 'middle',
        'font-size': NAME_PX / k,
      });
      name.textContent = `${c.name} · ${c.count}`;
      group.appendChild(name);
    }
    roads(group, roadsAt(levels, at, drawing ? foundOf(drawing).links : [], clouds, LANE_PX / k, GATE_PX / k), k);
    top.prepend(group);
  }
  return levelBadge(levels, at);
}

/** The roads between the clouds drawn into `group`, over the clouds: each lane, its width by its links, and its gates. */
function roads(group: Element, all: ReturnType<typeof roadsAt>, k: number): void {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  for (const r of all) {
    for (const l of r.lanes)
      group.appendChild(
        make('path', {
          class: 'thoughtknot-road',
          d: l.d,
          'data-from': l.from,
          'data-to': l.to,
          'stroke-width': round1(2 + Math.log2(l.count)),
        }),
      );
    for (const g of r.gates) {
      const t = make('text', {
        class: 'thoughtknot-gate',
        x: g.x,
        y: g.y,
        'text-anchor': 'middle',
        'font-size': GATE_NAME_PX / k,
      });
      t.textContent = g.text;
      group.appendChild(t);
    }
  }
}
