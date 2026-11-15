// A board opened in a host (editor spec §45, board_view and board_keyboard). The board is drawn as one picture
// (board-svg.ts) in a viewport. It works with the gestures of a drawing: the core's Zoom pans, zooms and pinches it.
// A mouse or pen drags an item to move it. The keyboard does everything else (board-keys.ts), and each step is said in
// a live region. The outline under it lists the whole board as text.
//
// Every edit goes to the host as a change to the board block, and the board is drawn again from what was written. The
// view stays where it was, and so does every item not changed: nothing jumps (nodes stay put, never disorient). A host
// that draws the block afresh after a write gets the same view and focus back, kept by its `key`.
import { word, Zoom, type Drawn, type Palette, type View } from '@thoughtknot/core';

import { boardOf, readBoard, type Board, type BoardItem } from '../../board.ts';
import { boardEditInNote, type BoardChange } from '../../board-edit.ts';
import { groupNotes, isGroupKey } from './board-group.ts';
import { boardKey, NO_CURSOR, type BoardCursor } from '../../board-keys.ts';
import { boardFrame, boardOutline, boardSvg, itemBox, type Box } from '../../board-svg.ts';
import { BoardPeople } from './board-people.ts';
import { openCapture, openEditor, type FieldsHost } from './board-fields.ts';
import type { Together } from '../../board-together.ts';
import { parsedSvg } from '../graph-view/drawing-svg';
import { ArrangeBar, type ArrangeHooks } from './board-arrange-bar.ts';
import { BoardSpace, HEIGHT, type Point } from './board-space.ts';
import { BoardSelection } from './board-select.ts';
import { bindWheel, outlined } from './board-wheel.ts';
import { ToolRail } from './board-tool-rail.ts';
import { BoardDrag, SLOP } from './board-drag.ts';
import { paintOver, type Viewer } from './board-view-items.ts';
import { copyKey } from './board-copy.ts';
import { born, current, keep, keptOf, placeFrom, saying } from './board-kept.ts';

export { boardEditInNote, boardOf };

/** What a board needs of its host. */
export interface BoardHost {
  /** The colours to draw in. */
  palette: Palette;
  /** Writes an edit to the board block in the note; resolves to the block as now written, or why it was refused. */
  write?: (change: BoardChange) => Promise<{ text: string } | { refused: string }>;
  /** What names this board in its host, such as its note and name, so its view is kept when it is drawn again. */
  key: string;
  /** The seat of this person at a shared board: the others are drawn over it, and the edits go through it. */
  together?: Together;
  /** Where the linked items go by the graph; with it the board offers an Arrange by graph button. */
  arrange?: ArrangeHooks['arrange'];
  /** Draws each View item's graph live from the note; without it a view shows only its frame. */
  views?: Viewer;
}

let boardsShown = 0;

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
  /** The others at a shared board, and the clashes to settle. */
  private readonly people: BoardPeople | null;
  private readonly bar: ArrangeBar | null = null;
  private readonly rail: ToolRail;
  private readonly sel = new BoardSelection((n) => this.bar?.chosen(n));
  /** The text of the shared board as last read, to tell when someone else has changed it. */
  private seen = '';
  private frame: Box;
  private readonly space: BoardSpace;
  private readonly zoom: Zoom;
  private svg: SVGSVGElement | null = null;
  /** An item a mouse or pen is dragging, by its body or its handle. */
  private readonly drag = new BoardDrag();
  /** A press on an item that does not drag it: if it lifts where it came down, it is a tap, which chooses the item. */
  private tap: { pointer: number; id: string; from: Point } | null = null;

  constructor(
    el: HTMLElement,
    source: string,
    private readonly host: BoardHost,
  ) {
    this.board = readBoard(source).board;
    this.seen = source;
    const was = keptOf(host.key);
    this.cursor = was?.cursor ?? NO_CURSOR;
    this.readOnly = !host.write && !host.together;
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
    this.space = new BoardSpace(
      this.vp,
      () => this.zoom,
      () => this.frame,
    );
    const text = word(this.readOnly ? 'board.help-read' : 'board.help');
    root.createEl('p', { cls: 'thoughtknot-board-help', text, attr: { id: helpId } });
    this.rail = new ToolRail(root, this.vp, host.key, (w) => this.say(w), this.readOnly);
    if (host.arrange && !this.readOnly)
      this.bar = new ArrangeBar(root, this.vp, host.arrange, this.arranging(), host.key);
    this.said = root.createDiv({ cls: 'thoughtknot-board-said', attr: { role: 'status', 'aria-live': 'polite' } });
    this.editor = root.createDiv({ cls: 'thoughtknot-board-edit' });
    this.editor.hidden = true;
    this.people = host.together ? new BoardPeople(root, this.peopleHooks(host.together)) : null;
    const outline = root.createEl('details', { cls: 'thoughtknot-board-outline' });
    outline.createEl('summary', { text: word('board.outline') });
    this.list = outline.createEl('ul');
    this.frame = boardFrame(this.board);
    this.zoom = new Zoom({ width: this.frame.w, height: this.frame.h }, this.space.size(), 'note');
    this.zoom.onChange = (v) => this.apply(v);
    host.together?.watch(() => this.othersChanged());
    this.draw();
    if (was) this.zoom.restore(...placeFrom(was, this.frame.x, this.frame.y));
    born(host.key, this.vp, this, this.said);
    if (was?.focused) this.vp.focus({ preventScroll: true });
    this.bind();
    this.rail.held((id) => openEditor(this.fields(), id)); // a sticky just made, its board drawn afresh
  }

  private say(words?: string) {
    if (words) saying(this.host.key, current(this.host.key, this.vp, this).said, words);
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
    keep(this.host.key, this.vp, { place: v, origin: [this.frame.x, this.frame.y], cursor: this.cursor, focused });
  }

  /** The board drawn again, the view kept on the same spot of the board even when its edges moved. */
  private draw(): void {
    const was = this.frame,
      v = this.zoom.view();
    this.frame = boardFrame(this.board);
    this.zoom.resize(this.space.size(), { width: this.frame.w, height: this.frame.h });
    this.zoom.restore(v.scale, v.x + (this.frame.x - was.x) * v.scale, v.y + (this.frame.y - was.y) * v.scale);
    const next = parsedSvg({ svg: boardSvg(this.board, this.host.palette) } as Drawn);
    next.addClass('thoughtknot-svg');
    this.vp.replaceChildren(next); // the viewport holds the picture alone
    this.svg = next;
    for (const g of Array.from(next.querySelectorAll('[data-item]')))
      g.toggleClass('is-focused', g.getAttribute('data-item') === this.cursor.focus);
    outlined(this.list, this.board);
    this.sel.paint(next, this.board.items);
    paintOver(next, this.board, this.cursor.focus, this.readOnly, this.host);
    this.apply(this.zoom.view());
    this.people?.paint(next);
    this.people?.refresh();
    this.people?.tell(undefined, this.cursor.focus, true);
  }

  /** What the fields under the board need of this view. */
  private fields(): FieldsHost {
    return {
      editor: this.editor,
      vp: this.vp,
      readOnly: this.readOnly,
      board: () => this.board,
      write: (c) => this.write(c),
      say: (w) => this.say(w),
      centre: () => this.space.centre(),
      focus: (id) => {
        this.cursor = { ...this.cursor, focus: id };
        this.reveal();
      },
    };
  }

  private copying() {
    return {
      board: () => this.board,
      sel: this.sel,
      focus: () => this.cursor.focus,
      centre: () => this.space.centre(),
      write: this.write.bind(this),
      say: this.say.bind(this),
      choose: this.choose.bind(this),
      readOnly: this.readOnly,
    };
  }

  private arranging() {
    return {
      write: this.write.bind(this),
      say: this.say.bind(this),
      board: () => this.board,
      svg: () => this.svg,
      chosen: () => this.sel.list(),
    };
  }

  /** The hooks the lists under the board work by. */
  private peopleHooks(together: Together) {
    const { palette } = this.host;
    return {
      board: () => this.board,
      together,
      palette,
      parse: (svg: string) => parsedSvg({ svg } as Drawn),
      mayEdit: !this.readOnly,
      show: (spot: [number, number]) =>
        this.zoom.reveal(this.space.unit({ x: spot[0] - 100, y: spot[1] - 100, w: 200, h: 200 })),
      settle: (item: BoardItem) => void this.write({ kind: 'put', item }),
      say: (w: string) => this.say(w),
    };
  }

  /** Someone arrived, moved or changed the board: their marks are drawn again, the board only if its text changed. */
  private othersChanged(): boolean {
    if (!this.vp.isConnected) return false;
    const text = this.host.together?.text() ?? '';
    if (text !== this.seen && !this.drag.active) {
      this.seen = text;
      this.board = readBoard(text).board;
      this.draw();
      return true;
    }
    if (this.svg) this.people?.paint(this.svg);
    this.people?.refresh();
    return true;
  }

  /** Writes an edit (also for the tool rail), then draws what was written; a refusal is said and changes nothing. */
  async write(change: BoardChange): Promise<void> {
    this.bar?.forget();
    this.apply(this.zoom.view()); // kept before the host may draw the board afresh
    const t = this.host.together;
    if (t) {
      const why = await t.change(change).catch((e: unknown) => word('board.write-failed', { why: String(e) }));
      if (why) return this.say(why);
      this.seen = t.text();
      this.board = readBoard(this.seen).board;
      return this.draw();
    }
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
    if (item) this.zoom.reveal(this.space.unit(itemBox(item)));
  }

  private bind(): void {
    const { vp, zoom } = this;
    vp.addEventListener('keydown', (e: KeyboardEvent) => this.key(e));
    vp.addEventListener('pointerdown', (e: PointerEvent) => this.down(e));
    vp.addEventListener('pointermove', (e: PointerEvent) => this.move(e));
    vp.addEventListener('pointerup', (e: PointerEvent) => this.lift(e));
    vp.addEventListener('pointercancel', (e: PointerEvent) => this.lift(e));
    bindWheel(vp, zoom, (e) => this.space.point(e));
    new ResizeObserver(() => zoom.resize(this.space.size())).observe(vp);
  }

  /** A key: the board's own first (board-keys.ts), else the zoom's. */
  private key(e: KeyboardEvent): void {
    if (e.target !== this.vp) return;
    if (e.key === 'Escape' && (this.rail.cancel() || this.sel.clear())) return void this.draw();
    if (copyKey(e, this.copying())) return;
    const press = { key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey };
    if (isGroupKey(e) && !this.readOnly) return void groupNotes(this.board, this.write.bind(this), this.say.bind(this));
    const step = boardKey(this.board, this.cursor, press, this.space.centre(), this.readOnly);
    if (!step) {
      if (this.zoom.handle({ kind: 'key', key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey }))
        e.preventDefault();
      // typing a key the zoom does not use, on an empty spot, starts quick capture (board_quick_capture)
      else if (!this.readOnly && !this.cursor.focus && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        return openCapture(this.fields(), null, e.key);
      }
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
      const now = current(this.host.key, this.vp, this);
      now.reveal();
      if (step.edit) openEditor(now.fields(), step.edit);
    };
    if (step.change) void this.write(step.change).then(after);
    else {
      this.draw();
      after();
    }
  }

  /** A press: a mouse or pen on an item starts to drag it; anything else pans, zooms and pinches, as on a drawing. */
  private down(e: PointerEvent): void {
    const id = (e.target as Element | null)?.closest?.('[data-item]')?.getAttribute('data-item') ?? null;
    const how = e.button ? 'pass' : this.rail.press(this.board, id, this.space.onBoard(this.space.point(e)), this);
    if (how === 'done') return void e.preventDefault();
    const item = how === 'pan' ? undefined : this.board.items.find((i) => i.id === id);
    if (item && BoardSelection.is(e) && e.button === 0) {
      e.preventDefault();
      this.sel.toggle(item.id);
      return void this.draw();
    }
    const pointer = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
    if (item && pointer !== 'touch' && e.button === 0 && !this.readOnly && !item.locked) {
      const onHandle = !!(e.target as Element | null)?.closest?.('[data-handle]');
      this.drag.start(e.pointerId, item.id, this.space.point(e), onHandle);
      this.vp.setPointerCapture(e.pointerId);
      this.vp.focus({ preventScroll: true });
      return;
    }
    this.tap = item ? { pointer: e.pointerId, id: item.id, from: this.space.point(e) } : null;
    if (this.zoom.handle({ kind: 'down', id: e.pointerId, pointer, ...this.space.point(e), onBox: !!item })) {
      e.preventDefault();
      this.vp.setPointerCapture(e.pointerId);
      this.vp.focus({ preventScroll: true });
    }
  }

  /** A move: the item dragged follows the pointer, drawn there until it is written; else the view moves. */
  private move(e: PointerEvent): void {
    const [p, s] = [this.space.point(e), this.zoom.view().scale];
    if (this.drag.move(this.board, this.svg, e.pointerId, p, s, e.altKey)) return void e.preventDefault();
    this.people?.tell(this.space.onBoard(this.space.point(e)), this.cursor.focus);
    if (this.zoom.handle({ kind: 'move', id: e.pointerId, ...this.space.point(e) })) e.preventDefault();
  }

  /** A lift: a drag writes where the item went; a tap on an item chooses it; else the zoom takes it. */
  private lift(e: PointerEvent): void {
    const p = this.space.point(e),
      tap = this.tap;
    const done = this.drag.lift(this.board, this.svg, e.pointerId, p, this.zoom.view().scale, e.altKey);
    if (done && 'tap' in done) return this.choose(done.tap);
    if (done) {
      this.cursor = { focus: 'id' in done.change ? done.change.id : null, linking: null };
      this.say(done.said);
      return void this.write(done.change);
    }
    if (tap?.pointer === e.pointerId) {
      this.tap = null;
      if (e.type === 'pointerup' && Math.hypot(p.x - tap.from.x, p.y - tap.from.y) <= SLOP) this.choose(tap.id);
    }
    if (e.type === 'pointercancel') this.zoom.handle({ kind: 'cancel', id: e.pointerId });
    else if (this.zoom.handle({ kind: 'up', id: e.pointerId, ...p, time: e.timeStamp })) e.preventDefault();
  }

  /** The keyboard put on an item a tool made or joined, its text opened when `edit` (ToolRail). */
  focus(id: string, edit: boolean): void {
    this.choose(id);
    if (edit) openEditor(this.fields(), id);
  }

  /** A tap on an item puts the keyboard on it and says it, as Tab to it would. */
  private choose(id: string): void {
    const now = current(this.host.key, this.vp, this);
    if (now !== this) return now.choose(id);
    if (!this.board.items.some((i) => i.id === id)) return;
    this.cursor = { focus: id, linking: this.cursor.linking };
    this.say(boardOutline(this.board).find((l) => l.id === id)?.said);
    this.draw();
  }
}
