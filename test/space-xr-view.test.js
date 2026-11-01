// The view in space in a headset, in a real browser (editor spec §68, projection_spatial): space-xr-view.ts.
// - Where the device has a headset, the view's strip offers View in headset; where it has none, nothing is offered.
// - Chosen, each eye is painted by the WebGL 2 painter, with no error, in its own part of the headset's picture.
// - Pointing at a thing and pressing picks it, as a click on it does: the card is told to open it.
// - The headset view ends with the view in space.
// The headset is a stand-in, as Chrome here has none. Chrome paints in software (SwiftShader). Chrome is the one
// THOUGHTKNOT_CHROME names, or the first on the PATH. Where none is found the cases skip, except in CI.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findChrome, startChrome } from '../scripts/chrome.mjs';
import { ROOT } from './repository/repo.js';

const SOFTWARE = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'];

/** The page's script: a stand-in headset, and the view in space of a small drawing. */
const PAGE = `
import { installDomHelpers } from './packages/core/src/display/dom-helpers.ts';
import { installHost } from './packages/core/src/display/host.ts';
import { SPACE_OPEN, openSpaceView } from './packages/core/src/display/graph-view/space-view-panel.ts';
installDomHelpers(window);
installHost({ icon() {}, isPhone: () => false, notice() {}, menu() {} });
const I = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
// a headset as WebXR gives one: two eyes, each half of the picture, and a pointer
function headset(has) {
  const xr = { asked: [], session: null };
  xr.isSessionSupported = async (mode) => (xr.asked.push(mode), has);
  xr.requestSession = async (mode) => {
    const on = {}, frames = [];
    const session = (xr.session = {
      mode, frames, on, ended: false, painted: [],
      requestReferenceSpace: async (kind) => kind,
      updateRenderState(state) { session.layer = state.baseLayer; },
      requestAnimationFrame: (f) => frames.push(f),
      addEventListener: (type, f) => ((on[type] ??= []).push(f)),
      end: async () => { session.ended = true; for (const f of on.end ?? []) f({}); },
    });
    return session;
  };
  return xr;
}
class XRWebGLLayer {
  constructor(session, gl) { this.framebuffer = null; this.gl = gl; }
  getViewport(view) { return { x: view.eye === 'left' ? 0 : 240, y: 0, width: 240, height: 360 }; }
}
const eye = (name) => ({ eye: name, projectionMatrix: I(), transform: { matrix: I(), inverse: { matrix: I() }, position: { x: 0, y: 0, z: 0 } } });
window.inHeadset = async (has) => {
  const xr = headset(has);
  Object.defineProperty(navigator, 'xr', { value: xr, configurable: true });
  window.XRWebGLLayer = XRWebGLLayer;
  // the chip is the headset's already: Chrome's own asks for a headset there is none of
  WebGL2RenderingContext.prototype.makeXRCompatible = async () => {};
  const root = document.body.appendChild(document.createElement('div'));
  root.style.cssText = 'position:relative;width:480px;height:360px';
  const holder = root.appendChild(document.createElement('div'));
  holder.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><g class="graph">
    <g class="node" data-key="ada"><polygon fill="rgb(200, 240, 200)" stroke="rgb(0, 100, 0)" points="20,20 120,20 120,60 20,60"/><text x="70" y="45" font-size="14">Ada</text></g>
    <g class="node" data-key="bob"><polygon fill="rgb(200, 240, 200)" stroke="rgb(0, 100, 0)" points="200,140 280,140 280,180 200,180"/><text x="240" y="165" font-size="14">Bob</text></g>
  </g></svg>\`;
  const told = [];
  root.addEventListener(SPACE_OPEN, (e) => told.push(e.detail));
  const opened = await openSpaceView(root, holder.querySelector('svg'), 'Team', () => {});
  await new Promise((r) => setTimeout(r, 50));
  const offer = [...root.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'View in headset' || b.textContent === 'View in headset');
  const out = { asked: xr.asked, offered: !!offer };
  if (!offer) return (opened?.close?.(), root.remove(), out);
  offer.click();
  for (let i = 0; i < 50 && !xr.session?.frames.length; i++) await new Promise((r) => setTimeout(r, 20));
  const session = xr.session;
  out.mode = session?.mode;
  const canvas = root.querySelector('canvas[hidden]');
  const gl = session.layer.gl;
  // one frame, for each eye
  const views = [eye('left'), eye('right')];
  const frame = { getViewerPose: () => ({ views }), getPose: () => null };
  session.frames.shift()(0, frame);
  out.error = gl.getError();
  out.again = session.frames.length === 1;
  out.hiddenCanvas = !!canvas;
  // point down at the table from above, across a grid of places, until a press picks a thing
  for (let x = -0.4; x <= 0.4 && !told.length; x += 0.02)
    for (let z = -1.0; z <= -0.2 && !told.length; z += 0.02) {
      const m = I();
      m[8] = 0; m[9] = 1; m[10] = 0; // looking down: WebXR points along the pose's -z
      const pose = { transform: { matrix: m, inverse: { matrix: I() }, position: { x, y: 3, z } } };
      for (const f of session.on.select ?? []) f({ frame: { getPose: () => pose }, inputSource: { targetRaySpace: 'hand' } });
    }
  out.picked = told.map((t) => t.key);
  // the view in space closes: the headset view ends with it at its next frame
  root.remove();
  session.frames.shift()?.(1, frame);
  out.ended = session.ended;
  out.canvasGone = !canvas.isConnected;
  return out;
};
`;

describe('the view in space in a headset, in a real browser', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the headset view is checked in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must check the headset view, and found no Chrome');
    console.warn(why);
  }
  const options = { skip: why ?? false, timeout: 120_000 };
  let browser, folder;
  before(async () => {
    if (why) return;
    const bundle = await build({
      stdin: { contents: PAGE, resolveDir: ROOT, loader: 'ts' },
      bundle: true,
      format: 'iife',
      write: false,
      logLevel: 'silent',
    });
    browser = await startChrome({ chrome, width: 500, height: 400, scale: 1, flags: SOFTWARE });
    folder = mkdtempSync(join(tmpdir(), 'space-xr-'));
    writeFileSync(join(folder, 'page.js'), bundle.outputFiles[0].text);
    writeFileSync(
      join(folder, 'page.html'),
      '<!doctype html><meta charset="utf-8"><title>Headset</title><script src="page.js"></script>',
    );
    await browser.send('Page.navigate', { url: pathToFileURL(join(folder, 'page.html')).href });
    for (let i = 0; i < 50 && (await browser.run('document.readyState')) !== 'complete'; i++)
      await new Promise((r) => setTimeout(r, 100));
  });
  after(async () => {
    await browser?.stop();
    if (folder) rmSync(folder, { recursive: true, force: true });
  });

  // proves: projection_spatial
  test(
    'with a headset, the view is painted for each eye, a press picks what is pointed at, and it ends with the view',
    options,
    async () => {
      const out = JSON.parse(await browser.run('inHeadset(true).then(JSON.stringify)'));
      assert.deepEqual(out.asked, ['immersive-vr']);
      assert.equal(out.offered, true, 'View in headset is offered');
      assert.equal(out.mode, 'immersive-vr');
      assert.equal(out.hiddenCanvas, true, 'the headset shows the picture, not the card');
      assert.equal(out.error, 0, 'each eye paints with no WebGL error');
      assert.equal(out.again, true, 'the next frame is asked for');
      assert.ok(
        out.picked.length > 0 && ['ada', 'bob'].includes(out.picked[0]),
        `a press picks a thing: ${out.picked}`,
      );
      assert.equal(out.ended, true, 'the headset view ends with the view in space');
      assert.equal(out.canvasGone, true);
    },
  );

  // proves: projection_spatial
  test('with no headset, nothing is offered', options, async () => {
    const out = JSON.parse(await browser.run('inHeadset(false).then(JSON.stringify)'));
    assert.deepEqual(out.asked, ['immersive-vr']);
    assert.equal(out.offered, false);
  });
});
