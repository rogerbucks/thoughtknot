// The phone's shell (editor ES§40, phone_shell). On a touch screen as narrow as a phone, the note is not one long
// page. The board, the graph, the note's text and the less used parts are four views, and a bar at the thumb's reach
// names them. One shows at a time, so nothing stacks and nothing overlaps. The board and the graph fill the screen.
// The page's own parts are the same, so every view of the engine is still there. Only what shows changes (phone.css).
import { word } from '@thoughtknot/core';

/** A touch screen as narrow as a phone: the page's shell is the phone's. */
export const PHONE_SHELL = '(pointer: coarse) and (max-width: 700px)';

/** The four views, in the bar's order. */
export const PHONE_TABS = ['board', 'graph', 'note', 'more'] as const;

/** What the page leaves a board below its header and above the bar and the board's own row of tools, in pixels. */
const BOARD_CHROME = 200;

/** Makes the shell on a phone, and does nothing elsewhere. Returns whether it did. */
export function phoneShell(win: Window & typeof globalThis): boolean {
  if (!win.matchMedia(PHONE_SHELL).matches) return false;
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
    if (doc.scrollingElement) doc.scrollingElement.scrollTop = 0;
  };
  bar.append(...buttons);
  doc.body.append(bar);
  show('board');
  // the board is as tall as the screen leaves it: the page says how tall, the board reads it (board-space.ts)
  const fit = () =>
    root.style.setProperty(
      '--thoughtknot-board-room',
      `${Math.max(240, win.innerHeight - (doc.querySelector('header')?.clientHeight ?? 0) - bar.clientHeight - BOARD_CHROME)}px`,
    );
  fit();
  win.addEventListener('resize', fit);
  return true;
}
