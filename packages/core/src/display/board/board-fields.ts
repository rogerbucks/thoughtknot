// The two fields under a board (editor spec §45, board_keyboard, board_quick_capture). One edits the text of an item:
// Enter or Save writes it, Escape or Cancel leaves it. The other catches ideas one after another. Both write through
// the board view, and both give the focus back to the board when they close.
import { word } from '@thoughtknot/core';
import type { Board } from '../../board.ts';
import { capture } from '../../board-capture.ts';
import type { CaptureHow } from '../../board-capture.ts';
import type { BoardChange } from '../../board-edit.ts';
import { boardOutline } from '../../board-svg.ts';

/** What the fields need of the board view they sit under. */
export interface FieldsHost {
  editor: HTMLElement;
  vp: HTMLElement;
  readOnly: boolean;
  board(): Board;
  write(change: BoardChange): Promise<void>;
  say(words?: string): void;
  /** The middle of the view, in board units. */
  centre(): [number, number];
  /** Puts the keyboard on an item and brings it into view. */
  focus(id: string): void;
}

/** Opens `editor`, empty, and gives a function that closes it and returns the focus to the board. */
function opened(host: FieldsHost): () => void {
  const { editor, vp } = host;
  editor.empty();
  editor.hidden = false;
  return () => {
    editor.hidden = true;
    editor.empty();
    vp.focus({ preventScroll: true });
  };
}

/** The text of an item, edited in a field under the board: Enter or Save writes it, Escape or Cancel leaves it. */
export function openEditor(host: FieldsHost, id: string): void {
  const board = host.board();
  const item = board.items.find((i) => i.id === id);
  if (!item || host.readOnly) return;
  const close = opened(host);
  const name = boardOutline(board).find((l) => l.id === id)?.said ?? id;
  const field = host.editor.createEl('textarea', {
    attr: { 'aria-label': word('board.text-of', { item: name }), rows: 2 },
  });
  field.value = item.text ?? '';
  const save = () => {
    const value = field.value;
    close();
    if (value !== (item.text ?? '')) void host.write({ kind: 'text', id, text: value });
  };
  host.editor.createEl('button', { text: word('board.save') }).addEventListener('click', save);
  host.editor.createEl('button', { text: word('board.cancel') }).addEventListener('click', close);
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
export function openCapture(host: FieldsHost, last: string | null, first = ''): void {
  const close = opened(host);
  const field = host.editor.createEl('textarea', { attr: { 'aria-label': word('board.capture.field'), rows: 2 } });
  field.value = first;
  field.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') return (e.preventDefault(), close());
    if ((e.key !== 'Enter' && e.key !== 'Tab') || e.shiftKey) return;
    e.preventDefault();
    const board = host.board();
    const from = board.items.find((i) => i.id === last) ?? null;
    const how: CaptureHow = !from ? 'spot' : e.key === 'Tab' ? 'child' : 'next';
    const r = capture(board, how, field.value, from, host.centre());
    if ('refused' in r) return host.say(r.refused);
    void r.changes
      .reduce((p, c) => p.then(() => host.write(c)), Promise.resolve())
      .then(() => {
        host.say(r.said);
        host.focus(r.item.id);
        openCapture(host, r.item.id);
      });
  });
  field.focus();
}
