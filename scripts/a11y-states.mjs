// States of the Obsidian host's page that a person once checked by hand, measured in a real browser.
// (Editor spec §41, a11y_states_auto; risks UX-2 and UX-9.) The harness page (packages/obsidian/harness) is opened in a headless
// Chrome (chrome.mjs). Each check brings it to a state with real key presses, and what it measured is judged:
// - the focused box has a ring that shows in the light and the dark theme (SC 2.4.7, 2.4.11);
// - Escape closes a panel and returns the focus to the button that opened it (SC 2.1.2, 3.2.1);
// - with reduced motion asked for, nothing runs on for ever (SC 2.3.3);
// - every button of the sheet is 44 points at a phone's width (AX-14);
// - at twice the text size, no control covers another and no word is cut off (SC 1.4.4, 1.4.12);
// - in the test languages en-XA and ar-XB, the views still reflow and keep every control (pseudo_locales_checked).
// Run by test/a11y-states.test.js. A check may be given a `plant`: a line of script run once the page is ready. The
// test plants a fault with it and sees it found.
import { startChrome, SETTLED_MEDIA } from './chrome.mjs';
import { SHOTS, open, serve } from './wiki-screens.mjs';
import { MEASURE, NARROW, SETTLE, WIDE, findings, jsText } from './targets-reflow.mjs';

/** The least a ring may contrast with what is behind it (SC 1.4.11). */
export const MIN_RING_CONTRAST = 3;
/** The size of a button on the sheet, in CSS pixels (AX-14). */
export const SHEET_TARGET = 44;
/** The width of a page at 200% text: a desktop's 1400, halved and halved again is 350, and a phone's 320 is below it. */
export const ZOOMED = 700;
/** The test languages (editor spec §42), the views each is tried on. */
export const TEST_LANGUAGES = ['en-XA', 'ar-XB'];
const nthButton = (n) =>
  `document.querySelector('#note .block-language-gql').querySelectorAll('.thoughtknot-bar > button')[${n}].click()`;
// a test language's labels are not the words SHOTS names its buttons by, so each is pressed by its place in the bar
const LANGUAGE_VIEWS = [
  { name: 'card', steps: [] },
  { name: 'find', steps: [nthButton(0)] },
  { name: 'diagram-types', steps: [nthButton(2)] },
];

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const KEYS = {
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
};

/** Presses a key as a person's keyboard would: down, then up. */
async function press(browser, name) {
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', ...KEYS[name] });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', ...KEYS[name] });
}

/** Tabs until the focus is on an element matching `selector`: true, or false when it never is. */
async function tabTo(browser, selector, tries = 60) {
  for (let i = 0; i < tries; i++) {
    await press(browser, 'Tab');
    if (await browser.run(`Boolean(document.activeElement?.matches(${jsText(selector)}))`)) return true;
  }
  return false;
}

/** The page afresh in `theme`, then a plant if there is one, and the page settled. */
async function ready(page, { theme = 'light', plant } = {}) {
  await open(page.browser.send, page.url);
  if (theme === 'dark') await page.browser.run(`document.documentElement.classList.add('dark')`);
  if (plant) await page.browser.run(plant);
  await page.browser.run(SETTLE);
}

/**
 * Run in the page: two screenshots (base64 PNGs of the same clip) compared round a box. `box` is the box in the clip's own
 * pixels. Gives how many pixels in the band 1 to 6 pixels outside the box changed.
 * It also gives the contrast against the pixels before, for the middle one of them.
 */
const RING_DIFF = (after, before, box) => `(async () => {
  const load = (data) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + data; });
  const [a, b] = await Promise.all([load(${jsText(after)}), load(${jsText(before)})]);
  const read = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
  const [pa, pb] = [read(a), read(b)];
  const box = ${JSON.stringify(box)};
  const light = (p, i) => { const v = [0, 1, 2].map((k) => { const s = p[i + k] / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  let changed = 0; const contrasts = [];
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const dx = Math.max(box.x - x, 0, x - (box.x + box.w)), dy = Math.max(box.y - y, 0, y - (box.y + box.h));
    const out = Math.max(dx, dy);
    if (out < 1 || out > 6) continue;
    const i = (y * a.width + x) * 4;
    if (Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2])) < 48) continue;
    changed++;
    const [l1, l2] = [light(pa, i), light(pb, i)];
    contrasts.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
  }
  contrasts.sort((p, q) => p - q);
  return { changed, contrast: contrasts.length ? contrasts[Math.floor(contrasts.length / 2)] : 0 };
})()`;

const BOX = `(() => { const r = document.activeElement.getBoundingClientRect();
  return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; })()`;
const NO_RING = `(() => { const s = document.createElement('style'); s.id = 'no-ring';
  s.textContent = '#note .thoughtknot-focus-ring { display: none !important }'; document.head.append(s); })()`;

/**
 * What is wrong with a ring, as measured by RING_DIFF. `without` is against the same box with the ring switched off and
 * `blurred` against the box with no focus. Each must show the ring along the box, at least its width and height in pixels.
 * The ring is two pixels wide, and a tooltip may hide a side. The ring must also contrast with what is behind it.
 */
export function ringFindings(theme, box, without, blurred) {
  const need = Math.round(box.w + box.h);
  const found = [];
  if (without.changed < need)
    found.push(
      `${theme}: the focused box has no ring of its own: ${without.changed} pixels round it change when it is off, ${need} needed`,
    );
  else if (without.contrast < MIN_RING_CONTRAST)
    found.push(
      `${theme}: the focus ring is ${without.contrast.toFixed(1)} to 1 against what is behind it, under ${MIN_RING_CONTRAST} to 1`,
    );
  if (blurred.changed < need)
    found.push(
      `${theme}: a focused box looks the same as one without focus: ${blurred.changed} pixels round it change, ${need} needed`,
    );
  return found;
}

/** Tabs to the first box and compares it focused, with its ring off, and without focus, in the light and dark themes. */
async function focusRing(page, { plant } = {}) {
  const { browser } = page;
  const found = [];
  for (const theme of ['light', 'dark']) {
    await ready(page, { theme, plant });
    if (!(await tabTo(browser, '#note g.node'))) {
      found.push(`${theme}: the keyboard never reaches a box`);
      continue;
    }
    await pause(300);
    const box = await browser.run(BOX);
    const pad = 12;
    const clip = { x: box.x - pad, y: box.y - pad, width: box.w + 2 * pad, height: box.h + 2 * pad, scale: 1 };
    const shot = async () => (await browser.send('Page.captureScreenshot', { format: 'png', clip })).data;
    const here = { x: pad, y: pad, w: box.w, h: box.h };
    const focused = await shot();
    await browser.run(NO_RING);
    await pause(100);
    const without = await browser.run(RING_DIFF(focused, await shot(), here));
    await browser.run(`document.getElementById('no-ring').remove(); document.activeElement.blur()`);
    await pause(400);
    const blurred = await browser.run(RING_DIFF(focused, await shot(), here));
    found.push(...ringFindings(theme, box, without, blurred));
  }
  return found;
}

/** The buttons of the card's bar that open a panel, by their labels. */
export const PANEL_BUTTONS = ['Diagram type', 'Find a thing', 'Filter by kind or link', 'Export'];

/**
 * Opens each panel from the keyboard, closes it with Escape, and asks where the focus is. A panel opened from behind More
 * leaves the focus on its button, or on More once that has closed. Anywhere else, the focus is lost to the page.
 */
async function escapeReturns(page, { plant } = {}) {
  const { browser } = page;
  const found = [];
  for (const label of PANEL_BUTTONS) {
    await ready(page, { plant });
    const button = jsText(`#note .block-language-gql [aria-label=${JSON.stringify(label)}]`);
    const more = jsText('#note .block-language-gql .thoughtknot-bar-more > button');
    await browser.run(
      `(() => { const b = document.querySelector(${button}); if (b.closest('.thoughtknot-bar-more-list')) document.querySelector(${more}).click(); b.focus(); })()`,
    );
    await press(browser, 'Enter');
    await pause(400);
    await press(browser, 'Escape');
    await pause(400);
    const back = await browser.run(
      `[document.querySelector(${button}), document.querySelector(${more})].includes(document.activeElement) && document.activeElement.getClientRects().length > 0`,
    );
    if (!back)
      found.push(
        `${label}: after Escape the focus is on ${await browser.run(`document.activeElement?.tagName ?? 'nothing'`)}, not back on the button`,
      );
  }
  return found;
}

/** Run in the page: what keeps moving for ever. */
const RUNNING_FOR_EVER = `document.getAnimations()
  .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity)
  .map((a) => (a.animationName || a.transitionProperty || 'an animation') + ' on ' + (a.effect.target?.tagName ?? 'the page'))`;

/** Asks for reduced motion, as the system's setting does, and finds what still runs on for ever. */
async function reducedMotion(page, { plant } = {}) {
  const { browser } = page;
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  try {
    await ready(page, { plant });
    await pause(500);
    const running = await browser.run(RUNNING_FOR_EVER);
    return running.map((r) => `reduced motion: ${r} still runs on for ever`);
  } finally {
    await browser.send('Emulation.setEmulatedMedia', { features: SETTLED_MEDIA });
  }
}

/** Opens the details sheet of the first box at a phone's width, and measures every button on it. */
async function sheetTargets(page, { plant } = {}) {
  const { browser } = page;
  await browser.resize(NARROW, 700);
  try {
    await ready(page, { plant });
    await browser.run(`(() => { const g = document.querySelector('#note g.node'); const at = { bubbles: true, pointerType: 'touch', pointerId: 1, button: 0 };
      g.dispatchEvent(new PointerEvent('pointerdown', at)); g.dispatchEvent(new PointerEvent('pointerup', at)); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
    await pause(600);
    const buttons =
      await browser.run(`[...document.querySelectorAll('.thoughtknot-sheet button')].filter((b) => b.getClientRects().length).map((b) => {
      const r = b.getBoundingClientRect();
      return { name: (b.getAttribute('aria-label') ?? b.textContent).trim().replace(/\\s+/g, ' ').slice(0, 40), width: r.width, height: r.height };
    })`);
    if (!buttons.length) return ['the sheet: it did not open, so no button was measured'];
    return buttons
      .filter((b) => b.width < SHEET_TARGET - 0.5 || b.height < SHEET_TARGET - 0.5)
      .map(
        (b) =>
          `the sheet: button ${b.name} is ${Math.round(b.width)} by ${Math.round(b.height)}, under ${SHEET_TARGET} by ${SHEET_TARGET}`,
      );
  } finally {
    await browser.resize(WIDE);
  }
}

/** The text twice its size, in the plug-in's own sizes, and the spacing WCAG 1.4.12 says a page must bear. */
const BIG_TEXT = `(() => { const s = document.createElement('style');
  s.textContent = ':root { --font-ui-small: 26px; --font-ui-smaller: 24px } body { font-size: 32px }' +
    ' #note * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important }' +
    ' #note p { margin-bottom: 2em !important }';
  document.head.append(s); })()`;

/** Run in the page: each control of the card with its box, and whether its words are cut off. */
const BIG_MEASURE = `(() => [...document.querySelectorAll('#note .block-language-gql :is(button, input, select, textarea, summary, label)')]
  .filter((el) => !el.closest('svg') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
  .map((el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    const cuts = (s.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1) || (s.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 1);
    return { name: el.tagName.toLowerCase() + ' ' + (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\\s+/g, ' ').slice(0, 30),
      left: r.left, right: r.right, top: r.top, bottom: r.bottom, cuts, layer: el.closest('.thoughtknot-over') ? 'panel' : 'card' }; }))()`;

/** What is wrong with the controls as measured: a control over another, and words cut off. Nested controls are left out. */
export function crowdFindings(view, controls) {
  const found = [];
  const inside = (a, b) =>
    a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
  controls.forEach((a, i) => {
    if (a.cuts) found.push(`${view}: ${a.name} cuts its words off`);
    for (const b of controls.slice(i + 1)) {
      // a panel lies over the drawing on purpose, so only controls of the same layer are held apart
      if (a.layer !== b.layer || inside(a, b) || inside(b, a)) continue;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 2 && h > 2)
        found.push(`${view}: ${a.name} and ${b.name} overlap by ${Math.round(w)} by ${Math.round(h)}`);
    }
  });
  return found;
}

/** The card and the panel its bar opens, at twice the text size and the allowed spacing, at the width such a zoom leaves. */
async function bigText(page, { plant } = {}) {
  const { browser } = page;
  await browser.resize(ZOOMED, 1000);
  const found = [];
  try {
    for (const shot of SHOTS.filter((s) => ['card', 'diagram-types', 'find'].includes(s.name))) {
      await ready(page, { plant });
      await browser.run(BIG_TEXT);
      for (const step of shot.steps) await browser.run(step);
      await pause(400);
      await browser.run(SETTLE);
      found.push(...crowdFindings(`${shot.name} at 200% text`, await browser.run(BIG_MEASURE)));
    }
  } finally {
    await browser.resize(WIDE);
  }
  return found;
}

/** Each of the test languages: the views measured wide and narrow, as targets-reflow.mjs judges a view. */
async function testLanguages(page, { plant } = {}) {
  const { browser } = page;
  const found = [];
  const agent = await browser.run('navigator.userAgent');
  try {
    for (const language of TEST_LANGUAGES) {
      await browser.send('Emulation.setUserAgentOverride', { userAgent: agent, acceptLanguage: language });
      for (const shot of LANGUAGE_VIEWS) {
        const measure = async (width) => {
          await browser.resize(width);
          await ready(page, { plant });
          if (width === WIDE && (await browser.run('navigator.language')) !== language)
            throw new Error(`the page did not take the language ${language}`);
          for (const step of shot.steps) {
            await browser.run(step);
            await pause(400);
            await browser.run(SETTLE);
          }
          return browser.run(MEASURE);
        };
        const wide = await measure(WIDE);
        found.push(...findings(`${language} ${shot.name}`, wide, await measure(NARROW)));
      }
    }
  } finally {
    await browser.send('Emulation.setUserAgentOverride', { userAgent: agent, acceptLanguage: 'en-US' });
    await browser.resize(WIDE);
  }
  return found;
}

/** Every check, by name. */
export const CHECKS = { focusRing, escapeReturns, reducedMotion, sheetTargets, bigText, testLanguages };

/**
 * The Obsidian host's harness, built into `built`, brought to each state and judged. `checks` names which to run.
 * `plant` is a line of script a check runs once the page is ready, to test a planted fault.
 */
export async function checkStates(built, { chrome, checks = Object.keys(CHECKS), plant } = {}) {
  const server = await serve(built);
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await startChrome({ chrome, width: WIDE, scale: 1 });
  try {
    const found = [];
    for (const name of checks) found.push(...(await CHECKS[name]({ browser, url }, { plant })));
    return found;
  } finally {
    await browser.stop();
    server.close();
  }
}
