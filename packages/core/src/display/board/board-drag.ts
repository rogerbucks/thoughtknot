// Dragging on a board (editor spec §45, board_view and board_handles). A drag by an item's body moves it; a drag by the
// handle at its lower right corner sizes it. While it goes, the item is drawn where it will be. A move snaps into line
// with the other items (board-snap.ts), and the lines it snapped to are drawn as guides. Alt places it freely. On the
// lift the place or size is written as one change. Nothing else on the board moves. Kept apart so board-view.ts stays small.
import { word } from '@thoughtknot/core';

import type { Board } from '../../board.ts';
import type { BoardChange } from '../../board-edit.ts';
import { MIN_SIDE } from '../../board-edit.ts';
import { snapPlace, type Guide } from '../../board-snap.ts';
import { itemBox } from '../../board-svg.ts';
import type { Point } from './board-space.ts';

/** How far a pointer moves before a press is a drag, in pixels. */
export const SLOP = 4;
/** How near another item's line a moved item snaps to it, in pixels on screen. */
const SNAP_PX = 6;
/** The side of the sizing handle, in board units. */
const HANDLE = 12;
const SVG = 'http://www.w3.org/2000/svg';

/** One drag under way. */
interface Drag {
  pointer: number;
  id: string;
  how: 'move' | 'size';
  from: Point;
  moved: boolean;
}

/** What a lift ends in: a change to write and the words to say, a tap on the item, or nothing. */
export type Lifted = { change: BoardChange; said: string } | { tap: string } | null;

/** The drag of a board's items, by body or by handle. */
export class BoardDrag {
  private drag: Drag | null = null;

  /** Whether a drag is under way. */
  get active(): boolean {
    return this.drag !== null;
  }

  /** Starts a drag of item `id`: by its handle when the press was on it, else by its body. */
  start(pointer: number, id: string, from: Point, onHandle: boolean): void {
    this.drag = { pointer, id, how: onHandle ? 'size' : 'move', from, moved: false };
  }

  /** The item drawn where the pointer has taken it, with the guides it snapped to; whether this was the drag's pointer. */
  move(board: Board, svg: SVGSVGElement | null, pointer: number, p: Point, scale: number, free: boolean): boolean {
    const d = this.drag;
    if (d?.pointer !== pointer) return false;
    if (Math.hypot(p.x - d.from.x, p.y - d.from.y) > SLOP) d.moved = true;
    const g = svg?.querySelector(`[data-item="${d.id}"]`);
    const item = board.items.find((i) => i.id === d.id);
    if (!g || !item || !svg) return true;
    const dx = (p.x - d.from.x) / scale,
      dy = (p.y - d.from.y) / scale;
    if (d.how === 'size') {
      const box = itemBox(item);
      const w = Math.max(MIN_SIDE, box.w + dx),
        h = Math.max(MIN_SIDE, box.h + dy);
      g.setAttribute(
        'transform',
        `translate(${box.x} ${box.y}) scale(${w / box.w} ${h / box.h}) translate(${-box.x} ${-box.y})`,
      );
      return true;
    }
    const to = this.placed(board, d.id, item.x + dx, item.y + dy, scale, free);
    g.setAttribute('transform', `translate(${to.x - item.x} ${to.y - item.y})`);
    drawGuides(svg, to.guides);
    return true;
  }

  /** The drag ended by `pointer`: the change it makes, a tap when it never moved, or null when it was not this drag. */
  lift(board: Board, svg: SVGSVGElement | null, pointer: number, p: Point, scale: number, free: boolean): Lifted {
    const d = this.drag;
    if (d?.pointer !== pointer) return null;
    this.drag = null;
    if (svg) drawGuides(svg, []);
    const item = board.items.find((i) => i.id === d.id);
    if (!item) return null;
    if (!d.moved) return { tap: d.id };
    const dx = (p.x - d.from.x) / scale,
      dy = (p.y - d.from.y) / scale;
    if (d.how === 'size') {
      const box = itemBox(item);
      const w = Math.round(Math.max(MIN_SIDE, box.w + dx)),
        h = Math.round(Math.max(MIN_SIDE, box.h + dy));
      return { change: { kind: 'size', id: d.id, w, h }, said: word('board.sized', { w, h }) };
    }
    const to = this.placed(board, d.id, item.x + dx, item.y + dy, scale, free);
    return { change: { kind: 'move', id: d.id, x: to.x, y: to.y }, said: word('board.moved', { x: to.x, y: to.y }) };
  }

  /** Lets go of the drag, as when the pointer is lost. */
  cancel(): void {
    this.drag = null;
  }

  private placed(board: Board, id: string, x: number, y: number, scale: number, free: boolean) {
    return free ? { x: Math.round(x), y: Math.round(y), guides: [] } : snapPlace(board, id, x, y, SNAP_PX / scale);
  }
}

/** The sizing handle drawn on the item `id` of a picture just drawn, at its lower right corner. */
export function drawHandle(svg: SVGSVGElement, board: Board, id: string | null): void {
  const item = id ? board.items.find((i) => i.id === id) : undefined;
  const g = item && svg.querySelector(`[data-item="${item.id}"]`);
  if (!item || !g || item.locked) return;
  const box = itemBox(item);
  const r = svg.ownerDocument.createElementNS(SVG, 'rect');
  r.setAttribute('class', 'thoughtknot-board-handle');
  r.setAttribute('data-handle', item.id);
  r.setAttribute('x', String(box.x + box.w - HANDLE / 2));
  r.setAttribute('y', String(box.y + box.h - HANDLE / 2));
  r.setAttribute('width', String(HANDLE));
  r.setAttribute('height', String(HANDLE));
  r.setAttribute('aria-hidden', 'true');
  g.appendChild(r);
}

/** The guides drawn over the picture, in place of any drawn before. */
function drawGuides(svg: SVGSVGElement, guides: Guide[]): void {
  for (const old of Array.from(svg.querySelectorAll('.thoughtknot-board-guide'))) old.remove();
  const vb = (svg.getAttribute('viewBox') ?? '0 0 0 0').split(/\s+/).map(Number);
  const [x0 = 0, y0 = 0, w = 0, h = 0] = vb;
  for (const g of guides) {
    const l = svg.ownerDocument.createElementNS(SVG, 'line');
    l.setAttribute('class', 'thoughtknot-board-guide');
    const at =
      'x' in g ? ['x1', g.x, 'x2', g.x, 'y1', y0, 'y2', y0 + h] : ['y1', g.y, 'y2', g.y, 'x1', x0, 'x2', x0 + w];
    for (let i = 0; i < at.length; i += 2) l.setAttribute(String(at[i]), String(at[i + 1]));
    l.setAttribute('aria-hidden', 'true');
    svg.appendChild(l);
  }
}
