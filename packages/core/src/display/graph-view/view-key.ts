// The colour key, folded into the View panel (editor spec §25, panels_key). Roger, 7 Nov 2026: the colour key takes a
// lot of space; shrink it and make it part of the side panels. The key of subjects sat over the top of the drawing,
// under the level badge. Now it waits in a Key section near the top of the View panel, shut until opened. Each cloud's
// name already says its subject in its colour, so nothing is lost while it is shut. The badge keeps one short line: the
// level shown, and Back.
import { word } from '../../words.ts';

const KEY_CLASS = 'thoughtknot-view-key';

/**
 * The body of the Key section in the View panel `menu`, made shut the first time it is asked for. It sits just under the
 * panel's head, so it is the first thing seen when the panel opens.
 */
export function keySection(menu: HTMLElement): HTMLElement {
  const had = Array.from(menu.children).find((c) => c.classList.contains(KEY_CLASS));
  const found = had && Array.from(had.children).find((c) => c.classList.contains(`${KEY_CLASS}-body`));
  if (found) return found as HTMLElement;
  const fold = menu.createEl('details', { cls: KEY_CLASS });
  fold.createEl('summary', { text: word('view.key'), attr: { title: word('view.key-hint') } });
  const body = fold.createDiv({ cls: `${KEY_CLASS}-body` });
  // just under the head, ahead of the switches and the lists
  const kids = Array.from(menu.children),
    head = kids.findIndex((c) => c.classList.contains('thoughtknot-dock-head'));
  menu.insertBefore(fold, kids[head + 1] ?? null);
  return body;
}

/** The View panel of the view whose drawing is `viewport`, if it has one. */
export const viewMenuOf = (viewport: HTMLElement): HTMLElement | null =>
  viewport.closest('.thoughtknot-view')?.querySelector<HTMLElement>('.thoughtknot-view-menu') ?? null;
