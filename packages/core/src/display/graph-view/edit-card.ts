// The small editor beside a selected thing (editor spec §72, edit_card, edit_rename). Roger, 1 Nov 2026: the views were
// only for looking, and he wants to edit right where a thing is shown. A first click selects a thing, as ever, and this
// card floats beside its box, over the drawing, never shrinking it (edit_click_rule). It holds the thing's name and
// kind. F2, or a tap on the name, lets the name be typed in place: Enter writes it, Escape leaves it as it was.
// - The name is written as the thing's text, into the text being edited or else into the note (thing-edits.ts).
// - Where the card is read-only, or there is nowhere to write, it is never shown (edit_read_only).
// - In space, where no box is on the page, it sits at the drawing's top corner (edit_every_view).
import { details, word } from '@thoughtknot/core';
import { renamed } from '../../thing-edits.ts';
import type { Lifecycle } from '../lifecycle';
import { accept } from './estimate-actions';
import { boxIn, type Target } from './taps';
import type { ViewOptions } from './view-options';

/** How far the card sits from its box, and from the drawing's edges, in pixels. */
const GAP = 8;

/** What the editor needs of its card: the drawing's viewport, the card's options and its SVG, if drawn as one. */
export interface EditParts {
  viewport: HTMLElement;
  o: ViewOptions;
  svg: SVGSVGElement | null;
}

/** The editor beside the selected thing of one card, shown for one thing at a time. */
export class EditCard {
  private el: HTMLElement | null = null;
  private key: string | null = null;
  /** Whether F2 in the drawing is listened for: from the first thing shown, once the drawing is built. */
  private keyed = false;

  /** For the card `card`, and what of it the editor needs, got as the card builds it. */
  constructor(
    private readonly card: Lifecycle,
    private readonly parts: () => EditParts,
  ) {
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

  /** F2 in the drawing opens the name of the thing shown for typing. */
  private listen(): void {
    if (this.keyed) return;
    this.keyed = true;
    this.card.registerDomEvent(this.viewport, 'keydown', (e: KeyboardEvent) => {
      if (e.key !== 'F2' || !this.rename()) return;
      e.preventDefault();
    });
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
    const layer = Array.from(this.viewport.parentElement?.children ?? []).find((c) =>
      c.classList.contains('thoughtknot-over'),
    );
    // only over the drawing, where no key typed reaches the drawing's own keys; a card with no such layer shows none
    if (!(layer instanceof HTMLElement)) return;
    this.el = layer.createDiv({
      cls: 'thoughtknot-edit-card',
      attr: { role: 'group', 'aria-label': word('edit.card', { thing: d.text }) },
    });
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
      } else if (e.key === 'Escape') {
        e.preventDefault();
        name.value = d.text;
        said.setText('');
        this.backToBox();
      }
    });
    this.place();
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
    if (!this.el || !this.key) return;
    const box = boxIn(this.svg(), this.key)?.getBoundingClientRect(),
      vp = this.viewport.getBoundingClientRect();
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
    this.el?.remove();
    this.el = null;
    this.key = null;
  }

  /** Writes `text` as the thing's name; resolves to why nothing was written, or null. */
  private async write(text: string): Promise<string | null> {
    if (!this.key) return null;
    const r = renamed(this.o.reading.texts, this.o.graph, this.key, text);
    return 'reason' in r ? r.reason : accept(this.o, r.block, r.was, r.now);
  }

  /** The focus goes back to the thing's box, as the drawing had it. */
  private backToBox(): void {
    const box = this.key ? boxIn(this.svg(), this.key) : undefined;
    (box ?? this.viewport).focus({ preventScroll: true });
  }
}
