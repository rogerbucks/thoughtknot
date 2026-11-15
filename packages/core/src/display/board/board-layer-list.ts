// The Layers list of a board (editor spec §45, board_layers; panels start small). One button beside the tools opens
// a short list of the board's layers, top layer first. The items in no layer are a row at their place among them.
//
// Each layer is shown or hidden, locked or opened, stepped up or down, renamed and taken out from its row. A press on
// a row's name makes it the layer new items go into. The buttons under the list put the chosen items into that
// layer, or bring them to the front or the back of it. Nothing on the board moves by any of this (nodes stay put).
import { word } from '@thoughtknot/core';

import type { Board } from '../../board.ts';
import { layerFor, type BoardChange } from '../../board-edit.ts';
import { IN_LAYER, layerRows, type LayerRow } from '../../board-layers.ts';
import { button } from '../button.ts';

/** What the list needs of its board. */
export interface LayerBoard {
  /** Writes a change and draws what was written. */
  write: (change: BoardChange) => Promise<void>;
  say: (words: string) => void;
  board: () => Board;
  /** The items chosen, or none. */
  chosen: () => string[];
  /** The item the keyboard is on, or none. */
  focus: () => string | null;
}

/** What the buttons under the list do, and what each row's buttons do, by their words. */
type Act = 'board.layers.add' | 'board.layers.move' | 'board.layers.front' | 'board.layers.back';
type Does = 'reveal' | 'conceal' | 'lock' | 'over' | 'up' | 'down' | 'rename' | 'remove';

/** What each board's list was left as, by its host's key, for when it is drawn again. */
const kept = new Map<string, { open: boolean; into: string | null }>();

/** The list: whether it is open, and the layer new items go into. */
export class LayerList {
  /** The layer new items go into, or null for none. */
  private into: string | null;
  private readonly fold: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly key: string;
  private readonly h: LayerBoard;

  /** The list is put above the viewport `vp`. `key` names the board in its host. */
  constructor(el: HTMLElement, vp: HTMLElement, key: string, h: LayerBoard) {
    this.key = key;
    this.h = h;
    const was = kept.get(key);
    this.into = was?.into ?? null;
    const bar = el.createDiv({ cls: 'thoughtknot-board-layers' });
    vp.parentElement?.insertBefore(bar, vp); // above the board
    this.fold = button(bar, '', 'layers', () => this.open(!!this.panel.hidden));
    this.fold.addClass('thoughtknot-board-layers-fold');
    this.panel = bar.createDiv({
      cls: 'thoughtknot-board-layers-list',
      attr: { role: 'group', 'aria-label': word('board.layers') },
    });
    bar.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || this.panel.hidden) return;
      e.preventDefault();
      this.open(false);
      this.fold.focus();
    });
    this.open(was?.open ?? false);
  }

  /** A new item goes into the layer picked; any other change is as it was. */
  placed(change: BoardChange): BoardChange {
    const into = this.live();
    if (!into) return change;
    const put = <T extends { more: Record<string, unknown> }>(item: T): T =>
      IN_LAYER in item.more ? item : { ...item, more: { ...item.more, [IN_LAYER]: into } };
    if (change.kind === 'add') return { ...change, item: put(change.item) };
    if (change.kind === 'adds') return { ...change, items: change.items.map(put) };
    return change;
  }

  /** The list drawn again from the board, after any change. */
  paint(): void {
    const rows = layerRows(this.h.board());
    const into = this.live();
    const name = rows.find((r) => r.id === into)?.name ?? '';
    this.fold.setAttribute('aria-expanded', String(!this.panel.hidden));
    this.fold.setAttribute('aria-label', word(this.panel.hidden ? 'board.layers.show' : 'board.layers.hide', { name }));
    this.fold.setAttribute('title', word('board.layers.tip'));
    if (this.panel.hidden) return;
    const held = (this.panel.ownerDocument.activeElement as HTMLElement | null)?.getAttribute?.('data-layer-do');
    this.panel.replaceChildren();
    const list = this.panel.createEl('ul');
    for (const r of rows) this.row(list, r, r.id === into, rows);
    const foot = this.panel.createDiv({ cls: 'thoughtknot-board-layers-foot' });
    const act = (key: Act, run: () => void) => {
      const b = foot.createEl('button', { text: word(key), attr: { type: 'button', title: word(`${key}.tip`) } });
      b.setAttribute('data-layer-do', key);
      b.addEventListener('click', run);
    };
    act('board.layers.add', () => void this.h.write({ kind: 'layer-add', name: '' }));
    act('board.layers.move', () => this.move(into));
    act('board.layers.front', () => this.stack('front'));
    act('board.layers.back', () => this.stack('back'));
    // the keyboard stays on the button it was on, though the list was drawn again
    if (held) this.panel.querySelector<HTMLElement>(`[data-layer-do="${held}"]`)?.focus();
  }

  /** The layer new items go into, if the board still has it. */
  private live(): string | null {
    if (this.into && !this.h.board().layers?.some((l) => l.id === this.into)) this.into = null;
    return this.into;
  }

  private open(open: boolean): void {
    this.panel.hidden = !open;
    kept.set(this.key, { open, into: this.into });
    this.paint();
  }

  /** One row: the layer's name, then what can be done to it. The row of the loose items has its name alone. */
  private row(list: HTMLElement, r: LayerRow, picked: boolean, rows: LayerRow[]): void {
    const li = list.createEl('li', { cls: 'thoughtknot-board-layer' });
    if (r.hidden) li.addClass('is-hidden');
    const name = li.createEl('button', {
      cls: 'thoughtknot-board-layer-name',
      text: word('board.layers.row', { name: r.name, count: r.count }),
      attr: { type: 'button', 'aria-pressed': String(picked), title: word('board.layers.pick.tip') },
    });
    name.setAttribute('data-layer-do', `pick:${r.id ?? ''}`);
    name.addEventListener('click', () => {
      this.into = r.id;
      kept.set(this.key, { open: true, into: this.into });
      this.h.say(word('board.layers.picked', { name: r.name }));
      this.paint();
    });
    const id = r.id;
    if (id === null) return;
    const at = rows.indexOf(r);
    const set = (change: BoardChange) => void this.h.write(change);
    const tool = (what: Does, icon: string, pressed: boolean | null, run: () => void, off = false) => {
      const b = button(li, word(`board.layers.${what}`, { name: r.name }), icon, run);
      b.setAttribute('title', word(`board.layers.${what}`, { name: r.name }));
      b.setAttribute('data-layer-do', `${what}:${id}`);
      if (pressed !== null) b.setAttribute('aria-pressed', String(pressed));
      b.disabled = off;
    };
    tool(r.hidden ? 'reveal' : 'conceal', r.hidden ? 'eye-off' : 'eye', null, () =>
      set({ kind: 'layer-set', id, hidden: !r.hidden }),
    );
    tool('lock', 'lock', r.locked, () => set({ kind: 'layer-set', id, locked: !r.locked }));
    // a board on a graph can show a layer over that graph's views too (board_layers_over)
    if (this.h.board().on) tool('over', 'network', r.over, () => set({ kind: 'layer-set', id, over: !r.over }));
    tool('up', 'chevron-up', null, () => set({ kind: 'layer-step', id, by: 1 }), at === 0);
    tool('down', 'chevron-down', null, () => set({ kind: 'layer-step', id, by: -1 }), at === rows.length - 1);
    tool('rename', 'pencil', null, () => this.rename(li, name, r));
    tool('remove', 'trash-2', null, () => set({ kind: 'layer-remove', id }));
  }

  /** The row's name becomes a field: Enter keeps the new name, Escape or leaving the field keeps the old one. */
  private rename(li: HTMLElement, name: HTMLElement, r: LayerRow): void {
    const field = li.createEl('input', {
      cls: 'thoughtknot-board-layer-field',
      attr: { type: 'text', 'aria-label': word('board.layers.rename', { name: r.name }) },
    });
    field.value = r.name;
    li.insertBefore(field, name);
    name.hidden = true;
    field.focus();
    field.select();
    let done = false;
    const end = (keep: boolean) => {
      if (done) return;
      done = true;
      const next = field.value.trim();
      if (keep && next && next !== r.name && r.id) void this.h.write({ kind: 'layer-set', id: r.id, name: next });
      else this.paint();
    };
    field.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      end(e.key === 'Enter');
    });
    field.addEventListener('blur', () => end(false));
  }

  /** The items the buttons act on: those chosen, else the one the keyboard is on. */
  private items(): string[] {
    const chosen = this.h.chosen();
    const focus = this.h.focus();
    return chosen.length ? chosen : focus ? [focus] : [];
  }

  /** Puts the chosen items into the layer picked, or makes them loose. */
  private move(into: string | null): void {
    const ids = this.items();
    if (!ids.length) return this.h.say(word('board.layers.none-chosen'));
    void this.h.write({ kind: 'into', ids, layer: into });
  }

  /** Brings the chosen items in front of every other item of their layer, or behind them. */
  private stack(where: 'front' | 'back'): void {
    const ids = this.items();
    if (!ids.length) return this.h.say(word('board.layers.none-chosen'));
    void (async () => {
      for (const id of ids) await this.h.write({ kind: 'layer', id, layer: layerFor(this.h.board(), id, where) });
    })();
  }
}
