// The cloud card (editor spec §68, cloud_edit). Roger approved this from the UX review, 3 Nov 2026. A named group
// can be fixed in place: renamed, merged into another group of its level, or taken apart ("Not a group"). Its colour
// is the legend's colour button. The card opens from a subject's ✎ in the legend, or by right-clicking a cloud. It is
// a dialog over the drawing, so nothing moves, and Escape closes it. Each change is written to the note and offers
// its undo.
import type { LevelGroup } from '../../detail-levels.ts';
import { groupNamedBy } from '../../group-edit.ts';
import { word } from '../../words.ts';

/** What the card needs of its card: how to write one property on a group's things. */
export interface CloudCardHost {
  /** Sets `property` to `value` on `things`, or takes it off (null); `said` names the change for its undo. */
  edit: (things: readonly string[], property: string, value: string | null, said: string) => void;
}

/** The card that edits one named group. */
export class CloudCard {
  private readonly el: HTMLElement;
  private readonly host: CloudCardHost;

  /** Made, hidden, in `parent`. */
  constructor(parent: HTMLElement, host: CloudCardHost) {
    this.host = host;
    this.el = parent.createDiv({ cls: 'thoughtknot-cloud-card is-hidden', attr: { role: 'dialog' } });
    this.el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      this.close();
    });
  }

  /** Whether `group` has a name to edit: one written as a subject, area or topic. */
  static edits(group: LevelGroup): boolean {
    return !!groupNamedBy(group.key);
  }

  /** Opens for `group`, offering to merge it into one of `peers`, the other groups of its level. */
  open(group: LevelGroup, peers: readonly LevelGroup[]): void {
    const by = groupNamedBy(group.key);
    if (!by) return;
    const { property, value } = by;
    const write = (to: string | null, said: string) => {
      this.close();
      this.host.edit(group.things, property, to, said);
    };
    this.el.empty();
    this.el.setAttribute('aria-label', word('levels.edit-title', { name: group.name }));
    this.el.createDiv({ cls: 'thoughtknot-cloud-card-title', text: word('levels.edit-title', { name: group.name }) });
    const rename = this.el.createEl('form', { cls: 'thoughtknot-cloud-card-row' });
    const name = rename.createEl('input', {
      attr: { type: 'text', value, 'aria-label': word('levels.rename-label', { name: group.name }) },
    });
    name.value = value;
    rename.createEl('button', { text: word('levels.rename'), attr: { type: 'submit' } });
    rename.addEventListener('submit', (e: Event) => {
      e.preventDefault();
      if (name.value.trim() !== value) write(name.value, word('levels.edited', { name: group.name }));
    });
    // a group with no name ("No subject") is not one to merge into: that is "Not a group"
    const others = peers.filter((p) => {
      const named = groupNamedBy(p.key);
      return p.key !== group.key && named?.property === property && !!named.value;
    });
    if (others.length) {
      const merge = this.el.createDiv({ cls: 'thoughtknot-cloud-card-row' });
      const into = merge.createEl('select', {
        attr: { 'aria-label': word('levels.merge-label', { name: group.name }) },
      });
      into.createEl('option', { text: word('levels.merge-into'), attr: { value: '' } });
      for (const p of others) into.createEl('option', { text: p.name, attr: { value: groupNamedBy(p.key)?.value ?? '' } });
      const go = merge.createEl('button', { text: word('levels.merge'), attr: { type: 'button' } });
      go.addEventListener('click', () => {
        if (into.value) write(into.value, word('levels.edited', { name: group.name }));
      });
    }
    const row = this.el.createDiv({ cls: 'thoughtknot-cloud-card-row' });
    const apart = row.createEl('button', { text: word('levels.ungroup'), attr: { type: 'button' } });
    apart.setAttribute('aria-label', word('levels.ungroup-label', { name: group.name, property }));
    apart.addEventListener('click', () => write(null, word('levels.edited', { name: group.name })));
    const close = row.createEl('button', { text: word('levels.close'), attr: { type: 'button' } });
    close.addEventListener('click', () => this.close());
    this.el.classList.remove('is-hidden');
    name.focus();
  }

  /** Closes the card. */
  close(): void {
    this.el.classList.add('is-hidden');
  }

  /** Whether it is open. */
  isOpen(): boolean {
    return !this.el.classList.contains('is-hidden');
  }
}
