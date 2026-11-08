// The globe view, driven in a real browser the way a person drives it (editor spec, globe_view, globe_dive_detail).
// It opens the Obsidian harness on a note of forty places and shows it full screen as a globe. The new rendering draws
// it (Roger, 7 Nov 2026: one look, never the old view in space beside it). Then it pinches, presses the bar's zoom and
// clicks. Smooth zoom, pinch in every view and the click rule are Roger's standing rules. What is shown on screen is
// compared by its picture, as the drawing is a canvas.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome, run, startChrome } from '../scripts/chrome.mjs';
import { open, serve } from '../scripts/wiki-screens.mjs';
import { ROOT } from './repository/repo.js';

const PLACES = 40;
/** The new rendering's canvas in the full-screen card. */
const STAGE = '.thoughtknot-fullscreen canvas.thoughtknot-render-stage';
const NOTE = [
  '# Places',
  '```gql',
  '// graph: places',
  Array.from({ length: PLACES }, (_, i) => `(n${i}:Place {name: 'Town${i}', size: ${i * 10}})`).join(', ') + ',',
  Array.from({ length: PLACES }, (_, i) => `(n${i})-[:NEAR]->(n${(i * 2 + 1) % PLACES})`).join(', '),
  '```',
  '',
].join('\n');

describe('the globe view, driven in a real browser', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the globe is driven in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must drive the globe, and found no Chrome');
    console.warn(why);
  }
  const options = { skip: why ?? false, timeout: 300_000 };
  let folder, server, browser, view;
  const errors = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Waits until `ready()` gives true, or fails after `ms`. It looks again at once, so a slow machine only waits longer. */
  const until = async (ready, ms = 20_000) => {
    const t0 = Date.now();
    while (!(await ready())) {
      if (Date.now() - t0 > ms) throw new Error('timed out waiting');
      await wait(50);
    }
  };
  const eval_ = (js) => run(browser.send, js);
  /** A fingerprint of what the screen shows. */
  const picture = async () =>
    createHash('md5')
      .update((await browser.send('Page.captureScreenshot', { format: 'png' })).data)
      .digest('hex');
  /** Waits until the screen stops changing: two looks in a row show the same picture. */
  const settled = async () => {
    let last = '';
    await until(async () => {
      const now = await picture();
      const same = now === last;
      last = now;
      return same;
    });
    return last;
  };
  const wheel = (deltaY, modifiers = 0) =>
    browser.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: view.x + view.width / 2,
      y: view.y + view.height / 2,
      deltaX: 0,
      deltaY,
      modifiers,
    });
  const click = async (x, y) => {
    for (const type of ['mousePressed', 'mouseReleased'])
      await browser.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    await settled();
  };
  /** How much the stage bends the drawing round a ball: more than none on the globe. */
  const bent = () => eval_(`document.querySelector('${STAGE}')?.thoughtknotDrawn().view.globe ?? 0`);
  /** The name of the thing the details panel shows, or ''. */
  const picked = () =>
    eval_(`(document.querySelector('.thoughtknot-fullscreen .thoughtknot-details')?.textContent ?? '').slice(0, 40)`);

  before(async () => {
    if (why) return;
    folder = mkdtempSync(join(tmpdir(), 'globe-probe-'));
    writeFileSync(join(folder, 'note.md'), NOTE);
    const built = join(folder, 'site');
    execFileSync(
      process.execPath,
      [join(ROOT, 'packages/obsidian/harness/build.mjs'), built, join(folder, 'note.md')],
      {
        stdio: 'ignore',
      },
    );
    server = await serve(built);
    browser = await startChrome({
      chrome,
      width: 1100,
      height: 800,
      scale: 1,
      flags: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
    });
    browser.on('Runtime.exceptionThrown', (e) => errors.push(e.exceptionDetails?.text));
    await open(browser.send, `http://127.0.0.1:${server.address().port}/index.html`);
    await eval_(`document.querySelector('button[aria-label="Full screen"]').click()`);
    await until(
      async () => !!(await eval_(`!!document.querySelector('.thoughtknot-fullscreen button[aria-label^="2D, 2.5D"]')`)),
    );
    for (let i = 0; i < 5; i++) {
      const label = await eval_(
        `document.querySelector('.thoughtknot-fullscreen button[aria-label^="2D, 2.5D"]').getAttribute('aria-label')`,
      );
      if (/Globe/.test(label)) break;
      await eval_(`document.querySelector('.thoughtknot-fullscreen button[aria-label^="2D, 2.5D"]').click()`);
      await until(async () =>
        /Globe|2D|2\.5D|3D/.test(
          await eval_(
            `document.querySelector('.thoughtknot-fullscreen button[aria-label^="2D, 2.5D"]').getAttribute('aria-label')`,
          ),
        ),
      );
    }
    await until(async () => (await bent()) > 0);
    await settled();
    view = await eval_(
      `(() => { const r = document.querySelector('${STAGE}').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
    );
  });
  after(async () => {
    server?.close();
    await browser?.stop();
    if (folder) rmSync(folder, { recursive: true, force: true });
  });

  test('is shown as a globe by the new rendering, with no old view in space and no error', options, async () => {
    assert.match(
      await eval_(
        `document.querySelector('.thoughtknot-fullscreen button[aria-label^="2D, 2.5D"]').getAttribute('aria-label')`,
      ),
      /Globe/,
    );
    assert.ok((await bent()) > 0, 'the stage wraps the drawing round a ball');
    assert.equal(await eval_(`!!document.querySelector('.thoughtknot-space-view')`), false, 'one look, never two');
    assert.deepEqual(errors, []);
  });

  test(
    'a pinch zooms the view, not the page, a little at each step; the bar’s zoom and Fit move it too',
    options,
    async () => {
      const seen = new Set();
      for (let i = 0; i < 6; i++) {
        const before = await picture();
        await wheel(-60, 2); // ctrl, as a trackpad pinch arrives
        await until(async () => (await picture()) !== before);
        seen.add(await settled());
      }
      assert.equal(seen.size, 6, 'each step of a pinch moves the view a step further');
      for (const button of ['Zoom in', 'Fit']) {
        const before = await picture();
        await eval_(`document.querySelector('.thoughtknot-fullscreen button[aria-label="${button}"]').click()`);
        await until(async () => (await picture()) !== before);
        await settled();
      }
      for (let i = 0; i < 6; i++) await wheel(-60, 2);
      await settled();
      const pinched = new Set();
      for (let i = 0; i < 5; i++) {
        const before = await picture();
        await wheel(40, 2); // ctrl, as a trackpad pinch arrives
        await until(async () => (await picture()) !== before);
        pinched.add(await settled());
      }
      assert.equal(pinched.size, 5, 'each step of a pinch moves the view');
      assert.equal(await eval_('window.visualViewport.scale'), 1, 'the page itself is not zoomed');
      assert.equal(await eval_('window.scrollY'), 0, 'the page does not scroll');
    },
  );

  test('the first click picks a thing, shows its properties and turns the globe to it', options, async () => {
    await eval_(`document.querySelector('.thoughtknot-fullscreen button[aria-label="Fit"]').click()`);
    await settled();
    // the first spot, going out from the middle of the view, where a thing can be picked
    let at;
    let before;
    for (const [dx, dy] of [
      [0, 0],
      [60, 0],
      [-60, 0],
      [0, 60],
      [0, -60],
      [120, 60],
      [-120, -60],
      [90, -90],
    ]) {
      const x = view.x + view.width / 2 + dx,
        y = view.y + view.height / 2 + dy;
      // a click on a group glides one level nearer, as only the level being read is picked (render_pick_shown), so a
      // spot is clicked again once the group has opened
      for (let tries = 0; tries < 4 && !at; tries++) {
        before = await picture();
        await click(x, y);
        if (/Town\d+/.test(await picked())) at = [x, y];
        else await settled();
      }
      if (at) break;
    }
    assert.ok(at, 'a click on a thing picks it');
    const name = (await picked()).match(/Town\d+/)[0];
    const turned = await picture();
    const middle = at[0] === view.x + view.width / 2 && at[1] === view.y + view.height / 2;
    assert.ok(before !== turned || middle, 'the first click turned the globe to the thing (Roger, 24 Oct 2026)');
    // clicked once more, now at the middle of the view where the thing stands, it stays picked
    await click(view.x + view.width / 2, view.y + view.height / 2);
    assert.equal((await picked()).match(/Town\d+/)?.[0], name, 'the next click keeps it picked');
  });
});
