// A whiteboard in Obsidian (editor spec §45, board_view). A board block opens as a board to pan, zoom and edit, on
// desktop and phone, offline: the display layer's board (display/board/board-view.ts). Each edit is written to the
// note, against the note as it is when written. In reading view, or with no section to write to, it is read-only.
import { PALETTES, word } from '@thoughtknot/core';
import { boardEditInNote, boardOf, showBoard } from '@thoughtknot/core/display/board/board-view';
import { readOnlyHere } from '@thoughtknot/core/display/graph-view/placement';
import type { BlockContext } from './block-context';
import type ThoughtKnotPlugin from './main';
import { changeVaultNote } from './storage/plugin-notes';

/** Opens a board block as a board. False for any other block. */
export function renderBoardBlock(
  plugin: ThoughtKnotPlugin,
  el: HTMLElement,
  source: string,
  ctx: BlockContext,
): boolean {
  const line = boardOf(source);
  if (!line) return false;
  const path = ctx.sourcePath;
  const writable = !!ctx.getSectionInfo(el);
  showBoard(el, source, {
    palette: PALETTES.obsidian,
    key: `${path}\n${line.name}`,
    write: writable
      ? async (change) => {
          if (readOnlyHere(el)) return { refused: word('board.read-only') };
          let out: { text: string } | { refused: string } = { refused: word('blocks.note-gone') };
          await changeVaultNote(plugin.app, path, (now) => {
            const r = boardEditInNote(now, line.name, change);
            out = 'refused' in r ? r : { text: r.text };
            return 'refused' in r ? now : r.note;
          });
          return out;
        }
      : undefined,
  });
  return true;
}
