// No two cards over the drawing overlap, measured in a real browser (editor spec §25, panels_stack). Roger said so on
// 6 Nov 2026: "The side panels regularly overlap each other …". The slot list in
// controls-slots.ts only says which card claims which corner; it never looked at where the cards land. So here the
// Claude Code host's page, the desktop app's page too, is opened in a headless Chrome (chrome.mjs):
// - at a tablet's, a laptop's and a large screen's size, in the page and in full screen;
// - in 2D, 2.5D and 3D;
// - with every panel opened and a thing picked, so its details show too.
// Then every card that holds a slot is measured. Two that overlap are named, and so is one that runs past the drawing.
// A dock the person moved free stays where they put it, so it is left out. A phone keeps its panels in its sheet,
// which controls-sheet.test.js checks. Run by test/panels-stack.test.js.
import { startChrome } from './chrome.mjs';
import { SETTLE, jsText, openPage } from './targets-reflow.mjs';

/** The sizes measured, in CSS pixels: a tablet's, a laptop's, and a large screen's like Roger's MacBook. */
export const SIZES = [
  { name: 'tablet', width: 900, height: 800 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'large', width: 1728, height: 1000 },
];

/** The spaces measured, as the bar's space button names them. */
export const SPACES = ['2D', '2.5D', '3D'];

/** The cards that hold a slot of their own, measured. A free dock is the person's to place; a phone has its sheet. */
export const HELD = [
  'thoughtknot-corner',
  'thoughtknot-mini-map',
  'thoughtknot-space-pad',
  'thoughtknot-level-badge',
  'thoughtknot-details',
];

/** How far, in CSS pixels, two cards may touch before they count as overlapping: a border's width. */
export const TOUCH = 1;

/** Run in the page: the view in full screen if one is open, else the first on the page. */
const VIEW = `(document.querySelector('.thoughtknot-fullscreen .thoughtknot-view') ?? document.querySelector('.thoughtknot-view'))`;

/** Clicks the button labelled `label` in the view's bar. */
const press = (label) => `${VIEW}?.querySelector(${jsText(`.thoughtknot-bar [aria-label="${label}"]`)})?.click()`;

/** Opens full screen. */
export const FULL = `document.querySelector('.thoughtknot-bar [aria-label="Full screen"]').click()`;

/** Shows the drawing the `n`th way of the side rail: 2D, 2.5D, 3D or the globe (type_rail). */
export const SPACE_AT = (n) => `${VIEW}.querySelectorAll('.thoughtknot-rail [data-space]')[${n}].click()`;

/** Opens the View panel, and every dock and chip that is folded. */
export const OPEN_ALL = `(() => {
  const view = ${VIEW};
  const b = view.querySelector('.thoughtknot-bar [aria-label="View"]');
  if (b && b.getAttribute('aria-expanded') !== 'true') b.click();
  for (const f of view.querySelectorAll('.thoughtknot-dock-fold[aria-expanded="false"], .thoughtknot-chip-fold[aria-expanded="false"]'))
    f.click();
})()`;

/** Opens Find, so the next keys typed find a thing. */
export const FIND = press('Find a thing');

/**
 * Run in the page. Gives the drawing's box and each shown card that holds a slot, as boxes in CSS pixels. Details
 * laid out in the page's flow, below the drawing, are not over it, so they are left out.
 */
export const MEASURE = `(() => {
  const view = ${VIEW};
  const box = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  const drawing = box(view.querySelector('.thoughtknot-viewport').getBoundingClientRect());
  const cards = [];
  for (const cls of ${JSON.stringify(HELD)})
    for (const el of view.querySelectorAll('.' + cls)) {
      if (el.closest('.thoughtknot-phone-sheet') || el.closest('.thoughtknot-dock.is-free')) continue;
      const style = getComputedStyle(el), r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || style.visibility === 'hidden' || style.display === 'none') continue;
      if (!['absolute', 'fixed', 'sticky'].includes(style.position)) continue;
      const name = cls.replace('thoughtknot-', '') + (el.classList.contains('thoughtknot-corner-end') ? ' (end)' : '');
      cards.push({ name, ...box(r) });
    }
  return { drawing, cards };
})()`;

const px = (n) => Math.round(n);

/** How far `a` and `b` overlap each way, in CSS pixels: 0 where they do not. */
const overlap = (a, b) => ({
  x: Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)),
  y: Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)),
});

/**
 * What is wrong in one measure, each a sentence starting with `where`: two cards that overlap, and a card that runs
 * past the drawing's edge.
 */
export function findings(where, { drawing, cards }) {
  const found = [];
  cards.forEach((a, i) => {
    for (const b of cards.slice(i + 1)) {
      const o = overlap(a, b);
      if (o.x > TOUCH && o.y > TOUCH) found.push(`${where}: ${a.name} overlaps ${b.name} by ${px(o.x)} by ${px(o.y)}`);
    }
    const past = Math.max(
      drawing.top - a.top,
      a.bottom - drawing.bottom,
      drawing.left - a.left,
      a.right - drawing.right,
    );
    if (past > TOUCH) found.push(`${where}: ${a.name} runs ${px(past)} past the drawing`);
  });
  return found;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Checks the Claude Code host's page at `link`, served by a running editor server. It runs every size, in the page and
 * full screen, in every space, with every panel open and `thing` picked. Gives what is wrong, each a sentence. Chrome
 * starts afresh for each size and each of page and full screen, so the memory of the views before is let go.
 */
export async function checkPanels(link, { chrome, sizes = SIZES, spaces = SPACES, thing } = {}) {
  const found = [];
  for (const size of sizes)
    for (const full of [false, true]) {
      const browser = await startChrome({ chrome, width: size.width, height: size.height, scale: 1 });
      const step = async (line) => {
        await browser.run(line);
        await pause(300);
        await browser.run(SETTLE);
      };
      try {
        for (const [n, space] of spaces.entries()) {
          await openPage(browser, link);
          if (full) await step(FULL);
          if (n) await step(SPACE_AT(n));
          await step(OPEN_ALL);
          if (thing) {
            await step(FIND);
            await browser.send('Input.insertText', { text: thing });
            await pause(300);
            for (const type of ['keyDown', 'keyUp'])
              await browser.send('Input.dispatchKeyEvent', {
                type,
                key: 'Enter',
                code: 'Enter',
                windowsVirtualKeyCode: 13,
              });
            await pause(300);
            await browser.run(SETTLE);
          }
          await step(OPEN_ALL); // a panel the pick opened, opened whole too
          const where = `${size.name} ${size.width}x${size.height}${full ? ' full screen' : ''} ${space}`;
          found.push(...findings(where, await browser.run(MEASURE)));
        }
      } finally {
        await browser.stop();
      }
    }
  return found;
}
