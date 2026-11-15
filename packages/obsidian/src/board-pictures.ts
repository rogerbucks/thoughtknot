// The pictures of a whiteboard in Obsidian (editor spec ES§45, board_images). A picture dropped or pasted on a board
// is kept where Obsidian keeps the note's attachments, under a free name, so nothing is ever overwritten. It is shown
// from the vault alone, found as Obsidian finds a link from that note. An address outside the vault is never loaded.
// The file is written by the vault's own writer (export/vault-write.ts), so this keeps no writer of its own.
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import { word, type WriteOps } from '@thoughtknot/core';
import type { Pictures } from '@thoughtknot/core/display/board/board-images';

/** The ending each kind of picture is kept with, for a pasted one that has no name of its own. */
const ENDING: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
};

/** A file name safe to keep in a vault: no folder, and none of the marks a link or a file system cannot hold. */
export function safeName(name: string, type: string): string {
  const last = (name.split(/[\\/]/).pop() ?? '').replace(/[\\/:*?"<>|#^[\]]/g, ' ').trim();
  const ending = ENDING[type.toLowerCase()] ?? 'png';
  if (!last || last.startsWith('.')) return `${word('board.image.pasted-name')}.${ending}`;
  // it keeps an ending of its own: a dot, then letters and digits alone
  const own = last.slice(last.lastIndexOf('.') + 1).toLowerCase();
  const ended =
    last.includes('.') && own !== '' && [...own].every((c) => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'));
  return ended ? last : `${last}.${ending}`;
}

/**
 * The pictures of the boards in the note at `notePath`: kept among its attachments, shown from the vault. `write`
 * writes a file into the vault; without it the board may only be looked at, and no picture is kept.
 */
export function boardPictures(
  { vault, metadataCache, fileManager }: Pick<App, 'vault' | 'metadataCache' | 'fileManager'>,
  notePath: string,
  write?: WriteOps['write'],
): Pictures {
  return {
    url: (src) => {
      const file = metadataCache.getFirstLinkpathDest(src, notePath);
      return Promise.resolve(file instanceof TFile ? vault.getResourcePath(file) : null);
    },
    keep: write
      ? async (file) => {
          try {
            const path = await fileManager.getAvailablePathForAttachment(safeName(file.name, file.type), notePath);
            await write(path, new Uint8Array(await file.arrayBuffer()));
            return { src: path };
          } catch (e) {
            return { refused: word('board.image.keep-failed', { why: e instanceof Error ? e.message : String(e) }) };
          }
        }
      : undefined,
  };
}
