// Where a dock floats over the drawing (editor spec §25, controls_panels). Roger, 2 Nov 2026: the controls are panels
// that can be docked, minimised and moved. A dock sits in one of three places. At the start, it is part of the
// controls card in the top start corner. At the end, it is part of a card like it in the top end corner. Free, it is
// a card of its own wherever it was put. Its head has a grip and two dock buttons. Drag the head to move it. With the
// grip in focus, the arrow keys move it free, Home docks it at the start and End at the end. Dropped near a side, it
// docks there. Where each dock was left is kept for the session, by its name. Moving a dock never moves the drawing.
import { word } from '@thoughtknot/core';
import { button } from '../button.ts';

/** Where a dock is: in the start or end corner's card, or free at `x`, `y` in the layer over the drawing. */
export interface DockPlace {
  side: 'start' | 'end' | 'free';
  x: number;
  y: number;
}

/** How near a side, in pixels, a dock dropped there docks to it. */
export const SNAP = 24;
/** How far one press of an arrow key moves a free dock. */
export const KEY_MOVE = 16;
/** How far one press of an arrow key moves it with Shift held. */
export const KEY_MOVE_FAR = 64;

/** Where each dock was left in this session, by its name. */
const kept = new Map<string, DockPlace>();

/** The place of a dock of width `w` and height `h` put at `x`, `y` in a layer `room` wide and high: kept inside it. */
export function placeIn(x: number, y: number, w: number, h: number, room: { w: number; h: number }): DockPlace {
  const at = (v: number, size: number, max: number) => Math.round(Math.max(0, Math.min(v, Math.max(0, max - size))));
  const free: DockPlace = { side: 'free', x: at(x, w, room.w), y: at(y, h, room.h) };
  if (free.x <= SNAP) return { ...free, side: 'start' };
  if (free.x + w >= room.w - SNAP) return { ...free, side: 'end' };
  return free;
}

/** The layer over the drawing that `el` floats in, if it is in one (not on a phone, where the sheet holds it). */
const layerOf = (el: HTMLElement): HTMLElement | null => {
  const layer = el.closest<HTMLElement>('.thoughtknot-over');
  return layer && !el.closest('.thoughtknot-phone-sheet') ? layer : null;
};

/** The card in the `side` corner of `layer`, made the first time a dock goes there. */
function cornerAt(layer: HTMLElement, side: 'start' | 'end'): HTMLElement {
  const cls = side === 'start' ? 'thoughtknot-corner-start' : 'thoughtknot-corner-end';
  const found = Array.from(layer.children).find((c) =>
    side === 'start'
      ? c.classList.contains('thoughtknot-corner') && !c.classList.contains('thoughtknot-corner-end')
      : c.classList.contains(cls),
  );
  return (found as HTMLElement | undefined) ?? layer.createDiv({ cls: ['thoughtknot-corner', cls] });
}

/** Puts the dock `el`, named `name`, at `place` in the layer it floats in, and keeps that for the session. */
export function placeDock(el: HTMLElement, name: string, place: DockPlace): void {
  const layer = layerOf(el);
  if (!layer) return;
  kept.set(name, place);
  el.toggleClass('is-free', place.side === 'free');
  el.setAttribute('data-place', place.side);
  if (place.side === 'free') {
    layer.appendChild(el);
    el.setCssProps({ '--thoughtknot-at-x': `${place.x}px`, '--thoughtknot-at-y': `${place.y}px` });
  } else cornerAt(layer, place.side).appendChild(el);
}

/** Puts the dock `el` back where it was left in this session, if it was moved. */
export function keepPlace(el: HTMLElement, name: string): void {
  const was = kept.get(name);
  if (was && was.side !== 'start') placeDock(el, name, was);
}

/** Where the dock `el` is now, in the layer it floats in. */
function placeNow(el: HTMLElement, layer: HTMLElement): DockPlace {
  const box = el.getBoundingClientRect(),
    room = layer.getBoundingClientRect();
  const side = (el.getAttribute('data-place') as DockPlace['side'] | null) ?? 'start';
  return { side, x: box.left - room.left, y: box.top - room.top };
}

/** The size of the room a dock may float in: the layer's width, and the drawing's height. */
function roomOf(layer: HTMLElement): { w: number; h: number } {
  const r = layer.getBoundingClientRect();
  const h = layer.parentElement?.querySelector<HTMLElement>('.thoughtknot-viewport')?.clientHeight ?? r.height;
  return { w: r.width, h: h || r.height };
}

/** Moves the dock `el` to `x`, `y` in its layer, docking it when that is near a side. */
function moveTo(el: HTMLElement, name: string, x: number, y: number): void {
  const layer = layerOf(el);
  if (!layer) return;
  const box = el.getBoundingClientRect();
  placeDock(el, name, placeIn(x, y, box.width, box.height, roomOf(layer)));
}

/** Gives the dock `el`, named `name`, its grip and dock buttons in `head`, and lets its head drag it. */
export function frameDock(el: HTMLElement, head: HTMLElement, name: string): void {
  const grip = button(head, word('dock.move', { name }), 'move', () => undefined);
  grip.addClass('thoughtknot-dock-grip');
  grip.addEventListener('keydown', (e: KeyboardEvent) => {
    const layer = layerOf(el);
    if (!layer) return;
    const by = e.shiftKey ? KEY_MOVE_FAR : KEY_MOVE;
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, -by],
      ArrowDown: [0, by],
    };
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      placeDock(el, name, { ...placeNow(el, layer), side: e.key === 'Home' ? 'start' : 'end' });
    } else {
      const d = step[e.key];
      if (!d) return;
      e.preventDefault();
      const now = placeNow(el, layer),
        [dx, dy] = d;
      const box = el.getBoundingClientRect();
      // a step frees it from the card it was docked in; Home and End dock it again
      const to = placeIn(now.x + dx, now.y + dy, box.width, box.height, roomOf(layer));
      placeDock(el, name, { ...to, side: 'free' });
    }
    grip.focus(); // moved to another card, it keeps the focus
  });
  const sides = head.createDiv({ cls: 'thoughtknot-dock-place' });
  button(sides, word('dock.to-start', { name }), 'panel-left', () => {
    const layer = layerOf(el);
    if (layer) placeDock(el, name, { ...placeNow(el, layer), side: 'start' });
  });
  button(sides, word('dock.to-end', { name }), 'panel-right', () => {
    const layer = layerOf(el);
    if (layer) placeDock(el, name, { ...placeNow(el, layer), side: 'end' });
  });
  // the head drags it: from where the pointer took hold, kept under the pointer, and let go where it is dropped
  head.addEventListener('pointerdown', (e: PointerEvent) => {
    const layer = layerOf(el);
    if (!layer || e.button !== 0 || (e.target as Element | null)?.closest?.('button:not(.thoughtknot-dock-grip)'))
      return;
    const now = placeNow(el, layer),
      room = layer.getBoundingClientRect();
    const hold = { x: e.clientX - room.left - now.x, y: e.clientY - room.top - now.y };
    head.setPointerCapture?.(e.pointerId);
    el.addClass('is-moving');
    const move = (m: PointerEvent) => {
      const r = layer.getBoundingClientRect(),
        box = el.getBoundingClientRect();
      const to = placeIn(m.clientX - r.left - hold.x, m.clientY - r.top - hold.y, box.width, box.height, roomOf(layer));
      placeDock(el, name, { ...to, side: 'free' }); // free while it moves, so it follows the pointer
    };
    const drop = (u: PointerEvent) => {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', drop);
      head.removeEventListener('pointercancel', drop);
      el.removeClass('is-moving');
      const r = layer.getBoundingClientRect();
      moveTo(el, name, u.clientX - r.left - hold.x, u.clientY - r.top - hold.y);
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', drop);
    head.addEventListener('pointercancel', drop);
  });
}
