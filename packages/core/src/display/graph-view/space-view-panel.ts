// The 3D view of a card's drawing (editor spec §53, scale_space_view), switched to from the bar (Roger, 22 Oct 2026).
// It lies over the drawing, under the bar, and goes by the bar's button or Escape. It only looks: nothing reaches the
// note. It reads each box, group and link on screen, in the theme's colours. The sums are in space-view.ts and
// space-spread.ts, the painters in space-painter.ts and space-gpu-painter.ts. It shows cards in space (2.5D), or 3D:
// balls sized by their links, floors by group, or things as tall as their links. Moves are on screen
// (space-controls.ts). 2D and 3D are two views of one graph (Roger, 24 Oct 2026). A first click picks a thing, its
// details on the card (SPACE_OPEN); another turns to it. A bundle, or a folded group picked again or filling the view,
// opens (SPACE_UNFOLD). What the card selects or fades is so here (focus_space), and its lens bends it here (lenses.ts).
import { paintersFrom, word } from '@thoughtknot/core';
import type { DrawMark } from '../../drawing-marks.ts';
import { centredOn, eyeOf, focusOn, middleOf, orbitFit, spaceMatrix, spaceOf, zoomBy } from '../../space-view.ts';
import type { Block, DepthBy, Orbit, SpaceLine, SpaceMarks, Vec3 } from '../../space-view.ts';
import { GlobeLayout } from '../../space-globe.ts';
import { blockAt, lineAt } from '../../space-pick.ts';
import { cardAt, cardsOnScreen, clusterFilling, frameOf, isCluster } from '../../space-cards.ts';
import { spreadSpace } from '../../space-spread.ts';
import { spaceSeen } from '../../lenses.ts';
import { PICK_ATTRIBUTE, lanesShown } from '../../layouts/fingerprint.ts';
import { spotsKept } from '../../space-parts.ts';
import { stripTap } from '../../space-outlines.ts';
import type { Spots } from '../../layouts/layouts.ts';
import { isPlane, stackedPlanes } from '../../space-planes.ts';
import { keyMove, panBy, pinchBy, touchesStay, turnRound, zoomAtPixel } from '../../space-controls.ts';
import type { SpaceMove, Touch } from '../../space-controls.ts';
import type { SpaceMode, SpaceOptions, SpaceView } from './space-view-options.ts';
import { pickPainter, type Paints } from './mark-painter.ts';
import { webgl2SpacePainter, type SpacePainter } from './space-painter.ts';
import { backgroundOf, canvasSpacePainter, paintSpaceLabels } from './space-canvas-painter.ts';
import { webgpuSpacePainter } from './space-gpu-painter.ts';
import { offerHeadset } from './space-xr-view.ts';
import { DEPTH_WORDS, glideIn, linkCounts, spacePad, turnToward } from './space-view-pad.ts';
import { heldIn } from './svg-marks.ts';
import { sketchedSpace, sketchPainted } from './space-sketch.ts';
import { linedUpLayout } from '../../space-glide.ts';
import { SpaceGlide } from './space-view-glide.ts';
import { SpaceMiniMap } from './space-mini-map.ts';
import { MARKED } from './focus-marks';
import type { Target } from './taps';

/** The event a pick in the 3D view sends its card, with the thing or link picked: the card opens its details. */
export const SPACE_OPEN = 'thoughtknot-space-open';

/** The event a bundle or a hub's stub picked in 3D sends its card, with its fold. The card opens it (§25). */
export const SPACE_UNFOLD = 'thoughtknot-space-unfold';

/** The close of the 3D view open on each card, so a second press of 3D view closes it rather than stacking one more. */
const opened = new WeakMap<HTMLElement, () => void>();

const FOLD = /^(bundle|hub|group):/; // a line's key that is a fold to open, not a link: a bundle, a stub, a group's box

/** Where the globe is among the ways to show the view: the last, after cards, balls and the two lifts. */
const GLOBE = 4;

const TAP_SLOP = 6; // how far a pointer may move, in pixels, and still be a click or tap rather than a drag
const DOUBLE_TAP = 350; // how soon a second click or tap must follow the first to fly, in milliseconds

/** A way to show the view: as cards, balls in space (null) or a globe, or lifted, with height by what DepthBy says. */
type Depth = DepthBy | 'cards' | 'globe' | null;

/** The events the view keeps to itself, so the flat drawing under it never takes them for its own. */
const KEPT = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'dblclick', 'wheel', 'keydown'];

/**
 * Opens the 3D view over `root`, the drawing's frame. It is of `from`: the drawing's SVG, or marks already read, such
 * as an overview's, with their paints. It gives back the open view, or null where the device can paint no 3D at all.
 * `closed` is called once it closes, by the card's button, by Escape, or as the card goes.
 */
export async function openSpaceView(
  root: HTMLElement,
  from: SVGSVGElement | { marks: DrawMark[]; paints: Paints },
  graph: string,
  closed: () => void,
  more: SpaceOptions = {},
): Promise<SpaceView | null> {
  const already = opened.get(root);
  if (already) {
    already();
    return null;
  }
  let { marks, paints } = 'marks' in from ? from : sketchPainted(from); // the drawings in their own colours (§70)
  const el = root.createDiv({
    cls: 'thoughtknot-space-view',
    attr: { tabindex: '0', role: 'img', 'aria-label': word('space.name', { graph }) },
  });
  const shapes = el.createEl('canvas', { cls: 'thoughtknot-space-canvas' }),
    words = el.createEl('canvas', { cls: 'thoughtknot-space-canvas' });
  const makers = [webgpuSpacePainter, webgl2SpacePainter, canvasSpacePainter];
  const painter = await pickPainter<SpacePainter>(shapes, paintersFrom(more.painter, makers));
  const ctx = words.getContext('2d');
  if (!painter || !ctx) {
    el.remove();
    return null;
  }
  for (const type of KEPT) el.addEventListener(type, (e) => e.stopPropagation());
  const said = el.createDiv({ cls: 'thoughtknot-space-said', attr: { 'aria-live': 'polite' } }),
    win = el.win;
  // the label halo is the colour behind the view: the first painted one up from it, else the system's page colour
  const halo = backgroundOf(el);
  // the picked thing's ring: the card's text colour, the strongest contrast with its page in either theme
  const ink = win.getComputedStyle(root).color || 'CanvasText';
  // the ways to show it: in space as cards (the first, Roger, 24 Oct 2026) or balls, or the drawing lifted as it is.
  // Last, on a globe seen from outside, which you dive into for detail (Roger, 31 Oct 2026; globe_view)
  const depthsOf = (): Depth[] => ['cards', null, { by: 'group' }, { by: 'size', sizes: linkCounts(marks) }, 'globe'];
  const globe = new GlobeLayout(); // each thing keeps its spot as more opens (explore_stays_put)
  let depths = depthsOf();
  // laid out again, each thing starts where it was, so a group opens or folds in place (cluster_in_place)
  let spots: Spots<3> | undefined,
    held = new Map('marks' in from ? [] : heldIn(from));
  const planes = lanesShown('marks' in from ? null : from.getAttribute(PICK_ATTRIBUTE));
  const spaceBy = (by: Depth): SpaceMarks => {
    if (by === 'globe') return globe.lay(marks, more.centre?.());
    if (by !== 'cards' && by) return spaceOf(marks, by);
    const kept = spots && spotsKept(spots, held);
    const laid = spreadSpace(marks, kept, by === 'cards', more.asDrawn, more.layout?.(), planes);
    spots = laid.spots;
    return stackedPlanes(laid.space);
  };
  // the drawings over it laid on where the page puts them, once it is laid out and lined up (§70)
  const sketched = (laid: SpaceMarks) => sketchedSpace(laid, from, more.sketch, marks);
  // a drawing opens as cards, or in 3D; an overview's groups (massive-paints.ts) are no things to lay out: it is lifted
  let depth =
    'marks' in from ? (marks.some((m) => m.kind === 'group') ? 2 : 3) : more.globe ? 4 : more.cards === false ? 1 : 0;
  let space: SpaceMarks = sketched(spaceBy(depths[depth] ?? null));
  let width = 1,
    height = 1;
  let orbit: Orbit = orbitFit(space, 1);
  let asked = false;
  let open = true;
  // the picked thing, by its key: its name always shows, and Enter flies to it; or the picked link, its words shown
  let picked: Block | null = null;
  let pickedLine: SpaceLine | null = null;
  let turning = 0;

  const reachOf = () => Math.hypot(space.most[0] - space.least[0], space.most[1] - space.least[1], space.most[2]);
  const matrixNow = () => spaceMatrix(orbit, width / height, reachOf());
  // painted and picked, through its lens; on a globe, only the side facing the camera
  const seen = () =>
    globe.facing(spaceSeen(glide.shown, more.lens?.(), glide.match(picked)), eyeOf(orbit), depth === GLOBE);
  const paint = () => {
    asked = false;
    if (!open) return;
    const matrix = matrixNow();
    const frame = frameOf(seen(), matrix, width, height, glide.match(picked), pickedLine?.id);
    painter.paint(frame.shapes, matrix, paints);
    paintSpaceLabels(ctx, frame, paints, win.devicePixelRatio || 1, halo, ink);
    map.update(glide.shown, orbit, matrix, [width, height], glide.match(picked));
  };
  const again = () => {
    if (asked) return;
    asked = true;
    win.requestAnimationFrame(paint);
  };
  const glide = new SpaceGlide(el, space, again, (o) => (orbit = o)); // laid out again, it glides there (layout_glide)
  const map = new SpaceMiniMap(el, more.miniMap ?? (() => 'off'), (by) => ((orbit = by(orbit)), again()));
  const resize = () => {
    // the card was drawn again or closed, which its size shows: the view goes with it, and frees the graphics chip
    if (!el.isConnected) return close();
    width = Math.max(1, el.clientWidth);
    height = Math.max(1, el.clientHeight);
    const ratio = win.devicePixelRatio || 1;
    painter.resize(width, height, ratio);
    words.width = Math.round(width * ratio);
    words.height = Math.round(height * ratio);
    again();
  };
  const sizer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  sizer?.observe(el);
  // the card marked its drawing again. The things it shows now are laid out, faded as it fades them. The view is
  // fitted to them when they are other things than before
  const marked = () => {
    if ('marks' in from || !open) return;
    const was = space.blocks.map((b) => b.of).join(),
      before = picked && { of: picked.of, at: middleOf(picked) };
    const [shown, shownOrbit] = [glide.settle(), orbit];
    ({ marks, paints } = sketchPainted(from));
    depths = depthsOf();
    // each box shown before or now, so a thing from a box just opened starts where the box was, and the view stays
    held = new Map([...held, ...heldIn(from)]);
    const warm = !!spots && !more.asDrawn;
    space = spaceBy(depths[depth] ?? null);
    if (warm) [space, spots] = linedUpLayout(shown, space, spots, more.layout?.()?.pinned, before?.of); // not to spin
    space = sketched(space);
    // what the card selects now is picked here too: a thing found, or none once its details close
    const key = from.querySelector('g.node.is-selected[data-key]')?.getAttribute('data-key');
    picked = key ? (space.blocks.find((b) => b.of === key) ?? picked) : null;
    pickedLine = pickedLine && (space.lines.find((l) => l.id === pickedLine?.id) ?? null);
    const other = space.blocks.map((b) => b.of).join() !== was;
    if (other && !warm) orbit = orbitFit(space, width / height);
    // the view follows the picked thing only where the drawing moved it; a pick, a fade or a find leaves the view still
    const now = picked && before && picked.of === before.of ? middleOf(picked) : null;
    const moved = !!now && now.some((v, i) => Math.abs(v - (before?.at[i] ?? v)) > 0.5);
    if (other || moved) orbit = centredOn(orbit, picked);
    glide.to(space, shown, shownOrbit, orbit);
  };
  if (!('marks' in from)) from.addEventListener(MARKED, marked);
  const close = () => {
    if (!open) return;
    open = false;
    if (!('marks' in from)) from.removeEventListener(MARKED, marked);
    opened.delete(root);
    sizer?.disconnect();
    painter.destroy();
    el.remove();
    closed();
  };
  // what the view turns round: the picked thing, or the whole, as a globe always spins round its middle
  const pivot = (): Vec3 => (picked && depth !== GLOBE ? middleOf(picked) : orbitFit(space).target);
  const move = (m: SpaceMove) => {
    // one move, from a key or a button, painted
    if ('back' in m) return close();
    if ('turn' in m) orbit = turnRound(orbit, ...m.turn, pivot());
    else if ('pan' in m) orbit = panBy(orbit, ...m.pan, height);
    else if ('zoom' in m) orbit = zoomBy(orbit, m.zoom);
    else if ('reset' in m) orbit = orbitFit(space, width / height);
    else if ('help' in m) showHelp(help.hidden !== false);
    again();
  };
  const pick = (block: Block | null) => {
    picked = block; // or none: its name shows and is said aloud
    pickedLine = null;
    said.setText(block ? (block.name ?? block.of ?? '') : '');
    again();
  };
  const pickLine = (line: SpaceLine) => {
    picked = null; // a link picked: its words show and are said aloud
    pickedLine = line;
    said.setText(line.words ?? '');
    again();
  };
  /** Tells the card what was picked, so it opens its details as a tap in 2D does. */
  const tell = (t: Target) => root.dispatchEvent(new CustomEvent<Target>(SPACE_OPEN, { detail: t, bubbles: true }));
  /** Turns the view to face `point`, which it then turns round and zooms to; gliding, unless motion is to be still. */
  const turnTo = (point: Vec3) => {
    const run = ++turning,
      going = () => run === turning && open;
    turnToward(win, orbit, point, (o) => ((orbit = o), paint()), going);
  };
  const flyTo = (block: Block) => {
    // flies to it: the camera looks at a ball's middle, or a block's top, from near
    const top = block.floor + (space.round ? block.tall / 2 : block.tall);
    const near = Math.max(block.width, block.depth, block.tall) * 4;
    orbit = focusOn(orbit, [block.x + block.width / 2, block.y + block.depth / 2, top], near);
    pick(block);
  };
  const depthWords = () => word(DEPTH_WORDS[depth] ?? 'space.spread');
  /** Shows it the `next` way, the picked thing kept and the view centred on it, and says how. */
  const showAs = (next: number) => {
    const [shown, shownOrbit] = [glide.settle(), orbit];
    depth = next;
    space = sketched(spaceBy(depths[depth] ?? null));
    picked = picked && (space.blocks.find((b) => b.of === picked?.of) ?? null);
    orbit = centredOn(orbit, picked);
    const label = depthWords();
    depthButton.setAttribute('aria-label', label);
    depthButton.hidden = depth % GLOBE === 0; // none for cards or the globe
    said.setText(label);
    glide.to(space, shown, shownOrbit, orbit);
  };
  // the buttons that move the view, and how it is shown in 3D: in space, or lifted by groups or by links
  const { depthButton, showHelp, help } = spacePad(el, depthWords(), move, () => showAs((depth % (GLOBE - 1)) + 1));
  depthButton.hidden = depth % GLOBE === 0;
  offerHeadset(el, depthButton.parentElement, seen, () => paints, tell); // in a headset (projection_spatial)
  // a touch in the view goes no further, so Obsidian's side-panel swipes never take it (gestures_stay_in_drawing).
  // pointers down now, by id: one turns, or moves with Shift or the right button; two move, pinch and twist
  const down = new Map<number, Touch>();
  let pans = false,
    touching = false,
    travel = 0,
    lastTap: { at: number; x: number; y: number } | null = null;
  touchesStay(el, down);
  const pinch = () => [...down.values()].slice(0, 2) as [Touch, Touch];
  el.addEventListener('pointerdown', (e) => {
    if ((e.target as Element | null)?.closest('.thoughtknot-space-pad')) return;
    down.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (down.size === 1) {
      touching = e.pointerType === 'touch';
      pans = e.shiftKey || e.button === 1 || e.button === 2;
      travel = 0;
    }
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    const was = down.get(e.pointerId);
    if (!was) return;
    turning++;
    const now = { x: e.clientX, y: e.clientY };
    if (down.size >= 2) {
      const before = pinch();
      down.set(e.pointerId, now);
      // the pinch zooms toward the middle of the two fingers, as a map does
      orbit = pinchBy(orbit, before, pinch(), el.getBoundingClientRect(), width, height, pivot());
      travel += TAP_SLOP;
    } else {
      down.set(e.pointerId, now);
      const dx = now.x - was.x,
        dy = now.y - was.y;
      travel += Math.abs(dx) + Math.abs(dy);
      // a finger turns the way it goes, as fingerTurn does; a mouse drags the camera round. Both turn round the pivot
      orbit = pans || e.shiftKey ? panBy(orbit, dx, dy, height) : turnRound(orbit, touching ? -dx : dx, dy, pivot());
    }
    again();
  });
  const unfold = (of: string) =>
    root.dispatchEvent(new CustomEvent<string>(SPACE_UNFOLD, { detail: of, bubbles: true }));
  const letGo = (e: PointerEvent) => {
    if (!down.delete(e.pointerId)) return;
    if (e.type !== 'pointerup' || down.size > 0 || travel > TAP_SLOP) return;
    // a click or tap: picks the thing under it; a second one soon after, in the same place, flies to it
    const at = el.getBoundingClientRect();
    const x = e.clientX - at.left,
      y = e.clientY - at.top;
    const hit = space.cards
      ? (cardAt(cardsOnScreen(seen(), matrixNow(), width, height), x, y)?.block ?? null)
      : blockAt(seen(), matrixNow(), width, height, x, y);
    // an open group's name zooms to it, and the button beside folds it back (cluster_fold_back)
    const strip = stripTap(space, matrixNow(), width, height, x, y);
    if (strip) return 'folds' in strip ? unfold(strip.folds) : ((orbit = orbitFit(strip.fit, width / height)), again());
    const link = hit ? null : lineAt(seen(), matrixNow(), width, height, x, y);
    const twice =
      lastTap &&
      e.timeStamp - lastTap.at < DOUBLE_TAP &&
      Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < TAP_SLOP * 4;
    lastTap = twice ? null : { at: e.timeStamp, x: e.clientX, y: e.clientY };
    // a click picks; another on what is picked turns to it, or opens it if a folded group (cluster_opens)
    if (hit && (twice || picked?.id === hit.id) && isCluster(hit.of)) unfold(hit.of ?? '');
    else if (twice && hit) flyTo(hit);
    else if (hit) {
      if (picked?.id === hit.id) return turnTo(middleOf(hit));
      pick(hit);
      if (hit.of !== undefined && !isPlane(hit.of)) tell({ key: hit.of });
    } else if (link) {
      if (pickedLine?.id === link.line.id) return turnTo(link.at);
      pickLine(link.line);
      const of = link.line.of ?? '';
      // a bundle or a hub's stub opens, as a tap on it in 2D does; a link opens its details
      if (FOLD.test(of)) unfold(of);
      else if (of !== '') tell({ link: Number(of) });
    } else pick(null);
  };
  el.addEventListener('pointerup', letGo);
  el.addEventListener('pointercancel', letGo);
  // a right-drag moves the view, so the right button opens no menu here
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // a trackpad pinch comes as a scroll with Ctrl held, in small steps, so it zooms faster. Both zoom toward the
      // pointer, as a map does
      const at = el.getBoundingClientRect(),
        times = Math.pow(e.ctrlKey ? 1.01 : 1.0015, -e.deltaY);
      orbit = zoomAtPixel(orbit, times, e.clientX - at.left, e.clientY - at.top, width, height);
      again();
      // zoomed in until a folded group fills the screen: it opens (cluster_opens)
      const full =
        e.deltaY < 0 && clusterFilling(space, matrixNow(), width, height, e.clientX - at.left, e.clientY - at.top);
      if (full) unfold(full);
    },
    { passive: false },
  );
  el.addEventListener('keydown', (e) => {
    // a button keeps Enter and Space for itself
    if ((e.target as Element | null)?.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
    const m = keyMove(e.key, e.shiftKey);
    if (e.key === 'Enter' && picked) flyTo(picked);
    else if (m) move(m);
    else return;
    e.preventDefault();
  });
  opened.set(root, close);
  resize();
  orbit = orbitFit(space, width / height);
  glideIn(el, orbit, (o) => ((orbit = o), again())); // it rises out of the flat drawing (space_glide)
  el.focus();
  // the bar's button: as cards, a globe, or 3D balls, lifted or not as the view's own button last left it
  const as = (mode: SpaceMode) => {
    const next = mode === 'cards' ? 0 : mode === 'globe' ? GLOBE : depth % GLOBE === 0 ? 1 : depth;
    if (next !== depth) showAs(next);
  };
  return { close, move, as };
}
