// How the levels of detail look in 2D, as their mockup draws them (editor spec §68, level_look). Roger, 4 Nov 2026: the
// app must look like the mockup. So a cloud is soft: one blurred puff round each thing in it, and no outline. Its name
// sits on a frosted card in its colour, with its count. Far out each thing shows as a small dot of its colour. The
// roads between clouds are wide ribbons with their count on a chip. Nothing moves: this only draws.
import type { Rect } from '../../level-clouds.ts';
import { make } from './note-callouts.ts';

/** The id of the blur that softens the puffs of a cloud into one shape. */
export const CLOUD_BLUR = 'thoughtknot-cloud-blur';
/** The id of the wider blur that softens a subject's region into a wash. */
export const REGION_BLUR = 'thoughtknot-region-blur';
/** The sizes of a card's name and count, its padding, and a dot's radius, in pixels of the screen. */
const NAME_PX = 15,
  COUNT_PX = 11,
  PAD_PX = 8,
  DOT_PX = 2.6;

/** The blur `id` (the clouds' by default), put once in `svg`'s defs, `soft` units wide in the drawing. */
export function cloudBlur(svg: SVGSVGElement, soft: number, id = CLOUD_BLUR): void {
  let defs = Array.from(svg.children).find((c) => c.tagName.toLowerCase() === 'defs');
  if (!defs) {
    defs = make('defs', {});
    svg.insertBefore(defs, svg.firstChild);
  }
  let filter = Array.from(defs.children).find((c) => c.getAttribute('id') === id);
  if (!filter) {
    filter = make('filter', { id, x: '-50%', y: '-50%', width: '200%', height: '200%' });
    filter.appendChild(make('feGaussianBlur', { stdDeviation: 1 }));
    defs.appendChild(filter);
  }
  filter.firstElementChild?.setAttribute('stdDeviation', String(Math.round(soft * 100) / 100));
}

/** One soft puff round each of `rects`, grown by `pad`, as a group the blur softens. */
export function puffs(rects: readonly Rect[], pad: number): Element {
  const g = make('g', { class: 'thoughtknot-cloud', filter: `url(#${CLOUD_BLUR})` });
  for (const r of rects) {
    const w = r.right - r.left,
      h = r.bottom - r.top;
    const at = (n: number) => Math.round(n * 100) / 100;
    g.appendChild(
      make('circle', {
        cx: at(r.left + w / 2),
        cy: at(r.top + h / 2),
        r: at(Math.max(w, h) / 2 + pad),
      }),
    );
  }
  return g;
}

/**
 * The region of a subject: a wide soft wash of its colour round each of `rects`, grown by `pad`. It lies under every
 * level's clouds, so you always see whose ground you are on (level_regions).
 */
export function region(rects: readonly Rect[], pad: number, hue: number): Element {
  const g = make('g', { class: 'thoughtknot-region', filter: `url(#${REGION_BLUR})`, 'data-hue': hue });
  const at = (n: number) => Math.round(n * 100) / 100;
  for (const r of rects)
    g.appendChild(
      make('circle', {
        cx: at((r.left + r.right) / 2),
        cy: at((r.top + r.bottom) / 2),
        r: at(Math.max(r.right - r.left, r.bottom - r.top) / 2 + pad),
      }),
    );
  return g;
}

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
