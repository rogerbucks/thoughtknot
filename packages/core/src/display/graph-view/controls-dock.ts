// The control dock (editor spec §25, controls_dock). Roger, 1 Nov 2026: a view's key controls stay on screen, over the
// drawing and never shrinking it, with an expander for the rest. Every view's on-screen controls sit in one of these.
//
// It is a card floating in a corner of the drawing (styles.css). Its head names it and folds it. Folded, only the head
// shows, so the drawing is whole again and nothing is laid out anew. Its body holds the key controls. Under them, More
// opens the controls used less often. The fold is kept by the dock's name, in the browser too, so a card drawn again
// opens the same way. Closed, a dock stays closed, even after a restart (Roger, 5 Nov 2026). Its head also moves it, or docks it at either side (controls-place.ts). On a tablet-sized
// window a dock starts folded, as a tab at the edge. The [ key folds or opens the dock of the card in focus.
import { word } from '@thoughtknot/core';
import { frameDock } from './controls-place.ts';

/** One dock: its card, where its key controls go, where the others go, and how to fold it. */
export interface ControlDock {
  el: HTMLElement;
  /** The key controls, always shown while the dock is open. */
  body: HTMLElement;
  /** The controls used less often, shown when More is opened. */
  more: HTMLElement;
  /** Folds the dock (true) or opens it (false). */
  fold: (folded: boolean) => void;
  folded: () => boolean;
}

/** How each dock was left in this session, by its name: folded or not. */
const kept = new Map<string, boolean>();

/** Where each dock's fold is kept in the browser, by its name. */
const FOLDS_KEPT = 'thoughtknot-dock-folds';

/** The folds kept in the browser: none where it cannot keep them (a private window). */
function keptFolds(): Record<string, boolean> {
  try {
    const win = typeof activeWindow === 'undefined' ? undefined : activeWindow;
    const kept: unknown = JSON.parse(win?.localStorage.getItem(FOLDS_KEPT) ?? '{}');
    return kept && typeof kept === 'object' ? (kept as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Keeps the dock `name` folded or open in the browser, where it can. */
function keepFold(name: string, folded: boolean): void {
  try {
    const win = typeof activeWindow === 'undefined' ? undefined : activeWindow;
    win?.localStorage.setItem(FOLDS_KEPT, JSON.stringify({ ...keptFolds(), [name]: folded }));
  } catch {
    // a private window keeps it for the session only
  }
}

/** Whether a window this wide starts its docks folded: a tablet's, where the drawing needs the room. */
const narrowWindow = (): boolean => {
  const win = typeof activeWindow === 'undefined' ? undefined : activeWindow;
  return !!win?.matchMedia?.('(min-width: 600px) and (max-width: 1023px)')?.matches;
};

/** Whether a window this wide keeps its View panel open from the start: a large screen's, with room to spare. */
export const wideWindow = (): boolean => {
  const win = typeof activeWindow === 'undefined' ? undefined : activeWindow;
  return !!win?.matchMedia?.('(min-width: 1600px)')?.matches;
};

/** Builds a dock named `name` in `root`, with the classes `cls` as well as its own. */
export function renderDock(root: HTMLElement, name: string, cls: string[] = []): ControlDock {
  const el = root.createDiv({ cls: ['thoughtknot-dock', ...cls], attr: { role: 'region', 'aria-label': name } });
  const folds = dockHead(el, name);
  const body = el.createDiv({ cls: 'thoughtknot-dock-body' });
  const details = el.createEl('details', { cls: 'thoughtknot-dock-more' });
  details.createEl('summary', { text: word('dock.more') });
  const more = details.createDiv({ cls: 'thoughtknot-dock-more-body' });
  return { el, body, more, ...folds };
}

/**
 * Makes the empty `el` a dock named `name`: its head names it, moves it and folds it. Folded, only the head shows.
 * Gives back how to fold it and whether it is.
 */
export function dockHead(el: HTMLElement, name: string): Pick<ControlDock, 'fold' | 'folded'> {
  el.addClass('thoughtknot-dock');
  const head = el.createDiv({ cls: 'thoughtknot-dock-head' });
  head.createSpan({ cls: 'thoughtknot-dock-name', text: name });
  frameDock(el, head, name); // moved, and docked at either side (controls_panels)
  const toggle = head.createEl('button', { cls: 'thoughtknot-dock-fold', attr: { type: 'button' } });
  let folded = kept.get(name) ?? keptFolds()[name] ?? narrowWindow();
  const show = () => {
    el.toggleClass('is-folded', folded);
    toggle.setText(folded ? '»' : '«');
    toggle.setAttribute('aria-expanded', String(!folded));
    toggle.setAttribute('aria-label', word(folded ? 'dock.open' : 'dock.fold', { name }));
  };
  const fold = (to: boolean) => {
    folded = to;
    kept.set(name, to);
    keepFold(name, to);
    show();
  };
  toggle.addEventListener('click', () => fold(!folded));
  show();
  return { fold, folded: () => folded };
}

/** Whether a key press is the dock's own: [ with no modifier, outside a place to type. */
export const dockKey = (e: KeyboardEvent): boolean =>
  e.key === '[' &&
  !e.ctrlKey &&
  !e.metaKey &&
  !e.altKey &&
  !(e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
