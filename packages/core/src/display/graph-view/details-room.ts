// A room's details on the new rendering (editor spec §73, render_room_folders). The first click on a room picks it,
// and its details say how much is in it and list what is in it by name. A name is a choice: a room picks that room,
// and a thing opens its own details. Roger, 9 Nov 2026: names, not dots.
import { thingButton } from './details-nav';
import type { StageRoom } from './stage-rooms';

export type { StageRoom } from './stage-rooms';

/** Fills the details `el` with room `r`: a sentence, then what is in it, by name. */
export function roomDetails(el: HTMLElement, r: StageRoom): void {
  el.createEl('p', { cls: 'thoughtknot-details-said', text: r.said });
  const ul = el.createEl('ul', { cls: 'thoughtknot-room-parts' });
  for (const p of r.parts) thingButton(ul.createEl('li'), p.name, p.go);
}
