// Editing in 2.5D, 3D and on the globe, as in 2D (editor spec §72, edit_gestures, edit_every_view). Roger, 5 Nov 2026
// (Q-19): one way of editing in every view. The view asks its card, which writes, as a 2D drawing's gestures do.
// - A double click on a thing opens its name for typing, in the editor beside it. Where the card cannot be written, it
//   flies to the thing, as before.
// - A double click on empty space adds a thing, its name open.
// - Pressed on the thing picked and dragged, a line follows the pointer. Let go on another thing, it links the two.
//   A drag that starts anywhere else turns the view, as ever. Escape lets go of the line, and writes nothing.
import { word } from '@thoughtknot/core';
import { blockAt } from '../../space-pick.ts';
import { cardAt, cardsOnScreen } from '../../space-cards.ts';
import type { Block, SpaceMarks } from '../../space-view.ts';

/** The event the view sends its card to ask for an edit. The card calls preventDefault once it takes it. */
export const SPACE_EDIT = 'thoughtknot-space-edit';

/** An edit the view asks for: a thing's name opened, a thing added, or a link from one thing to another. */
export type SpaceEdit = { rename: string } | { add: true } | { link: [string, string] };

/** Asks the card round `root` for `edit`. Whether it took it: none is taken where the card cannot be written. */
export const askEdit = (root: HTMLElement, edit: SpaceEdit): boolean =>
  !root.dispatchEvent(new CustomEvent<SpaceEdit>(SPACE_EDIT, { detail: edit, bubbles: true, cancelable: true }));

/** The thing at pixel `x`, `y` of a `width` by `height` view, as `matrix` shows `seen` of `space`; else none. */
export function blockHit(
  space: SpaceMarks,
  seen: SpaceMarks,
  matrix: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): Block | null {
  return space.cards
    ? (cardAt(cardsOnScreen(seen, matrix, width, height), x, y)?.block ?? null)
    : blockAt(seen, matrix, width, height, x, y);
}

const SVG = 'http://www.w3.org/2000/svg';

/** Where pointer event `e` falls in `el`, in pixels from its top left corner. */
export const pointerAt = (el: HTMLElement, e: PointerEvent): [number, number] => {
  const at = el.getBoundingClientRect();
  return [e.clientX - at.left, e.clientY - at.top];
};

/** How far, in pixels, a press may move and still be a click, not a drag to link. */
const SLOP = 6;

/** The line drawn from the picked thing to the pointer, while it is dragged to another thing to link to it. */
export class SpaceLinkDrag {
  private from: string | null = null;
  /** Where the press that started the line was, in pixels. */
  private at: [number, number] = [0, 0];
  /** What letting go nowhere says. */
  private nowhere = '';
  private line: SVGLineElement | null = null;
  private svg: SVGSVGElement | null = null;

  private readonly el: HTMLElement;
  private readonly root: HTMLElement;
  private readonly said: HTMLElement;
  private readonly hit: (x: number, y: number) => Block | null;

  /**
   * For the view `el` in the card round `root`. It says what letting go would do in `said`, and finds the thing at a
   * pixel by `hit`. A press with the main button on the thing `picked` starts a line. Escape lets go of it.
   */
  constructor(
    el: HTMLElement,
    root: HTMLElement,
    said: HTMLElement,
    hit: (x: number, y: number) => Block | null,
    picked: () => Block | null,
  ) {
    [this.el, this.root, this.said, this.hit] = [el, root, said, hit];
    el.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || e.button !== 0 || e.shiftKey) return;
      if ((e.target as Element | null)?.closest('.thoughtknot-space-pad')) return;
      const at = pointerAt(el, e),
        p = picked();
      if (p?.of !== undefined && this.hit(...at)?.id === p.id) this.start(p.of, p.name ?? p.of, ...at);
    });
    el.addEventListener('pointerup', (e) => this.letGo(e));
    el.addEventListener('pointercancel', (e) => this.letGo(e));
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || this.end() === null) return;
      this.said.setText('');
      e.preventDefault();
    });
  }

  /** The pointer moved by `e`. Whether a line follows it, so the view does not turn. */
  drag(e: PointerEvent): boolean {
    if (!this.on || !e.isPrimary) return this.on;
    const at = pointerAt(this.el, e);
    this.move(...at, this.hit(...at)?.name ?? null);
    return true;
  }

  /** Let go by `e`. Dragged onto another thing, it asks the card for the link. */
  private letGo(e: PointerEvent): void {
    if (!e.isPrimary) return;
    const from = this.end(),
      at = pointerAt(this.el, e);
    if (from === null || e.type !== 'pointerup' || Math.hypot(at[0] - this.at[0], at[1] - this.at[1]) <= SLOP) return;
    const to = this.hit(...at)?.of;
    if (to !== undefined && to !== from) askEdit(this.root, { link: [from, to] });
  }

  /** Whether a line is being dragged. */
  get on(): boolean {
    return this.from !== null;
  }

  /** Starts a line from thing `from`, named `name`, at pixel `x`, `y` of the view. */
  start(from: string, name: string, x: number, y: number): void {
    this.end();
    this.from = from;
    this.at = [x, y];
    const doc = this.el.ownerDocument;
    const svg = (this.svg = doc.createElementNS(SVG, 'svg'));
    svg.setAttribute('class', 'thoughtknot-space-link-line');
    svg.setAttribute('aria-hidden', 'true');
    const line = (this.line = doc.createElementNS(SVG, 'line'));
    for (const [k, v] of [
      ['x1', x],
      ['y1', y],
      ['x2', x],
      ['y2', y],
    ] as const)
      line.setAttribute(k, String(v));
    svg.appendChild(line);
    this.el.appendChild(svg);
    this.nowhere = word('edit.drop-nowhere', { thing: name });
    this.said.setText(this.nowhere);
  }

  /** The pointer at `x`, `y`, over the thing named `over`, if any. */
  move(x: number, y: number, over: string | null): void {
    this.line?.setAttribute('x2', String(x));
    this.line?.setAttribute('y2', String(y));
    this.said.setText(over ? word('edit.drop-link-here', { other: over }) : this.nowhere);
  }

  /** Lets go of the line: the thing it started from, else none. */
  end(): string | null {
    const from = this.from;
    this.from = null;
    this.svg?.remove();
    this.svg = this.line = null;
    return from;
  }
}
