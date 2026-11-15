// The graph views on a board, painted in (editor spec ES§45, board_view_items). Each View item is drawn by the core as
// a frame with its name. The host then draws the graph live from the note (board-views.ts), and the picture is nested
// in the frame. The last picture of each view is kept, so a board drawn again after a write never flickers empty.
// Kept apart so board-view.ts stays small.
import type { Drawn } from '@thoughtknot/core';

import type { Board } from '../../board.ts';
import { itemBox } from '../../board-svg.ts';
import { viewSpace } from '../../view-types/board-views.ts';
import { parsedSvg } from '../graph-view/drawing-svg';
import { drawHandle } from './board-drag.ts';
import { paintImages, type Pictures } from './board-images.ts';

/** What draws a View item of a board: an SVG picture its own size, or why not, in words. */
export type Viewer = (board: Board, id: string) => Promise<{ svg: string } | { refused: string }>;

/** The last picture of each view, by its board's host key, its id and its size. */
const last = new Map<string, string>();

/** The picture `svg` nested in the view `id`'s frame, in place of any drawn before. */
function nest(g: Element, board: Board, id: string, svg: string): void {
  const item = board.items.find((i) => i.id === id);
  if (!item) return;
  const box = viewSpace(item);
  const pic = parsedSvg({ svg } as Drawn);
  pic.addClass('thoughtknot-board-view-picture');
  pic.setAttribute('x', String(box.x));
  pic.setAttribute('y', String(box.y));
  pic.setAttribute('width', String(box.w));
  pic.setAttribute('height', String(box.h));
  g.querySelector('.thoughtknot-board-view-picture')?.remove();
  g.appendChild(pic);
}

/** Why a view could not be drawn, said in the middle of its frame, once. */
function said(g: Element, box: { x: number; y: number; w: number; h: number }, why: string): void {
  if (g.getAttribute('data-refused') === why) return;
  g.setAttribute('data-refused', why);
  const t = g.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('class', 'thoughtknot-board-view-refused');
  t.setAttribute('x', String(box.x + box.w / 2));
  t.setAttribute('y', String(box.y + box.h / 2));
  t.setAttribute('text-anchor', 'middle');
  t.textContent = why;
  g.appendChild(t);
}

/** Paints the View items of `board` in `svg`, each from what `viewer` draws; a view it cannot draw says why. */
export function paintViews(svg: SVGSVGElement, board: Board, viewer: Viewer | undefined, key: string): void {
  if (!viewer) return;
  for (const g of Array.from(svg.querySelectorAll('[data-view]'))) {
    const id = g.getAttribute('data-view') ?? '';
    const item = board.items.find((i) => i.id === id);
    if (!item) continue;
    const box = itemBox(item);
    const at = `${key}\n${id}\n${box.w}x${box.h}`;
    const kept = last.get(at);
    if (kept) nest(g, board, id, kept);
    void viewer(board, id)
      .then((r) => {
        if ('svg' in r) {
          last.set(at, r.svg);
          if (r.svg !== kept) nest(g, board, id, r.svg);
        } else said(g, box, r.refused);
      })
      // a picture that cannot be drawn here says why in its frame, and the board goes on
      .catch((e: unknown) => said(g, box, e instanceof Error ? e.message : String(e)));
  }
}

/** The marks the board draws over its picture once drawn: the views and pictures painted in, and the focus's handle. */
export function paintOver(
  svg: SVGSVGElement,
  board: Board,
  focus: string | null,
  readOnly: boolean,
  host: { views?: Viewer; images?: Pictures; key: string },
): void {
  paintViews(svg, board, host.views, host.key);
  paintImages(svg, board, host.images);
  if (!readOnly) drawHandle(svg, board, focus);
}
