// The list of a board's named layers, under its tools (editor spec §45, board_layers; panels start small). It starts
// folded to one line that says how many layers there are. Opened, it lists them, the one on top first, then the board
// itself. Each layer can be hidden, locked, brought forward, sent back, renamed and removed, and the chosen items can
// be moved to it. Every step is a change to the board block. The host's key keeps whether the list is open and which
// button was pressed. So a host that draws afresh after a write shows the same again, with the keyboard where it was.
import { word } from '@thoughtknot/core';

import type { Board, BoardItem } from '../../board.ts';
import type { BoardChange } from '../../board-edit.ts';
import { layerOf, layersTopFirst, readShown, type LayerAsk } from '../../board-layers.ts';

export { readShown };

/** What the list needs of the board it is under. */
export interface LayersHooks {
  board: () => Board;
  write: (change: BoardChange) => Promise<void>;
  say: (words?: string) => void;
  /** The items chosen on the board; with none, the item the keyboard is on is moved. */
  chosen: () => string[];
}

/** Each button of a layer's row: its words, its label, and the place it holds in the row (Show sits where Hide did). */
const ACTS = {
  hide: ['board.layer.hide', 'board.layer.hide.tip', 'seen'],
  show: ['board.layer.show', 'board.layer.show.tip', 'seen'],
  lock: ['board.layer.lock', 'board.layer.lock.tip', 'lock'],
  unlock: ['board.layer.unlock', 'board.layer.unlock.tip', 'lock'],
  up: ['board.layer.up', 'board.layer.up.tip', 'up'],
  down: ['board.layer.down', 'board.layer.down.tip', 'down'],
  put: ['board.layer.put', 'board.layer.put.tip', 'put'],
  rename: ['board.layer.rename', 'board.layer.rename.tip', 'rename'],
  remove: ['board.layer.remove', 'board.layer.remove.tip', 'remove'],
} as const;
type Act = keyof typeof ACTS;

/** Whether each board's list was left open, and the button last pressed in it, by the host's key. */
const opened = new Map<string, boolean>(),
  pressed = new Map<string, string>();

/** The list of layers drawn in `root`, folded to one line at first. A board only read lists them and no more. */
export function showLayers(root: HTMLElement, hooks: LayersHooks, key: string, readOnly: boolean): void {
  const list = root.createEl('details', { cls: 'thoughtknot-board-layers' });
  if (opened.get(key)) list.setAttribute('open', '');
  list.addEventListener('toggle', () => {
    opened.set(key, list.hasAttribute('open'));
    paint();
  });
  const summary = list.createEl('summary');
  const rows = list.createEl('ul', { attr: { 'aria-label': word('board.layers') } });
  const naming = list.createDiv({ cls: 'thoughtknot-board-layers-naming' });
  naming.hidden = true;
  const input = naming.createEl('input', { attr: { type: 'text', 'aria-label': word('board.layer.name') } });
  let renaming = '';
  const ask = (a: LayerAsk, said?: string) =>
    void hooks.write({ kind: 'layers', ask: a }).then(() => {
      if (said && !refusedBy(hooks.board(), a)) hooks.say(said);
      paint();
    });
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') ask({ kind: 'rename', id: renaming, name: input.value });
    if (e.key === 'Enter' || e.key === 'Escape') {
      naming.hidden = true;
      e.preventDefault();
    }
  });
  /** A button of the row of `id` that does `act`: its words short, its label naming the layer. */
  const button = (row: HTMLElement, act: Act, id: string, name: string, then: () => void) => {
    const [text, tip, slot] = ACTS[act];
    const b = row.createEl('button', {
      text: word(text),
      attr: { type: 'button', 'aria-label': word(tip, { name }), 'data-act': `${slot}:${id}` },
    });
    b.addEventListener('click', () => {
      pressed.set(key, `${slot}:${id}`);
      then();
    });
  };
  const put = (id: string | null, name: string) => {
    const focus = root.querySelector('.is-focused')?.getAttribute('data-item');
    const items = hooks.chosen().length ? hooks.chosen() : focus ? [focus] : [];
    ask({ kind: 'put', items, id }, word('board.layer.put.said', { count: items.length, name }));
  };
  function paint(): void {
    const board = hooks.board();
    const all = [...board.items, ...(board.unseen ?? [])];
    const count = (on: (i: BoardItem) => boolean) => word('board.layer.items', { count: all.filter(on).length });
    summary.textContent = word('board.layers.count', { count: board.layers?.length ?? 0 });
    rows.empty();
    for (const layer of layersTopFirst(board)) {
      const { id, name } = layer;
      const row = rows.createEl('li', { attr: { 'data-layer': id } });
      const state = [
        count((i) => layerOf(board, i) === layer),
        ...(layer.hidden ? [word('board.layer.is-hidden')] : []),
        ...(layer.locked ? [word('board.layer.is-locked')] : []),
      ];
      row.createSpan({ cls: 'thoughtknot-board-layers-name', text: name });
      row.createSpan({ cls: 'thoughtknot-board-layers-state', text: ` ${state.join(', ')} ` });
      if (readOnly) continue;
      button(row, layer.hidden ? 'show' : 'hide', id, name, () => ask({ kind: 'show', id, shown: !!layer.hidden }));
      button(row, layer.locked ? 'unlock' : 'lock', id, name, () => ask({ kind: 'lock', id, locked: !layer.locked }));
      button(row, 'up', id, name, () => ask({ kind: 'raise', id, by: 1 }));
      button(row, 'down', id, name, () => ask({ kind: 'raise', id, by: -1 }));
      button(row, 'put', id, name, () => put(id, name));
      button(row, 'rename', id, name, () => {
        renaming = id;
        naming.hidden = false;
        input.value = name;
        input.focus();
        input.select();
      });
      button(row, 'remove', id, name, () => ask({ kind: 'remove', id }, word('board.layer.removed', { name })));
    }
    const base = rows.createEl('li', { attr: { 'data-layer': '' } });
    base.createSpan({ cls: 'thoughtknot-board-layers-name', text: word('board.layer.base') });
    base.createSpan({ cls: 'thoughtknot-board-layers-state', text: ` ${count((i) => !layerOf(board, i))} ` });
    if (readOnly) return;
    if (board.layers?.length)
      button(base, 'put', '', word('board.layer.base'), () => put(null, word('board.layer.base')));
    if (!list.isConnected) return; // drawn afresh by the host: the new list takes the keyboard
    const was = pressed.get(key);
    pressed.delete(key);
    if (was) rows.querySelector<HTMLElement>(`[data-act="${was}"]`)?.focus();
  }
  paint();
  if (readOnly) return;
  const add = list.createEl('button', { text: word('board.layer.add'), attr: { type: 'button' } });
  add.addEventListener('click', () => {
    const name = word('board.layer.new-name', { n: (hooks.board().layers?.length ?? 0) + 1 });
    ask({ kind: 'add', name }, word('board.layer.added', { name }));
  });
}

/** Whether `ask` was refused, told by the board after it: a layer made is there, one removed is gone. */
function refusedBy(board: Board, ask: LayerAsk): boolean {
  const has = (id: string | null) => !!board.layers?.some((l) => l.id === id);
  if (ask.kind === 'add') return !board.layers?.some((l) => l.name === ask.name);
  if (ask.kind === 'remove') return has(ask.id);
  if (ask.kind === 'put') return !ask.items.length || (ask.id !== null && !has(ask.id));
  return false;
}
