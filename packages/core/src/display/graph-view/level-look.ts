// How the levels of detail look in 2D, as their mockup draws them (editor spec §68, level_look). Roger, 4 Nov 2026: the
// app must look like the mockup. So a cloud is soft: one puff round each thing in it, solid then fading, no outline. Its name
// sits on a frosted card in its colour, with its count. Far out each thing shows as a small dot of its colour. The
// roads between clouds are wide ribbons with their count on a chip. Nothing moves: this only draws.
import type { Rect } from '../../level-clouds.ts';
import { make } from './note-callouts.ts';
import { HUES } from './level-colours.ts';

/** The id of the fill of each hue's puffs: a solid middle that fades out at its edge, as the mockup paints them. */
export const CLOUD_FILL = 'thoughtknot-cloud-fill';
/** The sizes of a card's name and count, its padding, and a dot's radius, in pixels of the screen. */
const NAME_PX = 15,
  COUNT_PX = 11,
  PAD_PX = 8,
  DOT_PX = 2.6;
/** How strong a puff's fill is from its middle out: solid, still nearly solid halfway, then gone at its edge. */
const FADE: readonly [number, number][] = [
  [0, 1],
  [0.5, 0.9],
  [1, 0],
];

/**
 * Puts the puffs' fills in `svg`'s defs once, one for each hue: a solid middle that fades out at the edge. So a cloud
 * has a clear shape, not a smear (Roger, 5 Nov 2026: the definition of the mockups).
 */
export function cloudFills(svg: SVGSVGElement): void {
  let defs = Array.from(svg.children).find((c) => c.tagName.toLowerCase() === 'defs');
  if (!defs) {
    defs = make('defs', {});
    svg.insertBefore(defs, svg.firstChild);
  }
  for (let hue = 0; hue < HUES; hue++) {
    const id = `${CLOUD_FILL}-${hue}`;
    if (Array.from(defs.children).some((c) => c.getAttribute('id') === id)) continue;
    const fill = make('radialGradient', { id });
    for (const [offset, opacity] of FADE)
      fill.appendChild(
        make('stop', { class: 'thoughtknot-cloud-stop', 'data-hue': hue, offset, 'stop-opacity': opacity }),
      );
    defs.appendChild(fill);
  }
}

/** How far each puff reaches toward its usual neighbour: past halfway, so neighbours merge into one shape. */
const MERGE = 0.75;
/** The most things measured for their spacing: enough to know a cloud's grain, and quick for a big one. */
const SAMPLE = 300;

/** How far apart the things of `rects` usually are: the middle of each one's distance to its nearest neighbour. */
export function spacing(rects: readonly Rect[]): number {
  const step = Math.max(1, Math.ceil(rects.length / SAMPLE));
  const mids = rects
    .filter((_, i) => i % step === 0)
    .map((r): [number, number] => [(r.left + r.right) / 2, (r.top + r.bottom) / 2]);
  if (mids.length < 2) return 0;
  const nearest = mids.map(([x, y], i) =>
    Math.min(...mids.map(([u, v], j) => (i === j ? Infinity : Math.hypot(u - x, v - y)))),
  );
  return nearest.sort((a, b) => a - b)[Math.floor(nearest.length / 2)] ?? 0;
}

/** One circle round each of `rects`, grown by `pad`, in the fill of `hue`: together they make one shape. */
function round(cls: string, rects: readonly Rect[], pad: number, hue: number): Element {
  const g = make('g', { class: cls, 'data-hue': hue });
  const at = (n: number) => Math.round(n * 100) / 100;
  // each puff reaches most of the way to its neighbours, so a cloud stays one shape however near you zoom
  pad = Math.max(pad, spacing(rects) * MERGE);
  for (const r of rects)
    g.appendChild(
      make('circle', {
        cx: at((r.left + r.right) / 2),
        cy: at((r.top + r.bottom) / 2),
        r: at(Math.max(r.right - r.left, r.bottom - r.top) / 2 + pad),
        fill: `url(#${CLOUD_FILL}-${hue})`,
      }),
    );
  return g;
}

/** One puff round each of `rects`, grown by `pad`, in `hue`: the cloud is faded as a whole, so overlaps never darken. */
export const puffs = (rects: readonly Rect[], pad: number, hue = 0): Element =>
  round('thoughtknot-cloud', rects, pad, hue);

/**
 * The region of a subject: a wide faint shape of its colour round each of `rects`, grown by `pad`. It lies under
 * every level's clouds, so you always see whose ground you are on (level_regions).
 */
export const region = (rects: readonly Rect[], pad: number, hue: number): Element =>
  round('thoughtknot-region', rects, pad, hue);

/** A small dot of its cloud's colour where each of `rects` is, `k` pixels a unit: far out, a thing shows as this. */
export function dots(rects: readonly Rect[], k: number): Element {
  const g = make('g', { class: 'thoughtknot-cloud-dots' });
  const at = (n: number) => Math.round(n * 100) / 100;
  for (const r of rects)
    g.appendChild(
      make('circle', { cx: at((r.left + r.right) / 2), cy: at((r.top + r.bottom) / 2), r: at(DOT_PX / k) }),
    );
  return g;
}

/** A frosted card at `x`, `y` (its middle) with `name` and, below it, `count`, at `k` pixels a unit. */
export function card(x: number, y: number, name: string, count: string, k: number): Element {
  const g = make('g', { class: 'thoughtknot-cloud-card-svg' });
  // the card's width from its words, as a font about 0.6 of its size wide for each letter
  const wide = Math.max(name.length * NAME_PX * 0.6, count.length * COUNT_PX * 0.58) + PAD_PX * 2;
  const high = NAME_PX * 1.3 + COUNT_PX * 1.4 + PAD_PX;
  const u = (px: number) => Math.round((px / k) * 100) / 100;
  g.appendChild(
    make('rect', {
      class: 'thoughtknot-cloud-card-back',
      x: Math.round((x - u(wide) / 2) * 100) / 100,
      y: Math.round((y - u(high) / 2) * 100) / 100,
      width: u(wide),
      height: u(high),
      rx: u(10),
    }),
  );
  const text = (cls: string, dy: number, px: number, words: string) => {
    const t = make('text', { class: cls, x, y: Math.round((y + u(dy)) * 100) / 100, 'text-anchor': 'middle' });
    t.setAttribute('font-size', String(u(px)));
    t.textContent = words;
    g.appendChild(t);
  };
  text('thoughtknot-cloud-name', -high / 2 + PAD_PX / 2 + NAME_PX, NAME_PX, name);
  text('thoughtknot-cloud-count', high / 2 - PAD_PX / 2 - COUNT_PX * 0.3, COUNT_PX, count);
  return g;
}
