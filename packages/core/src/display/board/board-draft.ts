// A proposed board shown before it is kept (editor spec §45, board_proposed). It is drawn as the board it would be,
// read only, with what each item came from listed under it. Keep writes it to the note; Not this one drops it, and
// nothing was written. The proposal of each note is held here by the host's key, so a host that draws afresh shows it
// again. To edit it, keep it first: it is then a board like any other.
import { word, type Palette } from '@thoughtknot/core';

import type { BoardDraft } from '../../ai-request.ts';
import { boardFromGraph, boardMakeAsk, withBoardKept } from '../../view-types/board-propose.ts';
import type { Viewer } from './board-view-items.ts';
import { showBoard } from './board-view.ts';

export { boardFromGraph, boardMakeAsk, withBoardKept };
export type { BoardDraft };

/** The board proposed for each note, by the host's key. */
const drafts = new Map<string, BoardDraft>();

/** The board proposed for the note `key`, if one is waiting to be kept or dropped. */
export const draftFor = (key: string): BoardDraft | undefined => drafts.get(key);

/** Holds `draft` as the board proposed for the note `key`; null drops it. */
export function proposeBoard(key: string, draft: BoardDraft | null): void {
  if (draft) drafts.set(key, draft);
  else drafts.delete(key);
}

/** What a proposed board needs of its host. */
export interface DraftHost {
  key: string;
  palette: Palette;
  /** Draws the proposed views live from the note. */
  views?: Viewer;
  /** Writes the board to the note, and answers why not when refused. */
  keep: (draft: BoardDraft) => Promise<string | null>;
  /** Called once the proposal is kept or dropped, to draw the note's boards again. */
  done: () => void;
}

/** The proposed board drawn in `el`, with its sources and the two ways on. */
export function showBoardDraft(el: HTMLElement, draft: BoardDraft, host: DraftHost): HTMLElement {
  const box = el.createEl('section', {
    cls: 'thoughtknot-board-draft',
    attr: { 'aria-label': word('board.list.propose') },
  });
  box.createEl('p', { text: word('board.propose.title', { name: draft.name }), attr: { role: 'status' } });
  const acts = box.createDiv({ cls: 'thoughtknot-board-list-acts' });
  const said = box.createEl('p', { cls: 'thoughtknot-board-list-said', attr: { role: 'status' } });
  const keep = acts.createEl('button', { text: word('board.propose.keep'), attr: { type: 'button' } });
  keep.addEventListener('click', () => {
    void host.keep(draft).then((refused) => {
      if (refused) return void (said.textContent = refused);
      proposeBoard(host.key, null);
      host.done();
    });
  });
  const drop = acts.createEl('button', { text: word('board.propose.drop'), attr: { type: 'button' } });
  drop.addEventListener('click', () => {
    proposeBoard(host.key, null);
    host.done();
  });
  showBoard(box.createDiv(), draft.text, {
    palette: host.palette,
    key: `${host.key}\n\n${draft.name}`,
    views: host.views,
  });
  const cited = box.createEl('details', { cls: 'thoughtknot-board-draft-cited' });
  cited.createEl('summary', { text: word('board.propose.cited') });
  const list = cited.createEl('ul');
  for (const c of draft.cites)
    list.createEl('li', { text: word('board.propose.cited-item', { id: c.id, said: c.said }) });
  return box;
}
