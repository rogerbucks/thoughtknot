// The controls and the drawing share the screen (editor spec ES§73, render_chrome_slots), in a real browser. The
// harness draws the mockup's 430-item sample with the new rendering, on a laptop and on a phone.
// - After the fit, no control shown over a drawing touches what is painted: the camera fits the drawing to the part
//   the controls leave clear.
// - No control shows an icon as its name.
//
// Chrome is the one THOUGHTKNOT_CHROME names, or the first on the PATH. Where none is found the cases skip, except in CI.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome, run, startChrome } from '../scripts/chrome.mjs';
import { open, serve } from '../scripts/wiki-screens.mjs';
import { SCENES } from '../scripts/render-scenes.mjs';
import { ROOT } from './repository/repo.js';

/** The screens, as the scoreboard draws on them (scripts/render-scoreboard.mjs). */
const DEVICES = {
  laptop: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
};

/**
 * Read in the page, for each drawing on a canvas: its frame, the box of what is painted, and the controls over it. Each
 * is in the frame's own pixels, and a pixel is painted when it is not clear. Then the icons that show their name.
 */
const READ = `(() => {
  const CARDS = ['.thoughtknot-corner', '.thoughtknot-dock.is-free', '.thoughtknot-phone-sheet', '.thoughtknot-mini-map'];
  const seen = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const drawings = [...document.querySelectorAll('canvas.thoughtknot-render-stage')].filter(seen).map((c) => {
    const vp = c.closest('.thoughtknot-viewport'), v = vp.getBoundingClientRect();
    const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data, k = c.width / v.width;
    let [l, t, r, b] = [Infinity, Infinity, -1, -1];
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (d[(y * c.width + x) * 4 + 3] > 8) [l, t, r, b] = [Math.min(l, x), Math.min(t, y), Math.max(r, x), Math.max(b, y)];
    const at = (e) => { const q = e.getBoundingClientRect(); return { left: q.left - v.left, top: q.top - v.top, right: q.right - v.left, bottom: q.bottom - v.top }; };
    const controls = CARDS.flatMap((s) => [...vp.parentElement.querySelectorAll(s)])
      .filter((e) => seen(e) && !e.closest('[hidden]')).map(at)
      .filter((q) => q.right > 0 && q.bottom > 0 && q.left < v.width && q.top < v.height && q.right > q.left && q.bottom > q.top);
    return { frame: [v.width, v.height], painted: r < 0 ? null : { left: l / k, top: t / k, right: (r + 1) / k, bottom: (b + 1) / k }, controls };
  });
  const iconWords = [...document.querySelectorAll('[data-icon]')].filter((el) => seen(el) && [...el.childNodes].some((n) => n.textContent.trim() === el.dataset.icon)).map((el) => el.dataset.icon);
  return { drawings, iconWords };
})()`;

/** Whether two boxes share any area. */
const meet = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('the controls beside the new rendering, in a real browser', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the controls are checked in CI';
    if (process.env.GITHUB_ACTIONS)
      throw new Error('CI must check the controls beside the drawing, and found no Chrome');
    console.warn(why);
  }
  const options = { skip: why ?? false, timeout: 120_000 };
  let browser, server, folder, url;
  before(async () => {
    if (why) return;
    folder = mkdtempSync(join(tmpdir(), 'render-chrome-'));
    const note = join(folder, 'note.md');
    writeFileSync(note, SCENES.mockup.note());
    execFileSync(process.execPath, [join(ROOT, 'packages/obsidian/harness/build.mjs'), join(folder, 'page'), note]);
    server = await serve(join(folder, 'page'));
    url = `http://127.0.0.1:${server.address().port}/index.html`;
    browser = await startChrome({ chrome });
  });
  after(async () => {
    await browser?.stop();
    server?.close();
    if (folder) rmSync(folder, { recursive: true, force: true });
  });

  for (const [device, metrics] of Object.entries(DEVICES))
    // proves: render_chrome_slots
    test(`on a ${device}, no control covers the fitted drawing, and no icon shows as its name`, options, async () => {
      await browser.send('Emulation.setDeviceMetricsOverride', metrics);
      await open(browser.send, url);
      const { drawings, iconWords } = await run(browser.send, READ);
      assert.ok(drawings.length > 0, 'the new rendering painted a drawing');
      for (const [i, { frame, painted, controls }] of drawings.entries()) {
        assert.ok(painted, `drawing ${i} (${frame.join(' by ')}) painted something`);
        for (const c of controls)
          assert.ok(
            !meet(painted, c),
            `drawing ${i}: a control at ${JSON.stringify(c)} covers ${JSON.stringify(painted)}`,
          );
      }
      assert.deepEqual(iconWords, [], 'icons shown as their names');
    });
});
