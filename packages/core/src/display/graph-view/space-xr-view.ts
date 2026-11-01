// The view in space in a headset (editor spec §68, projection_spatial). Where the device has a headset (WebXR), the
// view's strip offers View in headset. Chosen, the drawing stands at arm's length, painted for each eye by the WebGL 2
// painter. Pointing at a thing and pressing picks it, as a click on it does on the screen, so its details open on the
// card. Where the device has no headset, nothing is offered. The headset view ends with the view in space. The sums
// are in core space-xr.ts.
import { multiply, xrModel, xrPick } from '../../space-xr.ts';
import type { SpaceMarks } from '../../space-view.ts';
import type { Target } from './taps';
import { word } from '../../words.ts';
import { button } from '../button';
import type { Paints } from './mark-painter.ts';
import { webgl2SpacePainter } from './space-painter.ts';

/** The parts of WebXR the headset view uses, as the device gives them. */
interface Xr {
  isSessionSupported(mode: string): Promise<boolean>;
  requestSession(mode: string, init?: object): Promise<XrSession>;
}
interface XrPose {
  transform: { matrix: Float32Array; inverse: { matrix: Float32Array }; position: { x: number; y: number; z: number } };
}
interface XrView extends XrPose {
  projectionMatrix: Float32Array;
}
interface XrFrame {
  getViewerPose(space: unknown): { views: XrView[] } | null;
  getPose(space: unknown, base: unknown): XrPose | null;
}
interface XrSession {
  requestReferenceSpace(kind: string): Promise<unknown>;
  updateRenderState(state: object): void;
  requestAnimationFrame(f: (t: number, frame: XrFrame) => void): number;
  addEventListener(type: string, f: (e: { frame: XrFrame; inputSource: { targetRaySpace: unknown } }) => void): void;
  end(): Promise<void>;
}
type XrLayer = {
  framebuffer: WebGLFramebuffer | null;
  getViewport(view: XrView): { x: number; y: number; width: number; height: number };
};

/** The device's WebXR, if it has any. */
const xrOf = (win: Window): Xr | null => (win.navigator as Navigator & { xr?: Xr }).xr ?? null;

/** Offers View in headset in `pad`, the view in space `el`'s strip, once the device says it has a headset. */
export function offerHeadset(
  el: HTMLElement,
  pad: HTMLElement | null,
  space: () => SpaceMarks,
  paints: () => Paints,
  tell: (t: Target) => void,
): void {
  const xr = xrOf(el.win);
  if (!xr || !pad) return;
  void xr
    .isSessionSupported('immersive-vr')
    .then((yes) => {
      if (yes && el.isConnected)
        button(pad, word('space.headset'), 'glasses', () => void enter(el, xr, space, paints, tell));
    })
    .catch(() => undefined);
}

/** Starts the headset view: the drawing at arm's length for each eye, until the headset is taken off or the view closes. */
async function enter(
  el: HTMLElement,
  xr: Xr,
  spaceNow: () => SpaceMarks,
  paints: () => Paints,
  tell: (t: Target) => void,
): Promise<void> {
  const canvas = el.createEl('canvas', { attr: { hidden: '' } }); // the headset shows it, not the card
  const painter = webgl2SpacePainter(canvas);
  const gl = canvas.getContext('webgl2');
  const layerOf = (el.win as Window & { XRWebGLLayer?: new (s: XrSession, gl: WebGL2RenderingContext) => XrLayer })
    .XRWebGLLayer;
  if (!painter || !gl || !layerOf) return void (painter?.destroy(), canvas.remove());
  try {
    await (gl as unknown as { makeXRCompatible?: () => Promise<void> }).makeXRCompatible?.(); // its chip, the headset's
    const session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    const ground = await session
      .requestReferenceSpace('local-floor')
      .catch(() => session.requestReferenceSpace('local'));
    const layer = new layerOf(session, gl);
    session.updateRenderState({ baseLayer: layer });
    let open = true;
    session.addEventListener('end', () => ((open = false), painter.destroy(), canvas.remove()));
    // pointing and pressing picks the nearest thing the ray meets
    session.addEventListener('select', ({ frame, inputSource }) => {
      const pose = frame.getPose(inputSource.targetRaySpace, ground);
      if (!pose) return;
      const { x, y, z } = pose.transform.position,
        m = pose.transform.matrix;
      const hit = xrPick(spaceNow(), [x, y, z], [-(m[8] ?? 0), -(m[9] ?? 0), -(m[10] ?? 1)]);
      // the card picks it and opens its details, as a click on it does; the view in space then marks it picked
      if (hit?.of !== undefined) tell({ key: hit.of });
    });
    const frame = (_t: number, f: XrFrame) => {
      if (!open) return;
      if (!el.isConnected) return void session.end(); // the view in space closed: the headset view ends with it
      session.requestAnimationFrame(frame);
      const pose = f.getViewerPose(ground);
      if (!pose) return;
      const space = spaceNow(),
        model = xrModel(space);
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      gl.enable(gl.SCISSOR_TEST); // each eye clears only its own half
      for (const view of pose.views) {
        const v = layer.getViewport(view);
        gl.viewport(v.x, v.y, v.width, v.height);
        gl.scissor(v.x, v.y, v.width, v.height);
        painter.paint(space, multiply(view.projectionMatrix, multiply(view.transform.inverse.matrix, model)), paints());
      }
      gl.disable(gl.SCISSOR_TEST);
    };
    session.requestAnimationFrame(frame);
  } catch {
    painter.destroy();
    canvas.remove();
    el.querySelector('.thoughtknot-space-said')?.setText(word('space.headset.failed'));
  }
}
