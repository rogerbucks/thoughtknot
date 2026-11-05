// Linking a thing to another where they are drawn (editor spec §72, edit_link_drag). The editor beside a selected thing
// has a handle. Dragged to another thing's box, it links the selected thing to that one. Let go on an empty place of
// the drawing, it makes a new thing linked from the selected one, its name open for typing. Let go outside the drawing,
// or Escape, writes nothing.
// - L, or the Link button, opens a search in the editor instead. It serves a keyboard, a screen reader, or a view with
//   no boxes on the page, such as 3D. Enter links to the first thing found, or makes a new thing of the name typed.
// - The link is of the type the selected thing uses most (thing-edits.ts). It is written as any edit is.
import { details, word } from '@thoughtknot/core';
import { addedNear, linkedTo, type BlockEdit, type ThingAdded } from '../../thing-edits.ts';
import { button } from '../button';
import type { ViewOptions } from './view-options';

/** The most things a search in the editor offers at once. */
const MOST = 6;

/** What linking needs of the editor it sits in. */
export interface LinkHost {
  o: () => ViewOptions;
  viewport: () => HTMLElement;
  /** The thing selected, whose editor is shown, else none. */
  key: () => string | null;
  /** Writes an edit, offering its undo as `said`; resolves to why nothing was written, or null. */
  write: (edit: BlockEdit | ThingAdded, said: string) => Promise<string | null>;
  /** Says what an edit did, or why it wrote nothing, in the editor. */
  say: (text: string) => void;
  /** Hands thing `key` on to be selected in the card drawn next, its name open for typing. */
  hand: (key: string) => void;
}

/** The handle and the search that link the selected thing to another, in one editor. */
export class EditLink {
  private found: HTMLElement | null = null;
  private line: HTMLElement | null = null;
  /** Ends a drag under way, writing nothing. */
  private stop: (() => void) | null = null;
  /** Whether the handle was just dragged, so the click that follows opens no search. */
  private dragged = false;

  constructor(private readonly host: LinkHost) {}

  /** Adds the Link button and the drag handle to the editor's row of buttons. */
  build(row: HTMLElement): void {
    const label = word('edit.link');
    button(row, label, 'link', () => this.find(), label).setAttribute(
      'title',
      word('edit.keys', { label, keys: word('shortcut.link.keys') }),
    );
    const handle = row.createEl('button', {
      cls: 'clickable-icon thoughtknot-edit-handle',
      attr: { type: 'button', 'aria-label': word('edit.link-drag'), title: word('edit.link-drag') },
    });
    handle.addEventListener('pointerdown', (e: PointerEvent) => this.drag(e, handle));
    handle.addEventListener('click', () => (this.dragged ? (this.dragged = false) : this.find())); // a tap: the search
  }

  /** Opens the search for a thing to link to, under the buttons, and puts the focus in it. */
  find(): void {
    const from = this.host.key();
    const card = this.host.viewport().parentElement?.querySelector<HTMLElement>('.thoughtknot-edit-card');
    if (!from || !card) return;
    this.found?.remove();
    const box = card.createDiv({ cls: 'thoughtknot-edit-find' });
    this.found = box;
    const thing = details(this.host.o().reading, this.host.o().graph, from)?.text ?? from;
    const input = box.createEl('input', {
      cls: 'thoughtknot-edit-find-input',
      attr: { type: 'search', 'aria-label': word('edit.link-find', { thing }), title: word('edit.link-hint') },
    });
    const list = box.createDiv({ cls: 'thoughtknot-edit-found', attr: { role: 'group' } });
    const show = () => {
      list.empty();
      const hits = this.matches(input.value, from);
      for (const [key, text] of hits) button(list, text, 'arrow-right', () => void this.link(key), text);
      if (!hits.length && input.value.trim())
        list.createDiv({ cls: 'thoughtknot-edit-said', text: word('edit.link-none', { name: input.value.trim() }) });
    };
    input.addEventListener('input', show);
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation(); // what is typed is the search's alone
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const [first] = this.matches(input.value, from);
        if (first) void this.link(first[0]);
        else if (input.value.trim()) void this.make(input.value.trim(), false);
      }
    });
    show();
    input.focus({ preventScroll: true });
  }

  /** Closes the search, and ends a drag under way. */
  close(): void {
    this.found?.remove();
    this.found = null;
    this.stop?.();
  }

  /** The things of the graph whose text holds `typed`, other than `from`: the first few, by key with their text. */
  private matches(typed: string, from: string): [string, string][] {
    const o = this.host.o(),
      want = typed.trim().toLocaleLowerCase();
    const out: [string, string][] = [];
    for (const key of o.reading.world[o.graph]?.nodes.keys() ?? []) {
      if (key === from) continue;
      const text = details(o.reading, o.graph, key)?.text ?? key;
      if (!want || text.toLocaleLowerCase().includes(want)) out.push([key, text]);
      if (out.length >= MOST) break;
    }
    return out;
  }

  /** Links the selected thing to thing `to`, and says so. */
  private async link(to: string): Promise<void> {
    const from = this.host.key(),
      o = this.host.o();
    if (!from) return;
    const thing = details(o.reading, o.graph, to)?.text ?? to;
    const said = word('edit.linked', { thing });
    const why = await this.host.write(linkedTo(o.reading, o.graph, from, to), said);
    this.host.say(why ?? said);
  }

  /** Makes a new thing named `text`, linked from the selected one, and hands it on with its name open if `rename`. */
  private async make(text: string, rename: boolean): Promise<void> {
    const from = this.host.key(),
      o = this.host.o();
    if (!from) return;
    const r = addedNear(o.reading, o.graph, from, 'child', text);
    if ('name' in r && rename) this.host.hand(r.name);
    const said = word('edit.linked', { thing: text });
    const why = await this.host.write(r, said);
    this.host.say(why ?? said);
  }

  /** Follows a drag from the handle: a line to the pointer, then a link where it is let go. */
  private drag(down: PointerEvent, handle: HTMLElement): void {
    if (down.button !== 0) return;
    const doc = handle.ownerDocument,
      layer = handle.closest<HTMLElement>('.thoughtknot-over');
    if (!layer) return;
    const start = handle.getBoundingClientRect(),
      base = layer.getBoundingClientRect();
    const x0 = start.left + start.width / 2,
      y0 = start.top + start.height / 2;
    let moved = false;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - x0,
        dy = e.clientY - y0;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      this.line ??= layer.createDiv({ cls: 'thoughtknot-edit-line', attr: { 'aria-hidden': 'true' } });
      this.line.setCssProps({
        '--thoughtknot-edit-x': `${x0 - base.left}px`,
        '--thoughtknot-edit-y': `${y0 - base.top}px`,
        '--thoughtknot-edit-length': `${Math.hypot(dx, dy)}px`,
        '--thoughtknot-edit-angle': `${Math.atan2(dy, dx)}rad`,
      });
    };
    const up = (e: PointerEvent) => {
      const was = moved;
      this.dragged = moved;
      end();
      if (was) void this.dropAt(e);
    };
    const end = () => {
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', up);
      this.line?.remove();
      this.line = null;
      this.stop = null;
    };
    this.stop = end;
    doc.addEventListener('pointermove', move);
    doc.addEventListener('pointerup', up);
  }

  /** Links to the thing let go on, else makes a new one where the drawing is empty; outside the drawing, nothing. */
  private async dropAt(e: PointerEvent): Promise<void> {
    const doc = this.host.viewport().ownerDocument;
    const under = (doc.elementFromPoint?.(e.clientX, e.clientY) ?? e.target) as Element | null;
    const box = under?.closest?.('[data-key]');
    const key = box && this.host.viewport().contains(box) ? box.getAttribute('data-key') : null;
    if (key) return this.link(key);
    const r = this.host.viewport().getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (inside && under && this.host.viewport().contains(under)) await this.make(word('edit.new-thing'), true);
  }
}
