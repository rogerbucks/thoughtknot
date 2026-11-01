// The context chip (editor spec §25, controls_chip). Roger, 1 Nov 2026: the lines over the drawing pushed it down.
// They say what is explored, how it is drawn, and when a type or rule is only looked at. They now sit in one chip. It
// floats over the top start corner of the drawing, above the card's docks. So the drawing starts right under the bar.
//
// Folded, the chip shows only what the reader must not miss: the banner of an exploration or a filter. It also
// shows each line that says a thing is only looked at or stopped (a status or an alert). The rest opens with its
// button, such as "Drawn as" and the legend of moving links. The fold is kept for the session.
import { word } from '@thoughtknot/core';

/** The lines a card puts in its chip, by their class: each said what the drawing shows, under the bar. */
export const CHIP_LINES = [
  'thoughtknot-untangle',
  'thoughtknot-type-strip',
  'thoughtknot-type-plugin',
  'thoughtknot-type-stopped',
  'thoughtknot-way-in',
  'thoughtknot-type-centre',
  'thoughtknot-type-tried',
  'thoughtknot-flow-legend-slot',
];

/** The chip: its card, where its lines go, and how to fold it. */
export interface ContextChip {
  el: HTMLElement;
  body: HTMLElement;
  fold: (folded: boolean) => void;
  folded: () => boolean;
}

/** Whether the chip was left folded in this session; folded at first. */
let keptFolded = true;

/** Builds the chip in `root`, the corner over the drawing. */
export function renderChip(root: HTMLElement): ContextChip {
  const el = root.createDiv({ cls: 'thoughtknot-chip', attr: { role: 'region', 'aria-label': word('chip.name') } });
  const toggle = el.createEl('button', { cls: 'thoughtknot-chip-fold', attr: { type: 'button' } });
  const body = el.createDiv({ cls: 'thoughtknot-chip-body' });
  let folded = keptFolded;
  const show = () => {
    el.toggleClass('is-folded', folded);
    toggle.setText(folded ? `${word('chip.name')} ▾` : `${word('chip.name')} ▴`);
    toggle.setAttribute('aria-expanded', String(!folded));
  };
  const fold = (to: boolean) => {
    folded = keptFolded = to;
    show();
  };
  toggle.addEventListener('click', () => fold(!folded));
  show();
  return { el, body, fold, folded: () => folded };
}
