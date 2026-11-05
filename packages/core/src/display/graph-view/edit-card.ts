// The small editor beside a selected thing (editor spec §72, edit_card, edit_rename). Roger, 1 Nov 2026: the views were
// only for looking, and he wants to edit right where a thing is shown. A first click selects a thing, as ever, and this
// card floats beside its box, over the drawing, never shrinking it (edit_click_rule). It holds the thing's name and
// kind. F2, or a tap on the name, lets the name be typed in place: Enter writes it, Escape leaves it as it was.
// - The name is written as the thing's text, into the text being edited or else into the note (thing-edits.ts).
// - Where the card is read-only, or there is nowhere to write, it is never shown (edit_read_only).
// - In 2.5D, 3D and on the globe, it sits beside the picked thing and follows it as the view turns. On a phone, it
//   sits at the top of the sheet's Details tab, in reach of a thumb (edit_every_view).
// - Insert adds a child and Shift+Enter a sibling, each ready to name; Delete takes the thing out (edit_quick_add,
//   edit_delete). The card's buttons do the same, for a pointer or a screen reader.
// - A handle, L, or the Link button links the thing to another, or to a new one (edit-link.ts, edit_link_drag).
// - A quick line writes the things and links a short sentence names, such as -> Plan, Risk (edit_quick_line).
// - While AI is on, Expand with AI asks a model to expand the thing, with the words in the quick line. Its answer is a
//   proposal, accepted one change at a time. The send dialog shows what goes first (edit_ai_expand).
// - On a kanban board, each column has a button that adds a card there, its name open (grid-drag.ts, edit_cells).
// Each write draws the card again, so what to select there, and whether to open its name, is handed on by graph.
import { details, word } from '@thoughtknot/core';
import { addedInColumn, addedNear, deleted, propertySet, quickLine, renamed } from '../../thing-edits.ts';
import { button } from '../button';
import type { Lifecycle } from '../lifecycle';
import { EditLink } from './edit-link';
import { EditWrites } from './edit-writes';
import { SPACE_PICKED_AT, type PickedAt } from './space-picked-at';
import { gridAdds } from './grid-drag';
import type { CellWrite } from './table-edit';
import { boxIn, type Target } from './taps';
import type { ViewOptions } from './view-options';

/** How far the card sits from its box, and from the drawing's edges, in pixels. */
const GAP = 8;
/** How far from a thing's middle in space the card keeps, in pixels: about the size its name and ball are drawn. */
const SPACE_REACH = 24;

/** What the editor needs of its card: the drawing's viewport, the card's options and its SVG, if drawn as one. */
export interface EditParts {
  viewport: HTMLElement;
  o: ViewOptions;
  svg: SVGSVGElement | null;
}

/** What a write hands on to the card drawn next, by graph: the thing to select, and whether to open its name. */
const handed = new Map<string, { key: string; rename: boolean; at: number }>();
/** How long a hand-on waits for the card drawn next, in milliseconds. */
const HAND_ON_MS = 5000;

/** The editor beside the selected thing of one card, shown for one thing at a time. */
export class EditCard {
  private el: HTMLElement | null = null;
  private key: string | null = null;
  /** Where the card says what a write did, or why it wrote nothing. */
  private said: HTMLElement | null = null;
  /** Whether F2 in the drawing is listened for: from the first thing shown, once the drawing is built. */
  private keyed = false;
  /** Where the 3D view shows the thing picked there, in the drawing's pixels; none while it is flat. */
  private pickedAt: PickedAt | null = null;
  /** How each edit is written, offering its undo, and how Delete asks first (edit_undo, edit_delete_asks). */
  private readonly writes: EditWrites;
  /** The handle and search that link the thing shown to another. */
  private readonly linking = new EditLink({
    o: () => this.o,
    viewport: () => this.viewport,
    key: () => this.key,
    write: (r, said) => ('reason' in r ? Promise.resolve(r.reason) : this.written(said, r.block, r.was, r.now)),
    say: (text) => this.said?.setText(text),
    hand: (key) => handed.set(this.o.graph, { key, rename: true, at: Date.now() }),
  });

  /** For the card `card`, and what of it the editor needs, got as the card builds it. */
  constructor(
    private readonly card: Lifecycle,
    private readonly parts: () => EditParts,
  ) {
    this.writes = new EditWrites({ card, viewport: () => this.viewport, o: () => this.o });
    card.register(() => this.hide());
  }

  private get viewport(): HTMLElement {
    return this.parts().viewport;
  }

  private get o(): ViewOptions {
    return this.parts().o;
  }

  private svg(): SVGSVGElement | null {
    return this.parts().svg;
  }

  /**
   * The keys of the drawing while a thing is shown: F2 renames, Insert adds a child, Shift+Enter a sibling, Delete
   * deletes, and L links. They are taken before the drawing's own keys, so Shift+Enter never opens the box again.
   */
  private listen(): void {
    if (this.keyed) return;
    this.keyed = true;
    // in space, the editor follows the picked thing as the view turns
    this.card.registerDomEvent(this.viewport, SPACE_PICKED_AT, (e: CustomEvent<PickedAt | null>) => {
      this.pickedAt = e.detail;
      this.place();
    });
    this.card.registerDomEvent(
      this.viewport,
      'keydown',
      (e: KeyboardEvent) => {
        // Ctrl+Z undoes the last edit, and Ctrl+Shift+Z does it again; a field being typed in keeps its own (edit_undo)
        const typing = !!(e.target as Element | null)?.closest?.('input, textarea, [contenteditable="true"]');
        if ((e.ctrlKey || e.metaKey) && !typing && this.writable() && this.writes.undoes().key(e)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (!this.el || e.ctrlKey || e.metaKey) return;
        // Insert adds a child, or Option+Enter on a Mac with no Insert key. Never Tab: it moves the focus on, so the keys
        // never trap it. Backspace deletes too, as a Mac's delete key sends it.
        // in a table's cell, F2 and the delete keys are the cell's own (table-edit.ts)
        const alt = e.altKey,
          enter = e.key === 'Enter',
          cell = !!(e.target as Element | null)?.closest?.('.thoughtknot-grid tbody td');
        const act =
          e.key === 'F2' && !alt && !cell
            ? () => this.rename()
            : (e.key === 'Insert' && !alt) || (enter && alt && !e.shiftKey)
              ? () => this.add('child')
              : enter && e.shiftKey && !alt
                ? () => this.add('sibling')
                : (e.key === 'Delete' || e.key === 'Backspace') && !alt && !cell
                  ? () => this.remove()
                  : (e.key === 'l' || e.key === 'L') && !e.shiftKey
                    ? () => this.linking.find()
                    : null;
        if (!act) return;
        e.preventDefault();
        e.stopPropagation();
        void act();
      },
      { capture: true },
    );
  }

  /** The thing the card drawn last handed on to this one, once and soon after: to select, its name maybe opened. */
  handedOn(): { key: string } | null {
    const h = handed.get(this.o.graph);
    if (!h || Date.now() - h.at > HAND_ON_MS || !this.o.reading.world[this.o.graph]?.nodes.has(h.key)) return null;
    return { key: h.key };
  }

  /** How a table's cell is written: its Thing column as the name, else as the property; none where nothing is written. */
  cells(): CellWrite | undefined {
    if (!this.writable()) return undefined;
    return (key, column, prop, words) => {
      const r =
        column === 0
          ? renamed(this.o.reading.texts, this.o.graph, key, words)
          : propertySet(this.o.reading, this.o.graph, key, prop, words);
      const said = column === 0 ? word('edit.renamed', { name: words }) : word('edit.set', { prop, value: words });
      return 'reason' in r ? Promise.resolve(r.reason) : this.written(said, r.block, r.was, r.now);
    };
  }

  /**
   * Once the card is placed where it can be written, its keys are listened for. So Ctrl+Z undoes from the start, and
   * the toast of an edit just made shows. A kanban board drawn on it gets a button per column, to add a card there.
   */
  columns(): void {
    if (!this.writable()) return;
    this.listen();
    this.writes.undoes();
    const layer = this.layer();
    if (!layer) return;
    gridAdds(this.o, layer, this.viewport, async (column) => {
      const r = addedInColumn(this.o.reading, this.o.graph, column, word('edit.new-thing'));
      if ('reason' in r) return r.reason;
      handed.set(this.o.graph, { key: r.name, rename: true, at: Date.now() });
      const why = await this.written(word('edit.added', { thing: r.name }), r.block, r.was, r.now);
      if (why) handed.delete(this.o.graph);
      return why;
    });
  }

  /** The layer over the drawing, the editor's and the board's buttons' place; none on a card without one. */
  private layer(): HTMLElement | null {
    const layer = Array.from(this.viewport.parentElement?.children ?? []).find((c) =>
      c.classList.contains('thoughtknot-over'),
    );
    return (layer as HTMLElement | undefined) ?? null;
  }

  /** Whether a thing can be edited here: never where the card is read-only, nor with nowhere to write. */
  private writable(): boolean {
    return !this.o.readOnly?.() && (!!this.o.writeBlock || !!this.o.editing?.()?.session);
  }

  /** Shows the editor beside `t`, if a thing; a link or a guess has none, as yet. */
  show(t: Target): void {
    this.hide();
    const d = 'key' in t && this.writable() ? details(this.o.reading, this.o.graph, t.key) : null;
    if (!d || !('key' in t)) return;
    this.listen();
    this.key = t.key;
    const layer = this.layer();
    // only over the drawing, where no key typed reaches the drawing's own keys; a card with no such layer shows none
    if (!layer) return;
    // on a phone, at the top of the sheet's Details tab, above the details, in reach of a thumb
    const sheet = layer.querySelector<HTMLElement>('.thoughtknot-phone-sheet .thoughtknot-details');
    this.el = (sheet?.parentElement ?? layer).createDiv({
      cls: sheet ? 'thoughtknot-edit-card is-in-sheet' : 'thoughtknot-edit-card',
      attr: { role: 'group', 'aria-label': word('edit.card', { thing: d.text }) },
    });
    if (sheet) sheet.parentElement?.insertBefore(this.el, sheet);
    const name = this.el.createEl('input', {
      cls: 'thoughtknot-edit-name',
      attr: { type: 'text', 'aria-label': word('edit.name', { thing: d.text }), title: word('edit.name-hint') },
    });
    name.value = d.text;
    const kind = d.kind.split(' · ')[0] ?? '';
    this.el.createDiv({
      cls: 'thoughtknot-edit-kind',
      text: kind ? word('edit.kind', { kind }) : word('edit.no-kind'),
    });
    const said = this.el.createDiv({ cls: 'thoughtknot-edit-said', attr: { role: 'status' } });
    name.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation(); // what is typed is the name's alone
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.write(name.value).then((why) => said.setText(why ?? word('edit.renamed', { name: name.value })));
        if (this.key) handed.set(this.o.graph, { key: this.key, rename: false, at: Date.now() });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        name.value = d.text;
        said.setText('');
        this.backToBox();
      }
    });
    const row = this.el.createDiv({ cls: 'thoughtknot-edit-actions' });
    for (const [label, icon, run, keys] of [
      [word('edit.add-child'), 'plus', () => void this.add('child'), 'add-child'],
      [word('edit.add-sibling'), 'list-plus', () => void this.add('sibling'), 'add-sibling'],
      [word('edit.delete'), 'trash-2', () => this.remove(), 'delete'],
    ] as const)
      button(row, label, icon, run, label).setAttribute(
        'title',
        word('edit.keys', { label, keys: word(`shortcut.${keys}.keys`) }),
      );
    this.linking.build(row);
    const card = this.el;
    this.lineIn(card, d.text);
    const expand = this.o.expand,
      key = t.key;
    if (expand?.ready()) {
      const typed = () => card.querySelector<HTMLInputElement>('.thoughtknot-edit-line-input')?.value ?? '';
      button(row, word('edit.expand'), 'expand', () => expand.open(key, d.text, typed()), word('edit.expand'));
    }
    this.said = said;
    this.place();
    const h = handed.get(this.o.graph);
    if (h?.key === t.key) {
      handed.delete(this.o.graph);
      if (h.rename) this.rename();
    }
  }

  /** The quick line under the buttons: Enter writes the things and links it names; an arrow first starts from here. */
  private lineIn(card: HTMLElement, thing: string): void {
    const line = card.createEl('input', {
      cls: 'thoughtknot-edit-line-input',
      attr: { type: 'text', 'aria-label': word('edit.line', { thing }), title: word('edit.line-hint') },
    });
    line.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation(); // what is typed is the line's alone
      if (e.key === 'Escape') return void (e.preventDefault(), (line.value = ''), this.backToBox());
      if (e.key !== 'Enter' || !this.key) return;
      e.preventDefault();
      const r = quickLine(this.o.reading, this.o.graph, line.value, this.key);
      if ('reason' in r) return void this.said?.setText(r.reason);
      handed.set(this.o.graph, { key: this.key, rename: false, at: Date.now() });
      const said = word('edit.lined', { count: r.things.length });
      void this.written(said, r.block, r.was, r.now).then((why) => this.said?.setText(why ?? said));
    });
  }

  /** Adds a child or a sibling of the thing shown, ready to name, and hands it on to be selected in the card drawn next. */
  private async add(as: 'child' | 'sibling'): Promise<void> {
    if (!this.key) return;
    const r = addedNear(this.o.reading, this.o.graph, this.key, as, word('edit.new-thing'));
    if ('name' in r) handed.set(this.o.graph, { key: r.name, rename: true, at: Date.now() });
    const why =
      'reason' in r ? r.reason : await this.written(word('edit.added', { thing: r.name }), r.block, r.was, r.now);
    if (why) handed.delete(this.o.graph);
    this.said?.setText(why ?? '');
  }

  /** Asks first, in the card, then deletes the thing shown and its links, as one edit (edit_delete_asks). */
  private remove(): void {
    if (!this.key || !this.el) return;
    const key = this.key,
      thing = details(this.o.reading, this.o.graph, key)?.text ?? key;
    const links = (this.o.reading.world[this.o.graph]?.edges ?? []).filter(([a, , b]) => a === key || b === key).length;
    const yes = async (): Promise<void> => {
      const r = deleted(this.o.reading.texts, this.o.graph, key);
      const said = word('edit.deleted', { thing });
      const why = 'reason' in r ? r.reason : await this.written(said, r.block, r.was, r.now);
      this.said?.setText(why ?? said);
    };
    this.writes.ask(
      this.el,
      thing,
      links,
      () => void yes(),
      () => this.backToBox(),
    );
  }

  /** Writes an edit, offering its undo as `said`; resolves to why nothing was written (edit_undo). */
  private written(said: string, block: number, was: string, now: string): Promise<string | null> {
    return this.writes.written(said, block, was, now);
  }

  /** Opens the name of the thing shown for typing, all of it selected. Whether there was one to open. */
  rename(): boolean {
    const name = this.el?.querySelector<HTMLInputElement>('.thoughtknot-edit-name');
    if (!name) return false;
    name.focus({ preventScroll: true });
    name.select();
    return true;
  }

  /** Puts the card beside its thing's box as the drawing is now: after it, else before it, else at the top corner. */
  place(): void {
    if (!this.el || !this.key || this.el.classList.contains('is-in-sheet')) return;
    const vp = this.viewport.getBoundingClientRect(),
      inSpace = !!this.viewport.querySelector('.thoughtknot-space-view'),
      at = inSpace && this.pickedAt?.key === this.key ? this.pickedAt : null;
    // in space, a small square round the thing's middle as the view shows it; flat, its box
    const box = at
      ? {
          left: vp.left + at.x - SPACE_REACH,
          right: vp.left + at.x + SPACE_REACH,
          top: vp.top + at.y - SPACE_REACH,
          width: 2 * SPACE_REACH,
        }
      : boxIn(this.svg(), this.key)?.getBoundingClientRect();
    const width = this.el.getBoundingClientRect().width;
    let x = GAP,
      y = GAP;
    if (box && box.width > 0) {
      x = box.right - vp.left + GAP;
      if (x + width > vp.width - GAP) x = Math.max(GAP, box.left - vp.left - GAP - width);
      y = Math.max(GAP, Math.min(box.top - vp.top, vp.height - GAP - this.el.getBoundingClientRect().height));
    }
    this.el.setCssProps({ '--thoughtknot-edit-x': `${x}px`, '--thoughtknot-edit-y': `${y}px` });
  }

  /** Takes the card away. */
  hide(): void {
    this.writes.forget();
    this.linking.close();
    this.el?.remove();
    this.el = this.said = null;
    this.key = null;
  }

  /** Writes `text` as the thing's name; resolves to why nothing was written, or null. */
  private async write(text: string): Promise<string | null> {
    if (!this.key) return null;
    const r = renamed(this.o.reading.texts, this.o.graph, this.key, text);
    return 'reason' in r ? r.reason : this.written(word('edit.renamed', { name: text }), r.block, r.was, r.now);
  }

  /** The focus goes back to the thing's box, as the drawing had it. */
  private backToBox(): void {
    const box = this.key ? boxIn(this.svg(), this.key) : undefined;
    (box ?? this.viewport).focus({ preventScroll: true });
  }
}
