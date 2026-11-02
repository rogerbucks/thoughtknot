// The View menu and the dock, greyed where a view cannot take an option (editor spec §68, view_options_everywhere).
// Roger, 2 Nov 2026: options must work the same in every view. Where one cannot, it stays where it always is, greyed,
// with a line saying why (view-support.ts). It never just vanishes, so the menu looks the same in every view.
import { word } from '@thoughtknot/core';
import { VIEW_OPTIONS, notHereSaid, viewSupport } from '../../view-support.ts';
import type { NotHere, ViewOption } from '../../view-support.ts';
import { OPTION_ATTRIBUTE } from '../../view-menu-rows.ts';

/** The View menu, as greying it needs: its rows, and its redraw, which the greying follows. */
export interface MenuToGrey {
  el: HTMLElement;
  refresh: () => void;
}

/** The class on a row, or a dock control, that `view` cannot take. */
export const NOT_HERE_CLASS = 'is-not-here';

/** What `view` cannot take, each with why. */
export function notHereIn(view: string): Map<ViewOption, NotHere> {
  const off = new Map<ViewOption, NotHere>();
  for (const o of VIEW_OPTIONS) {
    const s = viewSupport(view, o);
    if (s !== 'yes') off.set(o, s);
  }
  return off;
}

/**
 * Greys each row of `menu`, and each control of the dock in `root`, that `view` cannot take. Each says why in its hint
 * line, read with it by a screen reader. Each redraw of the menu greys them again, as the dock's own redraw enables them.
 */
export function greyNotHere(root: HTMLElement, menu: MenuToGrey, view: string): void {
  const off = notHereIn(view);
  if (!off.size) return;
  const grey = () => {
    for (const row of [...rowsIn(menu.el), ...rowsIn(root.querySelector<HTMLElement>('.thoughtknot-view-dock'))]) {
      const why = off.get(row.getAttribute(OPTION_ATTRIBUTE) as ViewOption);
      if (why) greyed(row, why);
    }
    const semantic = off.get('semantic');
    // semantic zoom is one of the Lens list's choices: greyed alone where the other lenses still work
    const choice = menu.el.querySelector<HTMLSelectElement>(`[${OPTION_ATTRIBUTE}="lens"] select`);
    for (const o of semantic ? Array.from(choice?.querySelectorAll('option') ?? []) : [])
      if (o.getAttribute('value') === 'semantic') o.setAttribute('disabled', '');
  };
  const was = menu.refresh;
  menu.refresh = () => (was(), grey());
  grey();
}

/** The rows in `el` that name an option, `el` itself among them. */
function rowsIn(el: HTMLElement | null): HTMLElement[] {
  if (!el) return [];
  const rows = Array.from(el.querySelectorAll<HTMLElement>(`[${OPTION_ATTRIBUTE}]`));
  return el.hasAttribute(OPTION_ATTRIBUTE) ? [el, ...rows] : rows;
}

/** `row` greyed: what it holds can no longer be pressed or changed, and its hint says why. */
function greyed(row: HTMLElement, why: NotHere): void {
  const said = word(notHereSaid(why));
  row.addClass(NOT_HERE_CLASS);
  row.setAttribute('aria-disabled', 'true');
  row.setAttribute('title', said);
  const controls = Array.from(row.querySelectorAll<HTMLElement>('button, input, select'));
  for (const c of row.matches('button') ? [row, ...controls] : controls) c.setAttribute('disabled', '');
  // a switch's hint line says why instead of what it does; any other row gains a line saying why, once
  const hint = row.querySelector<HTMLElement>('.thoughtknot-switch-hint');
  if (row.matches('button') && hint) hint.setText(said);
  else if (!row.matches('button') && !row.querySelector(`.${NOT_HERE_CLASS}-why`))
    row.createDiv({ cls: ['thoughtknot-switch-hint', `${NOT_HERE_CLASS}-why`], text: said });
}
