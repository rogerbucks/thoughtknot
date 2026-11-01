// The phone's control sheet (editor spec §25, controls_sheet). Roger, 1 Nov 2026: each screen size gets controls that
// suit it. On a phone they sit in one sheet at the foot of the drawing, in reach of a thumb, and never shrink it.
//
// The sheet has two tabs. Controls holds the chip and the docks. Details holds what is chosen. It has three heights:
// peek, a strip of about a sixth of the drawing; half; and full. Its handle steps through them. Choosing a thing opens
// Details at peek, so the thing stays in sight above it. Closing the details goes back to Controls. Each target is
// 44 px. The height is kept for the session, so a card drawn again opens the same way.
import { word } from '@thoughtknot/core';

/** How tall the sheet stands: a strip, half the drawing, or all of it. */
export type SheetHeight = 'peek' | 'half' | 'full';
const HEIGHTS: SheetHeight[] = ['peek', 'half', 'full'];

/** The sheet's two tabs. */
type SheetTab = 'controls' | 'details';

/** The event the details send as they are shown or closed, which the sheet hears to change its tab. */
const SHOWN = 'thoughtknot-details-shown';

/** The class of the sheet, which the details look for to know they are in it. */
const SHEET = 'thoughtknot-phone-sheet';

/** How tall the sheet was left in this session; a strip at first, so the drawing comes first. */
let keptHeight: SheetHeight = 'peek';

/** Shows (`shown`) or hides the details `el`, and tells the sheet they are in, if any. */
export function detailsShown(el: HTMLElement, shown: boolean): void {
  el.hidden = !shown;
  el.dispatchEvent(new CustomEvent(SHOWN, { bubbles: true, detail: shown }));
}

/** Whether the details `el` are in a phone's sheet: then they are not pinned to the screen on their own. */
export const inPhoneSheet = (el: HTMLElement): boolean => !!el.closest?.(`.${SHEET}`);

/** The phone's sheet: its card, its panes, and how to choose a tab or a height. */
export interface ControlSheet {
  el: HTMLElement;
  controls: HTMLElement;
  details: HTMLElement;
  tab: (to: SheetTab) => void;
  height: (to: SheetHeight) => void;
}

/**
 * Builds the sheet in `layer`, the layer over the drawing of the card `root`, and puts the `corner` in its Controls
 * tab. The card's details go in its Details tab the first time they are shown.
 */
export function renderSheet(layer: HTMLElement, root: HTMLElement, corner: HTMLElement): ControlSheet {
  const el = layer.createDiv({ cls: SHEET, attr: { role: 'region', 'aria-label': word('sheet.name') } });
  const handle = el.createEl('button', { cls: 'thoughtknot-phone-sheet-handle', attr: { type: 'button' } });
  const strip = el.createDiv({ cls: 'thoughtknot-phone-sheet-tabs', attr: { role: 'tablist' } });
  const panes = { controls: el.createDiv(), details: el.createDiv() };
  const tabs = {} as Record<SheetTab, HTMLButtonElement>;
  for (const name of ['controls', 'details'] as SheetTab[]) {
    panes[name].addClass('thoughtknot-phone-sheet-pane');
    panes[name].setAttribute('role', 'tabpanel');
    panes[name].setAttribute('aria-label', word(`sheet.${name}`));
    tabs[name] = strip.createEl('button', {
      cls: 'thoughtknot-phone-sheet-tab',
      text: word(`sheet.${name}`),
      attr: { type: 'button', role: 'tab' },
    });
    tabs[name].addEventListener('click', () => tab(name));
  }
  panes.controls.appendChild(corner);
  let open: SheetTab = 'controls',
    tall = keptHeight;
  const tab = (to: SheetTab) => {
    open = to;
    for (const name of ['controls', 'details'] as SheetTab[]) {
      tabs[name].setAttribute('aria-selected', String(name === open));
      panes[name].hidden = name !== open;
    }
  };
  const height = (to: SheetHeight) => {
    tall = keptHeight = to;
    for (const h of HEIGHTS) el.toggleClass(`is-${h}`, h === tall);
    handle.setAttribute('aria-label', word('sheet.height', { height: word(`sheet.${tall}`) }));
  };
  // the handle steps up through the heights, then back down to the strip
  handle.addEventListener('click', () => height(HEIGHTS[(HEIGHTS.indexOf(tall) + 1) % HEIGHTS.length]));
  // the details, shown, come into the sheet and open at peek. Closed, the sheet goes back to its controls.
  root.addEventListener(SHOWN, (e: Event) => {
    const details = e.target as HTMLElement,
      shown = (e as CustomEvent<boolean>).detail;
    if (shown && details.parentElement !== panes.details) panes.details.appendChild(details);
    if (shown && tabs.details.hidden) height('peek'); // only as they open: a thing chosen after keeps the height
    tabs.details.hidden = !shown;
    tab(shown ? 'details' : 'controls');
  });
  tabs.details.hidden = true;
  tab('controls');
  height(tall);
  return { el, controls: panes.controls, details: panes.details, tab, height };
}
