// The control dock (editor spec §25, controls_dock). Roger, 1 Nov 2026: a view's key controls stay on screen, over the
// drawing and never shrinking it, with an expander for the rest. Every view's on-screen controls sit in one of these.
//
// It is a card floating in a corner of the drawing (styles.css). Its head names it and folds it. Folded, only the head
// shows, so the drawing is whole again and nothing is laid out anew. Its body holds the key controls. Under them, More
// opens the controls used less often. The fold is kept for the session, by the dock's name, so a card drawn again
// opens the same way. Its head also moves it, or docks it at either side (controls-place.ts). On a tablet-sized
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

/** Whether a window this wide starts its docks folded: a tablet's, where the drawing needs the room. */
const narrowWindow = (): boolean => {
  const win = typeof activeWindow === 'undefined' ? undefined : activeWindow;
  return !!win?.matchMedia?.('(min-width: 600px) and (max-width: 1023px)')?.matches;
};

/** Builds a dock named `name` in `root`, with the classes `cls` as well as its own. */
export function renderDock(root: HTMLElement, name: string, cls: string[] = []): ControlDock {
  const el = root.createDiv({ cls: ['thoughtknot-dock', ...cls], attr: { role: 'region', 'aria-label': name } });
  const head = el.createDiv({ cls: 'thoughtknot-dock-head' });
  head.createSpan({ cls: 'thoughtknot-dock-name', text: name });
  frameDock(el, head, name); // moved, and docked at either side (controls_panels)
  const toggle = head.createEl('button', { cls: 'thoughtknot-dock-fold', attr: { type: 'button' } });
  const body = el.createDiv({ cls: 'thoughtknot-dock-body' });
  const details = el.createEl('details', { cls: 'thoughtknot-dock-more' });
  details.createEl('summary', { text: word('dock.more') });
  const more = details.createDiv({ cls: 'thoughtknot-dock-more-body' });
  let folded = kept.get(name) ?? narrowWindow();
  const show = () => {
    el.toggleClass('is-folded', folded);
    toggle.setText(folded ? '»' : '«');
    toggle.setAttribute('aria-expanded', String(!folded));
    toggle.setAttribute('aria-label', word(folded ? 'dock.open' : 'dock.fold', { name }));
  };
  const fold = (to: boolean) => {
    folded = to;
    kept.set(name, to);
    show();
  };
  toggle.addEventListener('click', () => fold(!folded));
  show();
  return { el, body, more, fold, folded: () => folded };
}

/** Whether a key press is the dock's own: [ with no modifier, outside a place to type. */
export const dockKey = (e: KeyboardEvent): boolean =>
  e.key === '[' &&
  !e.ctrlKey &&
  !e.metaKey &&
  !e.altKey &&
  !(e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
