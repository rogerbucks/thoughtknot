// Two small parts of a board's screen (editor spec §45, board_view). One is the wheel, double click and touch lift
// that the core's Zoom answers. The other is the outline listed as text. Kept apart so board-view.ts stays small.
import { word } from '@thoughtknot/core';
import type { Zoom } from '@thoughtknot/core';

import type { Board } from '../../board.ts';
import { boardOutline } from '../../board-svg.ts';

import { fromTrackpad } from '../../render/render-tilt.ts';

/** Gives the viewport's wheel, double click and touch end to `zoom`; `point` is where an event is in the viewport. */
export function bindWheel(
  vp: HTMLElement,
  zoom: Zoom,
  point: (e: { clientX: number; clientY: number }) => { x: number; y: number },
): void {
  const wheel = (e: WheelEvent) => {
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const keys = { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, pad: fromTrackpad(e) };
    if (zoom.handle({ kind: 'wheel', ...point(e), dy, ...keys })) e.preventDefault();
  };
  vp.addEventListener('wheel', wheel, { passive: false });
  vp.addEventListener('dblclick', (e: MouseEvent) => {
    const onBox = !!(e.target as Element | null)?.closest?.('[data-item]');
    if (zoom.handle({ kind: 'dblclick', ...point(e), onBox })) e.preventDefault();
  });
  vp.addEventListener('touchend', (e: TouchEvent) => zoom.settle(e.touches?.length ?? 0));
}

/** The outline's place under a board in `root`, folded at first; the list it gives back is filled by `outlined`. */
export function outlineIn(root: HTMLElement): HTMLElement {
  const outline = root.createEl('details', { cls: 'thoughtknot-board-outline' });
  outline.createEl('summary', { text: word('board.outline') });
  return outline.createEl('ul');
}

/** The outline of `board` listed in `list` as text, one line to an item. */
export function outlined(list: HTMLElement, board: Board): void {
  list.empty();
  for (const line of boardOutline(board))
    list.createEl('li', { text: line.said, attr: { 'data-item': line.id, 'data-depth': line.depth } });
  if (!board.items.length) list.createEl('li', { text: word('board.empty') });
}
