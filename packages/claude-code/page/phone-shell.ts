// The phone's shell (editor ES§40, phone_shell). On a touch screen as narrow as a phone, the note is not one long
// page. The board, the graph, the note's text and the less used parts are four views, and a bar at the thumb's reach
// names them. One shows at a time, so nothing stacks and nothing overlaps. The board and the graph fill the screen.
// The page's own parts are the same, so every view of the engine is still there. Only what shows changes (phone.css).
import { word } from '@thoughtknot/core';

/** A touch screen as narrow as a phone: the page's shell is the phone's. */
export const PHONE_SHELL = ['(pointer:coarse)', '(max-width:700px)'] as const;

/** The four views, in the bar's order. */
export const PHONE_TABS = ['board', 'graph', 'note', 'more'] as const;

/** Before the board is on the page: what the page leaves it below its header, above the bar and its row of tools. */
const BOARD_CHROME = 200;

/** The space kept between a drawing's foot and the bar, in pixels. */
const GAP = 8;

/** The least height a board or a drawing can be used in, in pixels. */
const LEAST = 240;

/** Each drawing that fills the screen to the bar: where it is, and the property the page names its height in. */
const FILLS = [
  ['.gn-boards .thoughtknot-board > .thoughtknot-viewport', '--thoughtknot-board-room'],
  ['.gn-pane .thoughtknot-pane-drawing .thoughtknot-viewport', '--thoughtknot-graph-room'],
] as const;

/** Makes the shell on a phone, and does nothing elsewhere. Returns whether it did. */
export function phoneShell(win: Window & typeof globalThis): boolean {
  if (!PHONE_SHELL.every((query) => win.matchMedia(query).matches)) return false;
  const doc = win.document;
  const root = doc.documentElement;
  root.classList.add('gn-phone');
  root.dataset.tab = 'board';
  const bar = doc.createElement('nav');
  bar.className = 'gn-tabbar';
  bar.setAttribute('aria-label', word('phone.tabs'));
  const buttons = PHONE_TABS.map((tab) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'gn-tab';
    b.dataset.tab = tab;
    b.textContent = word(`phone.${tab}`);
    b.addEventListener('click', () => show(tab));
    return b;
  });
  let drawn = false;
  let shown = () => {};
  const show = (tab: (typeof PHONE_TABS)[number]) => {
    root.dataset.tab = tab;
    // the pane opens on its text, for typing. The graph view is for looking, so its first showing is the drawing
    if (tab === 'graph' && !drawn) {
      const first = doc.querySelector<HTMLElement>('.gn-pane .thoughtknot-tabs button');
      if (first) {
        first.click();
        drawn = true;
      }
    }
    for (const b of buttons) {
      if (b.dataset.tab === tab) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    }
    if (doc.scrollingElement) doc.scrollingElement.scroll(0, 0);
    shown();
  };
  bar.append(...buttons);
  doc.body.append(bar);
  // the board and the drawing are as tall as the screen leaves them, from their top to the bar. The page says how
  // tall (phone.css), and the board reads it too (board-space.ts). A height never moves its own top, so a fit never
  // makes another. Before the board is on the page, its room is a fair guess.
  // what the page shows under a drawing, down to the foot of its last shown part: the drawing's height leaves it be
  const below = (box: DOMRect) => {
    const parts = Array.from(doc.querySelector('main')?.children ?? []).map((part) => part.getBoundingClientRect());
    const foot = Math.max(box.bottom, ...parts.filter((part) => part.height).map((part) => part.bottom));
    return foot - box.bottom;
  };
  const fit = () => {
    const guess = win.innerHeight - (doc.querySelector('header')?.clientHeight ?? 0) - bar.clientHeight - BOARD_CHROME;
    for (const [where, name] of FILLS) {
      const drawing = doc.querySelector(where);
      const box = drawing?.getBoundingClientRect();
      // a view out of sight keeps the room it had; the board has the guess until it is on the page and seen
      const first = name === FILLS[0][1] && (!drawing || !root.style.getPropertyValue(name));
      const room = box?.height ? win.innerHeight - box.top - below(box) - bar.clientHeight - GAP : first ? guess : 0;
      if (room) root.style.setProperty(name, `${Math.max(LEAST, Math.round(room))}px`);
    }
  };
  // once for each run of changes, after they are all made. A timer, not a frame: the page starts no movement
  let asked = false;
  const later = () => {
    if (asked) return;
    asked = true;
    win.setTimeout(() => {
      asked = false;
      fit();
    }, 0);
  };
  shown = later;
  show('board');
  fit();
  win.addEventListener('resize', fit);
  // the board and the drawing are drawn after the shell, and the rows above them open and close: the page is
  // fitted again. Not on a pan or a zoom, which change only the drawing's style.
  if (typeof win.MutationObserver === 'function')
    new win.MutationObserver(later).observe(doc.body, {
      childList: true,
      subtree: true,
      attributeFilter: ['hidden', 'open', 'class'],
    });
  return true;
}

/** On a phone, the header names the note, as a phone's own screens name what they show. Elsewhere, nothing. */
export function phoneTitle(doc: Document, note: string): void {
  if (!doc.documentElement.classList.contains('gn-phone') || !note) return;
  const name = note.split('/').pop()?.replace(/\.md$/i, '') || note;
  doc.querySelector('.gn-title')?.replaceChildren(name);
}
