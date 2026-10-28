// The 3D view of a card's drawing (editor spec §53, scale_space_view), switched to from the bar (Roger, 22 Oct 2026).
// It lies over the drawing, under the bar, and goes by the bar's button or Escape. It only looks: nothing reaches the
// note. It reads each box, group and link on screen, in the theme's colours. The sums are in space-view.ts and
// space-spread.ts. The painters are in space-painter.ts and space-gpu-painter.ts.
//
// It shows cards in space (2.5D, space-cards.ts), or 3D in one of three ways. Things are laid out again as balls sized
// by their links (space-spread.ts). Or each group is a floor its things stand on. Or each thing is as tall as its links.
// How to move it is on screen (space-controls.ts): drag turns, Shift-drag or right-drag moves, scroll zooms.
// 2D and 3D are two views of one graph (Roger, 24 Oct 2026). A first click picks a thing and opens its details on the
// card (SPACE_OPEN, viewport-events.ts). Another turns the view to it (orbitAround). A bundle picked opens (SPACE_UNFOLD).
// So does a folded group picked again, or zoomed into until it fills the screen. A thing the card selects is picked
// here too. What the card hides, fades or brings forward, the 3D view shows too (focus_space).
import { word } from '@thoughtknot/core';
import type { DrawMark } from '../../drawing-marks.ts';
import { centredOn, focusOn, middleOf, orbitFit, spaceMatrix, spaceOf, zoomBy } from '../../space-view.ts';
import type { Block, DepthBy, Orbit, SpaceLine, SpaceMarks, Vec3 } from '../../space-view.ts';
import type { LayoutOptions } from '../../layouts/layout-options.ts';
import { blockAt, lineAt } from '../../space-pick.ts';
import { cardAt, cardsOnScreen, clusterFilling, frameOf, isCluster } from '../../space-cards.ts';
import { spreadSpace } from '../../space-spread.ts';
import { spotsKept } from '../../space-parts.ts';
import { stripTap } from '../../space-outlines.ts';
import type { Spots } from '../../layouts/layouts.ts';
import { isPlane, stackedPlanes } from '../../space-planes.ts';
import { keyMove, panBy, pinchBy, touchesStay, turnRound, zoomAtPixel } from '../../space-controls.ts';
import type { SpaceMove, Touch } from '../../space-controls.ts';
import { pickPainter } from './mark-painter.ts';
import type { Paints } from './mark-painter.ts';
import { webgl2SpacePainter } from './space-painter.ts';
import { backgroundOf, canvasSpacePainter, paintSpaceLabels } from './space-canvas-painter.ts';
import type { SpacePainter } from './space-painter.ts';
import { webgpuSpacePainter } from './space-gpu-painter.ts';
import { DEPTH_WORDS, glideIn, linkCounts, spacePad, turnToward } from './space-view-pad.ts';
import { heldIn } from './svg-marks.ts';
import { sketchedSpace, sketchPainted, type Sketch } from './space-sketch.ts';
import { MARKED } from './focus-marks';
import type { Target } from './taps';

/** The event a pick in the 3D view sends its card, with the thing or link picked: the card opens its details. */
export const SPACE_OPEN = 'thoughtknot-space-open';

/** The event a bundle or a hub's stub picked in 3D sends its card, with its fold. The card opens it (§25). */
export const SPACE_UNFOLD = 'thoughtknot-space-unfold';

/** The close of the 3D view open on each card, so a second press of 3D view closes it rather than stacking one more. */
const opened = new WeakMap<HTMLElement, () => void>();

/** What a line's key is when it is a fold to open, not a link: a bundle, a hub's stub or a group's box (§25). */
const FOLD = /^(bundle|hub|group):/;

/** How far a pointer may move, in pixels, and still be a click or tap rather than a drag. */
const TAP_SLOP = 6;
/** How soon a second click or tap must follow the first to fly, in milliseconds. */
const DOUBLE_TAP = 350;

/** A way to show the view: as cards or balls in space (null), or lifted, with height by what DepthBy says. */
type Depth = DepthBy | 'cards' | null;

/** How the view opens: as cards or in 3D; and whether each thing stays where its diagram type drew it (space_follows_type). */
export interface SpaceOptions {
  cards?: boolean;
  asDrawn?: boolean;
  layout?: () => Partial<LayoutOptions> | undefined; // as the View menu spaces it (layout_saved_with_view)
  /** The drawings over the graph as shown now, laid on what they are pinned to in space (§70); none while hidden. */
  sketch?: () => Sketch | null;
}

/** An open 3D view: how to close it, move it as the card's bar asks, and show it as cards or in 3D. */
export interface SpaceView {
  close: () => void;
  move: (m: SpaceMove) => void;
  cards: (on: boolean) => void;
}

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
  const painter = await pickPainter<SpacePainter>(shapes, [webgpuSpacePainter, webgl2SpacePainter, canvasSpacePainter]);
  const ctx = words.getContext('2d');
  if (!painter || !ctx) {
    el.remove();
    return null;
  }
  for (const type of KEPT) el.addEventListener(type, (e) => e.stopPropagation());
  const said = el.createDiv({ cls: 'thoughtknot-space-said', attr: { 'aria-live': 'polite' } });
  const win = el.win;
  // the label halo is the colour behind the view: the first painted one up from it, as the theme sets it. The system's
  // page colour is the last resort: a phone in light mode has a white one under a dark theme (Roger, 25 Oct 2026)
  const halo = backgroundOf(el);
  // the picked thing's ring: the card's text colour, the strongest contrast with its page in either theme
  const ink = win.getComputedStyle(root).color || 'CanvasText';
  // the ways to show it: in space as cards (the first, Roger, 24 Oct 2026) or balls, or the drawing lifted as it is
  const depthsOf = (): Depth[] => ['cards', null, { by: 'group' }, { by: 'size', sizes: linkCounts(marks) }];
  let depths = depthsOf();
  // laid out again, each thing starts where it was, so a group opens or folds in place (cluster_in_place)
  let spots: Spots<3> | undefined,
    held = new Map('marks' in from ? [] : heldIn(from));
  const spaceBy = (by: Depth): SpaceMarks => {
    if (by !== 'cards' && by) return sketchedSpace(spaceOf(marks, by), from, more.sketch, marks);
    const laid = spreadSpace(marks, spots && spotsKept(spots, held), by === 'cards', more.asDrawn, more.layout?.());
    spots = laid.spots;
    return sketchedSpace(stackedPlanes(laid.space), from, more.sketch, marks);
  };
  // a drawing opens as cards, or in 3D; an overview's groups (massive-paints.ts) are no things to lay out: it is lifted
  let depth = 'marks' in from ? (marks.some((m) => m.kind === 'group') ? 2 : 3) : more.cards === false ? 1 : 0;
  let space: SpaceMarks = spaceBy(depths[depth] ?? null);
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
  const paint = () => {
    asked = false;
    if (!open) return;
    const matrix = matrixNow();
    const frame = frameOf(space, matrix, width, height, picked, pickedLine?.id);
    painter.paint(frame.shapes, matrix, paints);
    paintSpaceLabels(ctx, frame, paints, win.devicePixelRatio || 1, halo, ink);
  };
  const again = () => {
    if (asked) return;
    asked = true;
    win.requestAnimationFrame(paint);
  };
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
    ({ marks, paints } = sketchPainted(from));
    depths = depthsOf();
    // each box shown before or now, so a thing from a box just opened starts where the box was, and the view stays
    held = new Map([...held, ...heldIn(from)]);
    const warm = !!spots && !more.asDrawn;
    space = spaceBy(depths[depth] ?? null);
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
    again();
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

  /** What the view turns round: the picked thing, else the drawing's middle (Roger, 25 Oct 2026). */
  const pivot = (): Vec3 => (picked ? middleOf(picked) : orbitFit(space).target);
  /** Makes one move, from a key or a button, and paints it. */
  const move = (m: SpaceMove) => {
    if ('back' in m) return close();
    if ('turn' in m) orbit = turnRound(orbit, ...m.turn, pivot());
    else if ('pan' in m) orbit = panBy(orbit, ...m.pan, height);
    else if ('zoom' in m) orbit = zoomBy(orbit, m.zoom);
    else if ('reset' in m) orbit = orbitFit(space, width / height);
    else if ('help' in m) showHelp(help.hidden !== false);
    again();
  };
  /** Picks `block`, or none: its name shows and is said aloud. */
  const pick = (block: Block | null) => {
    picked = block;
    pickedLine = null;
    said.setText(block ? (block.name ?? block.of ?? '') : '');
    again();
  };
  /** Picks the link `line`: its words show and are said aloud. */
  const pickLine = (line: SpaceLine) => {
    picked = null;
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
  /** Flies to `block`: the camera looks at its top from near. */
  const flyTo = (block: Block) => {
    // a ball is looked at from its middle, a block from its top
    const top = block.floor + (space.round ? block.tall / 2 : block.tall);
    const near = Math.max(block.width, block.depth, block.tall) * 4;
    orbit = focusOn(orbit, [block.x + block.width / 2, block.y + block.depth / 2, top], near);
    pick(block);
  };

  const depthWords = () => word(DEPTH_WORDS[depth] ?? 'space.spread');
  /** Shows it the `next` way, the picked thing kept and the view centred on it, and says how. */
  const showAs = (next: number) => {
    depth = next;
    space = spaceBy(depths[depth] ?? null);
    picked = picked && (space.blocks.find((b) => b.of === picked?.of) ?? null);
    orbit = centredOn(orbit, picked);
    const label = depthWords();
    depthButton.setAttribute('aria-label', label);
    depthButton.hidden = depth === 0;
    said.setText(label);
    again();
  };
  // the buttons that move the view, and how it is shown in 3D: in space, or lifted by groups or by links
  const { depthButton, showHelp, help } = spacePad(el, depthWords(), move, () =>
    showAs((depth % (depths.length - 1)) + 1),
  );
  depthButton.hidden = depth === 0;

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
      orbit = pinchBy(orbit, before, pinch(), el.getBoundingClientRect(), width, height);
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
      ? (cardAt(cardsOnScreen(space, matrixNow(), width, height), x, y)?.block ?? null)
      : blockAt(space, matrixNow(), width, height, x, y);
    // an open group's name zooms to it, and the button beside folds it back (cluster_fold_back)
    const strip = stripTap(space, matrixNow(), width, height, x, y);
    if (strip) return 'folds' in strip ? unfold(strip.folds) : ((orbit = orbitFit(strip.fit, width / height)), again());
    const link = hit ? null : lineAt(space, matrixNow(), width, height, x, y);
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
    if ((e.target as Element | null)?.closest('button')) {
      // a button keeps Enter and Space for itself
      if (e.key === 'Enter' || e.key === ' ') return;
    }
    if (e.key === 'Enter' && picked) flyTo(picked);
    else {
      const m = keyMove(e.key, e.shiftKey);
      if (!m) return;
      move(m);
    }
    e.preventDefault();
  });

  opened.set(root, close);
  resize();
  orbit = orbitFit(space, width / height);
  glideIn(el, orbit, (o) => ((orbit = o), again())); // it rises out of the flat drawing (space_glide)
  el.focus();
  const cards = (on: boolean) => {
    if (on !== (depth === 0)) showAs(on ? 0 : 1);
  };
  return { close, move, cards };
}
