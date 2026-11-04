// The subjects on the mini-map (editor spec §68, level_mini_map). Roger approved this from the UX review, 3 Nov 2026.
// The mini-map shows each subject as a soft patch of its colour behind its boxes. So the whole map of subjects is
// always in view, however far in you have flown. It is drawn from the boxes already on the mini-map, so nothing is
// laid out again, and nothing moves.
import type { DetailLevel } from '../../detail-levels.ts';
import { hueOf } from './level-colours.ts';

/** The namespace every SVG element is made in. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** A box on the mini-map, in the drawing's units. */
export interface MiniBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One subject's patch: its group key, its name, its colour, and the box around its things. */
export interface MiniHull extends MiniBox {
  key: string;
  name: string;
  hue: number;
}

/** How far a patch reaches past its boxes, as a share of the drawing's shorter side. */
const MARGIN = 0.02;

/**
 * The patch of each subject (the farthest level's groups) of `levels`, around the boxes of its things. `boxOf` gives a
 * thing's box by its key; a subject none of whose things has a box gets no patch. None for a drawing of one level.
 */
export function subjectHulls(
  levels: readonly DetailLevel[] | null,
  boxOf: (key: string) => MiniBox | undefined,
  side: number,
): MiniHull[] {
  if (!levels || levels.length < 2) return [];
  const pad = side * MARGIN;
  const out: MiniHull[] = [];
  for (const g of levels[0]?.groups ?? []) {
    const boxes = g.things.map(boxOf).filter((b): b is MiniBox => !!b);
    if (!boxes.length) continue;
    const x = Math.min(...boxes.map((b) => b.x)) - pad,
      y = Math.min(...boxes.map((b) => b.y)) - pad;
    const width = Math.max(...boxes.map((b) => b.x + b.width)) + pad - x,
      height = Math.max(...boxes.map((b) => b.y + b.height)) + pad - y;
    out.push({ key: g.key, name: g.name, hue: hueOf(levels, g.key), x, y, width, height });
  }
  return out;
}

/** Draws `hulls` into the mini-map `svg`, behind its boxes, in place of any drawn before. */
export function drawHulls(svg: SVGSVGElement, hulls: readonly MiniHull[]): void {
  for (const old of Array.from(svg.querySelectorAll('.thoughtknot-mini-cloud'))) old.remove();
  const first = Array.from(svg.children)[0] ?? null;
  // made by the mini-map's own document, so a drawing in a popout window works as in the main one
  const doc = svg.ownerDocument;
  const el = (tag: string, attrs: Record<string, string | number>) => {
    const e = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  };
  for (const h of hulls) {
    const r = el('rect', {
      class: 'thoughtknot-mini-cloud',
      x: h.x,
      y: h.y,
      width: h.width,
      height: h.height,
      rx: Math.min(h.width, h.height) / 4,
      'data-hue': h.hue,
      'data-subject': h.key,
    });
    r.appendChild(el('title', {})).textContent = h.name;
    svg.insertBefore(r, first);
  }
}
