// A board opened in a host (editor spec §45, board_view and board_keyboard). The board is drawn as one picture
// (board-svg.ts) in a viewport. It works with the gestures of a drawing: the core's Zoom pans, zooms and pinches it.
// A mouse or pen drags an item to move it. The keyboard does everything else (board-keys.ts), and each step is said in
// a live region. The outline under it lists the whole board as text.
//
// Every edit goes to the host as a change to the board block, and the board is drawn again from what was written. The
// view stays where it was, and so does every item not changed: nothing jumps (nodes stay put, never disorient). A host
// that draws the block afresh after a write gets the same view and focus back, kept by its `key`.
import { word, Zoom } from '@thoughtknot/core';
import type { Drawn, Palette, View } from '@thoughtknot/core';
import { boardOf, readBoard, type Board } from '../../board.ts';
import { boardEditInNote, type BoardChange } from '../../board-edit.ts';
import { capture, type CaptureHow } from '../../board-capture.ts';
import { boardKey, NO_CURSOR, type BoardCursor } from '../../board-keys.ts';
import { boardOutline, boardSvg, itemBox } from '../../board-svg.ts';
import { parsedSvg } from '../graph-view/drawing-svg';

export { boardEditInNote, boardOf };

/** What a board needs of its host. */
export interface BoardHost {
  /** The colours to draw in. */
  palette: Palette;
  /** Writes an edit to the board block in the note; resolves to the block as now written, or why it was refused. */
  write?: (change: BoardChange) => Promise<{ text: string } | { refused: string }>;
  /** What names this board in its host, such as its note and name, so its view is kept when it is drawn again. */
  key: string;
}

/** The view and keyboard of each board drawn, by its host's key, for when it is drawn again. */
const kept = new Map<string, { place: View; cursor: BoardCursor; focused: boolean }>();
/** How tall a board's viewport is in a note, in pixels. */
const HEIGHT = 420;
/** How far a pointer moves before a press is a drag, in pixels. */
const SLOP = 4;
let boardsShown = 0;

type Point = { x: number; y: number };

/** The board in `source` opened in `el`. */
export function showBoard(el: HTMLElement, source: string, host: BoardHost): void {
  new BoardView(el, source, host);
}

/** One board open in a host: its parts, its view and where the keyboard is on it. */
class BoardView {
  private board: Board;
  private cursor: BoardCursor;
  private readonly readOnly: boolean;
  private readonly vp: HTMLElement;
  private readonly said: HTMLElement;
  private readonly editor: HTMLElement;
  private readonly list: HTMLElement;
  private frame: Box;
  private readonly zoom: Zoom;
  private svg: SVGSVGElement | null = null;
  /** An item a mouse or pen is dragging. */
  private drag: { pointer: number; id: string; from: Point; moved: boolean } | null = null;
  /** A press on an item that does not drag it: if it lifts where it came down, it is a tap, which chooses the item. */
  private tap: { pointer: number; id: string; from: Point } | null = null;

  constructor(
    el: HTMLElement,
    source: string,
    private readonly host: BoardHost,
  ) {
    this.board = readBoard(source).board;
    const was = kept.get(host.key);
    this.cursor = was?.cursor ?? NO_CURSOR;
    this.readOnly = !host.write;
    const root = el.createDiv({ cls: ['thoughtknot', 'thoughtknot-board'] });
    const helpId = `thoughtknot-board-help-${(boardsShown += 1)}`;
    this.vp = root.createDiv({
      cls: 'thoughtknot-viewport',
      attr: {
        tabindex: 0,
        role: 'group',
        'aria-roledescription': word('board.role'),
        'aria-label': word('board.title', { name: this.board.name }),
        'aria-describedby': helpId,
      },
    });
    const text = word(this.readOnly ? 'board.help-read' : 'board.help');
    root.createEl('p', { cls: 'thoughtknot-board-help', text, attr: { id: helpId } });
    this.said = root.createDiv({ cls: 'thoughtknot-board-said', attr: { role: 'status', 'aria-live': 'polite' } });
    this.editor = root.createDiv({ cls: 'thoughtknot-board-edit' });
    this.editor.hidden = true;
    const outline = root.createEl('details', { cls: 'thoughtknot-board-outline' });
    outline.createEl('summary', { text: word('board.outline') });
    this.list = outline.createEl('ul');
    this.frame = frameOf(this.board);
    this.zoom = new Zoom({ width: this.frame.w, height: this.frame.h }, this.size(), 'note');
    this.zoom.onChange = (v) => this.apply(v);
    this.draw();
    if (was) this.zoom.restore(was.place.scale, was.place.x, was.place.y);
    if (was?.focused) this.vp.focus({ preventScroll: true });
    this.bind();
  }

  private size() {
    return { width: this.vp.getBoundingClientRect().width || 600, height: HEIGHT };
  }

  private say(words?: string) {
    if (words) this.said.setText(words);
  }

  /** Puts the picture where the view is, and keeps the view for when the board is drawn again. */
  private apply(v: View): void {
    this.svg?.setAttribute('width', String(v.width));
    this.svg?.setAttribute('height', String(v.height));
    this.vp.setCssProps({
      '--thoughtknot-x': `${v.x}px`,
      '--thoughtknot-y': `${v.y}px`,
      '--thoughtknot-height': `${HEIGHT}px`,
      '--thoughtknot-touch': this.zoom.touchAction(),
    });
    this.vp.toggleClass('is-zoomed', this.zoom.zoomedIn());
    const focused = activeDocument.activeElement === this.vp;
    kept.set(this.host.key, { place: v, cursor: this.cursor, focused });
  }

  /** The board drawn again, the view kept on the same spot of the board even when its edges moved. */
  private draw(): void {
    const was = this.frame,
      v = this.zoom.view();
    this.frame = frameOf(this.board);
    this.zoom.resize(this.size(), { width: this.frame.w, height: this.frame.h });
    this.zoom.restore(v.scale, v.x + (this.frame.x - was.x) * v.scale, v.y + (this.frame.y - was.y) * v.scale);
    const next = parsedSvg({ svg: boardSvg(this.board, this.host.palette) } as Drawn);
    next.addClass('thoughtknot-svg');
    this.vp.replaceChildren(next); // the viewport holds the picture alone
    this.svg = next;
    for (const g of Array.from(next.querySelectorAll('[data-item]')))
      g.toggleClass('is-focused', g.getAttribute('data-item') === this.cursor.focus);
    this.list.empty();
    for (const line of boardOutline(this.board))
      this.list.createEl('li', { text: line.said, attr: { 'data-item': line.id, 'data-depth': line.depth } });
    if (!this.board.items.length) this.list.createEl('li', { text: word('board.empty') });
    this.apply(this.zoom.view());
  }

  /** Writes an edit, then draws what was written; a refusal is said and changes nothing. */
  private async write(change: BoardChange): Promise<void> {
    const r = await this.host
      .write?.(change)
      .catch((e: unknown) => ({ refused: word('board.write-failed', { why: String(e) }) }));
    if (!r) return;
    if ('refused' in r) return this.say(r.refused);
    this.board = readBoard(r.text).board;
    this.draw();
  }

  /** The item in focus brought into view; the view moves only when it is out of sight. */
  private reveal(): void {
    const item = this.board.items.find((i) => i.id === this.cursor.focus);
    if (!item) return;
    const b = itemBox(item),
      f = this.frame;
    this.zoom.reveal({ x: (b.x - f.x) / f.w, y: (b.y - f.y) / f.h, width: b.w / f.w, height: b.h / f.h });
  }

  /** The middle of the view, in board units. */
  private centre(): [number, number] {
    const v = this.zoom.view(),
      s = this.size();
    return [this.frame.x + (s.width / 2 - v.x) / v.scale, this.frame.y + (s.height / 2 - v.y) / v.scale];
  }

  private point(e: { clientX: number; clientY: number }): Point {
    const r = this.vp.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private bind(): void {
    const { vp, zoom } = this;
    vp.addEventListener('keydown', (e: KeyboardEvent) => this.key(e));
    vp.addEventListener('pointerdown', (e: PointerEvent) => this.down(e));
    vp.addEventListener('pointermove', (e: PointerEvent) => this.move(e));
    vp.addEventListener('pointerup', (e: PointerEvent) => this.lift(e));
    vp.addEventListener('pointercancel', (e: PointerEvent) => this.lift(e));
    const wheel = (e: WheelEvent) => {
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      if (zoom.handle({ kind: 'wheel', ...this.point(e), dy, ctrl: e.ctrlKey, meta: e.metaKey })) e.preventDefault();
    };
    vp.addEventListener('wheel', wheel, { passive: false });
    vp.addEventListener('dblclick', (e: MouseEvent) => {
      const onBox = !!(e.target as Element | null)?.closest?.('[data-item]');
      if (zoom.handle({ kind: 'dblclick', ...this.point(e), onBox })) e.preventDefault();
    });
    vp.addEventListener('touchend', (e: TouchEvent) => zoom.settle(e.touches?.length ?? 0));
    new ResizeObserver(() => zoom.resize(this.size())).observe(vp);
  }

  /** A key: the board's own first (board-keys.ts), else the zoom's. */
  private key(e: KeyboardEvent): void {
    if (e.target !== this.vp) return;
    const press = { key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey };
    const step = boardKey(this.board, this.cursor, press, this.centre(), this.readOnly);
    if (!step) {
      // typing on an empty spot starts quick capture (board_quick_capture)
      if (!this.readOnly && !this.cursor.focus && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.openCapture('spot', null, e.key);
        return;
      }
      if (this.zoom.handle({ kind: 'key', key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey }))
        e.preventDefault();
      if (e.key === 'Tab') {
        this.cursor = NO_CURSOR; // past the last item: focus leaves the board
        this.draw();
      }
      return;
    }
    e.preventDefault();
    this.cursor = step.cursor;
    this.say(step.said);
    if (step.pan) this.zoom.panBy(...step.pan);
    const after = () => {
      this.reveal();
      if (step.edit) this.openEditor(step.edit);
    };
    if (step.change) void this.write(step.change).then(after);
    else {
      this.draw();
      after();
    }
  }

  /** The text of an item, edited in a field under the board: Enter or Save writes it, Escape or Cancel leaves it. */
  private openEditor(id: string): void {
    const item = this.board.items.find((i) => i.id === id);
    if (!item || this.readOnly) return;
    const { editor } = this;
    editor.empty();
    editor.hidden = false;
    const name = boardOutline(this.board).find((l) => l.id === id)?.said ?? id;
    const field = editor.createEl('textarea', {
      attr: { 'aria-label': word('board.text-of', { item: name }), rows: 2 },
    });
    field.value = item.text ?? '';
    const close = () => {
      editor.hidden = true;
      editor.empty();
      this.vp.focus({ preventScroll: true });
    };
    const save = () => {
      const value = field.value;
      close();
      if (value !== (item.text ?? '')) void this.write({ kind: 'text', id, text: value });
    };
    editor.createEl('button', { text: word('board.save') }).addEventListener('click', save);
    editor.createEl('button', { text: word('board.cancel') }).addEventListener('click', close);
    field.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && (e.key !== 'Enter' || e.shiftKey)) return;
      e.preventDefault();
      if (e.key === 'Enter') save();
      else close();
    });
    field.focus();
  }

  /**
   * A field to catch ideas in: Enter catches the note and opens the next beside it, Tab catches a child joined to it,
   * Escape ends. `last` is the note caught before; `first` is what was already typed.
   */
  private openCapture(how: CaptureHow, last: string | null, first = ''): void {
    const { editor } = this;
    editor.empty();
    editor.hidden = false;
    const field = editor.createEl('textarea', { attr: { 'aria-label': word('board.capture.field'), rows: 2 } });
    field.value = first;
    const close = () => {
      editor.hidden = true;
      editor.empty();
      this.vp.focus({ preventScroll: true });
    };
    field.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') return (e.preventDefault(), close());
      if ((e.key !== 'Enter' && e.key !== 'Tab') || e.shiftKey) return;
      e.preventDefault();
      const from = this.board.items.find((i) => i.id === last) ?? null;
      const r = capture(
        this.board,
        last ? (e.key === 'Tab' ? 'child' : how === 'spot' ? 'next' : how) : 'spot',
        field.value,
        from,
        this.centre(),
      );
      if ('refused' in r) return this.say(r.refused);
      void this.catchAll(r.changes).then(() => {
        this.say(r.said);
        this.cursor = { ...this.cursor, focus: r.item.id };
        this.openCapture(e.key === 'Tab' ? 'child' : 'next', r.item.id);
        this.reveal();
      });
    });
    field.focus();
  }

  /** Writes edits one after the other, stopping at the first refusal. */
  private async catchAll(changes: BoardChange[]): Promise<void> {
    for (const c of changes) await this.write(c);
  }

  /** A press: a mouse or pen on an item starts to drag it; anything else pans, zooms and pinches, as on a drawing. */
  private down(e: PointerEvent): void {
    const id = (e.target as Element | null)?.closest?.('[data-item]')?.getAttribute('data-item') ?? null;
    const item = this.board.items.find((i) => i.id === id);
    const pointer = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
    if (item && pointer !== 'touch' && e.button === 0 && !this.readOnly && !item.locked) {
      this.drag = { pointer: e.pointerId, id: item.id, from: this.point(e), moved: false };
      this.vp.setPointerCapture(e.pointerId);
      this.vp.focus({ preventScroll: true });
      return;
    }
    this.tap = item ? { pointer: e.pointerId, id: item.id, from: this.point(e) } : null;
    if (this.zoom.handle({ kind: 'down', id: e.pointerId, pointer, ...this.point(e), onBox: !!item })) {
      e.preventDefault();
      this.vp.setPointerCapture(e.pointerId);
      this.vp.focus({ preventScroll: true });
    }
  }

  /** A move: the item dragged follows the pointer, drawn there until it is written; else the view moves. */
  private move(e: PointerEvent): void {
    const drag = this.drag;
    if (drag?.pointer === e.pointerId) {
      const p = this.point(e),
        dx = p.x - drag.from.x,
        dy = p.y - drag.from.y,
        s = this.zoom.view().scale;
      if (Math.hypot(dx, dy) > SLOP) drag.moved = true;
      this.svg?.querySelector(`[data-item="${drag.id}"]`)?.setAttribute('transform', `translate(${dx / s} ${dy / s})`);
      e.preventDefault();
      return;
    }
    if (this.zoom.handle({ kind: 'move', id: e.pointerId, ...this.point(e) })) e.preventDefault();
  }

  /** A lift: a drag writes where the item went; a tap on an item chooses it; else the zoom takes it. */
  private lift(e: PointerEvent): void {
    const p = this.point(e),
      drag = this.drag,
      tap = this.tap;
    if (drag?.pointer === e.pointerId) {
      this.drag = null;
      const item = this.board.items.find((i) => i.id === drag.id);
      if (!item) return;
      if (!drag.moved) return this.choose(drag.id);
      const s = this.zoom.view().scale;
      const x = item.x + (p.x - drag.from.x) / s,
        y = item.y + (p.y - drag.from.y) / s;
      this.cursor = { focus: drag.id, linking: null };
      this.say(word('board.moved', { x: Math.round(x), y: Math.round(y) }));
      void this.write({ kind: 'move', id: drag.id, x, y });
      return;
    }
    if (tap?.pointer === e.pointerId) {
      this.tap = null;
      if (e.type === 'pointerup' && Math.hypot(p.x - tap.from.x, p.y - tap.from.y) <= SLOP) this.choose(tap.id);
    }
    if (e.type === 'pointercancel') this.zoom.handle({ kind: 'cancel', id: e.pointerId });
    else if (this.zoom.handle({ kind: 'up', id: e.pointerId, ...p, time: e.timeStamp })) e.preventDefault();
  }

  /** A tap on an item puts the keyboard on it and says it, as Tab to it would. */
  private choose(id: string): void {
    if (!this.board.items.some((i) => i.id === id)) return;
    this.cursor = { focus: id, linking: this.cursor.linking };
    this.say(boardOutline(this.board).find((l) => l.id === id)?.said);
    this.draw();
  }
}

/** A place and size on the board. */
type Box = { x: number; y: number; w: number; h: number };

/** The part of the board drawn: from the origin, or further up and left, to the furthest item. */
function frameOf(board: Board): Box {
  const boxes = board.items.map(itemBox);
  const x = Math.min(0, ...boxes.map((b) => b.x)),
    y = Math.min(0, ...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(1, ...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(1, ...boxes.map((b) => b.y + b.h)) - y,
  };
}
