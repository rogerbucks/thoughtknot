// The 3D view of a card's drawing (editor spec §53, scale_space_view). Roger, 22 Oct 2026: a view you switch to from
// the bar, never the default, so people can explore a graph in depth. It lies over the drawing, under the card's bar,
// and goes by the bar's button or Escape (space-switch.ts). It only looks: nothing is edited here, and nothing reaches
// the note.
//
// It reads the drawing already on screen: each box, group and link of the SVG, with the colours the theme gave them.
// So it looks like the card in light and dark. The numbers live in core space-view.ts and space-spread.ts, and the
// painters in space-painter.ts and space-gpu-painter.ts.
//
// It is shown as cards in space (2.5D, space-cards.ts), or in 3D, one of three ways a button among its moves switches:
// - in space: laid out again in space, each thing a ball sized by its links, each link an arrow (space-spread.ts);
// - groups: the drawing lifted, each group a floor, and things stand on their group;
// - links: the drawing lifted, each thing as tall as its count of links, so the busiest things stand out.
// How to move it is on screen (space-controls.ts says each way): a help line at the foot, and buttons to zoom, turn
// and reset. Drag turns, Shift-drag or right-drag moves, scroll zooms; on touch, one finger turns and two move and
// pinch. A click or tap picks a thing or a link and names it; a double one flies to a thing. The keyboard does the same.
// What is picked is said aloud, and its name always shows (space-labels.ts).
//
// 2D and 3D are two views of the same graph (Roger, 24 Oct 2026). So a pick here opens the card's details for it, just
// as a tap in 2D does: the card hears SPACE_OPEN (viewport-events.ts). A bundle picked opens, as a tap on it in 2D does
// (SPACE_UNFOLD). A thing the card selects, as by Find, is picked
// here too. The view stays still. Another click on it makes
// it the point the view turns round and zooms to, the camera turning to face it (space-controls.ts, orbitAround). What
// the card hides, fades or brings forward, from its details' controls, the 3D view shows too, as the card marks it
// (focus_space).
import { word } from '@thoughtknot/core';
import type { DrawMark } from '../../drawing-marks.ts';
import { centredOn, focusOn, middleOf, orbitBy, orbitFit, spaceMatrix, spaceOf, zoomBy } from '../../space-view.ts';
import type { Block, DepthBy, Orbit, SpaceLine, SpaceMarks, Vec3 } from '../../space-view.ts';
import { blockAt, lineAt } from '../../space-pick.ts';
import { cardAt, cardsOnScreen, frameOf } from '../../space-cards.ts';
import { spreadSpace } from '../../space-spread.ts';
import { keyMove, orbitAround, panBy, twistBy, twistOf, twoFingers } from '../../space-controls.ts';
import type { SpaceMove, Touch } from '../../space-controls.ts';
import { pickPainter } from './mark-painter.ts';
import type { Paints } from './mark-painter.ts';
import { webgl2SpacePainter } from './space-painter.ts';
import { canvasSpacePainter, paintSpaceLabels } from './space-canvas-painter.ts';
import type { SpacePainter } from './space-painter.ts';
import { webgpuSpacePainter } from './space-gpu-painter.ts';
import { DEPTH_WORDS, linkCounts, spacePad } from './space-view-pad.ts';
import { marksOfSvg } from './svg-marks.ts';
import { reducedMotion } from './details-nav';
import { MARKED } from './focus-marks';
import type { Target } from './taps';

/** The event a pick in the 3D view sends its card, with the thing or link picked: the card opens its details. */
export const SPACE_OPEN = 'thoughtknot-space-open';

/** The event a bundle or a hub's stub picked in 3D sends its card, with its fold. The card opens it (§25). */
export const SPACE_UNFOLD = 'thoughtknot-space-unfold';

/** How long the view takes to turn to face what was picked, in milliseconds. */
const TURN_TIME = 280;

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
  let { marks, paints } = 'marks' in from ? from : marksOfSvg(from);
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
  // a card with no background of its own shows the page's: the label halo uses the system's page colour then
  const background = win.getComputedStyle(root).backgroundColor;
  const halo = !background || background === 'transparent' || /,\s*0\)$/.test(background) ? 'Canvas' : background;
  // the picked thing's ring: the card's text colour, the strongest contrast with its page in either theme
  const ink = win.getComputedStyle(root).color || 'CanvasText';
  // the ways to show it: in space as cards (the first, Roger, 24 Oct 2026) or balls, or the drawing lifted as it is
  const depthsOf = (): Depth[] => ['cards', null, { by: 'group' }, { by: 'size', sizes: linkCounts(marks) }];
  let depths = depthsOf();
  const spaceBy = (by: Depth): SpaceMarks =>
    by === 'cards' || !by ? spreadSpace(marks, undefined, by === 'cards', more.asDrawn).space : spaceOf(marks, by);
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
    ({ marks, paints } = marksOfSvg(from));
    depths = depthsOf();
    space = spaceBy(depths[depth] ?? null);
    // what the card selects now is picked here too: a thing found, or none once its details close
    const key = from.querySelector('g.node.is-selected[data-key]')?.getAttribute('data-key');
    picked = key ? (space.blocks.find((b) => b.of === key) ?? picked) : null;
    pickedLine = pickedLine && (space.lines.find((l) => l.id === pickedLine?.id) ?? null);
    const other = space.blocks.map((b) => b.of).join() !== was;
    if (other) orbit = orbitFit(space, width / height);
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

  /** Makes one move, from a key or a button, and paints it. */
  const move = (m: SpaceMove) => {
    if ('back' in m) return close();
    if ('turn' in m) orbit = orbitBy(orbit, ...m.turn);
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
    const from = orbit,
      run = ++turning;
    if (reducedMotion(win)) {
      orbit = orbitAround(from, point);
      return again();
    }
    const start = win.performance.now();
    const step = (now: number) => {
      if (run !== turning || !open) return;
      const t = Math.min(1, (now - start) / TURN_TIME);
      orbit = orbitAround(from, point, 1 - (1 - t) * (1 - t));
      paint();
      if (t < 1) win.requestAnimationFrame(step);
    };
    win.requestAnimationFrame(step);
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

  // a touch in the view goes no further, so the host's own swipes (Obsidian's side panels) never take it (gestures_stay_in_drawing)
  for (const type of ['touchstart', 'touchmove'])
    el.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  // pointers down now, by id: one turns, or moves with Shift or the right button; two move, pinch and twist
  const down = new Map<number, Touch>();
  let pans = false,
    travel = 0,
    lastTap: { at: number; x: number; y: number } | null = null;
  const pinch = () => [...down.values()].slice(0, 2) as [Touch, Touch];
  el.addEventListener('pointerdown', (e) => {
    if ((e.target as Element | null)?.closest('.thoughtknot-space-pad')) return;
    down.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (down.size === 1) {
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
      const { dx, dy, zoom } = twoFingers(before, pinch());
      orbit = twistBy(zoomBy(panBy(orbit, dx, dy, height), zoom), twistOf(before, pinch()));
      travel += TAP_SLOP;
    } else {
      down.set(e.pointerId, now);
      const dx = now.x - was.x,
        dy = now.y - was.y;
      travel += Math.abs(dx) + Math.abs(dy);
      orbit = pans || e.shiftKey ? panBy(orbit, dx, dy, height) : orbitBy(orbit, dx, dy);
    }
    again();
  });
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
    const link = hit ? null : lineAt(space, matrixNow(), width, height, x, y);
    const twice =
      lastTap &&
      e.timeStamp - lastTap.at < DOUBLE_TAP &&
      Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < TAP_SLOP * 4;
    lastTap = twice ? null : { at: e.timeStamp, x: e.clientX, y: e.clientY };
    // the first click only picks and shows its details; another on what is picked turns the view to it (Roger, 24 Oct)
    if (twice && hit) flyTo(hit);
    else if (hit) {
      if (picked?.id === hit.id) return turnTo(middleOf(hit));
      pick(hit);
      if (hit.of !== undefined) tell({ key: hit.of });
    } else if (link) {
      if (pickedLine?.id === link.line.id) return turnTo(link.at);
      pickLine(link.line);
      const of = link.line.of ?? '';
      // a bundle or a hub's stub opens, as a tap on it in 2D does; a link opens its details
      if (FOLD.test(of)) root.dispatchEvent(new CustomEvent<string>(SPACE_UNFOLD, { detail: of, bubbles: true }));
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
      // a pinch on a trackpad comes as a scroll with Ctrl held, in small steps: it zooms faster
      orbit = zoomBy(orbit, Math.pow(e.ctrlKey ? 1.01 : 1.0015, -e.deltaY));
      again();
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
  el.focus();
  const cards = (on: boolean) => {
    if (on !== (depth === 0)) showAs(on ? 0 : 1);
  };
  return { close, move, cards };
}
