// The pictures of a whiteboard in Obsidian (editor spec ES§45, board_images). A picture dropped or pasted on a board
// is kept where Obsidian keeps the note's attachments, under a free name, so nothing is ever overwritten. It is shown
// from the vault alone, found as Obsidian finds a link from that note. An address outside the vault is never loaded.
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import { word } from '@thoughtknot/core';
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
  return /\.[a-z0-9]+$/i.test(last) ? last : `${last}.${ending}`;
}

/** The pictures of the boards in the note at `notePath`: kept among its attachments, shown from the vault. */
export function boardPictures(
  { vault, metadataCache, fileManager }: Pick<App, 'vault' | 'metadataCache' | 'fileManager'>,
  notePath: string,
  writable: boolean,
): Pictures {
  return {
    url: (src) => {
      const file = metadataCache.getFirstLinkpathDest(src, notePath);
      return Promise.resolve(file instanceof TFile ? vault.getResourcePath(file) : null);
    },
    keep: writable
      ? async (file) => {
          try {
            const path = await fileManager.getAvailablePathForAttachment(safeName(file.name, file.type), notePath);
            await vault.createBinary(path, await file.arrayBuffer());
            return { src: path };
          } catch (e) {
            return { refused: word('board.image.keep-failed', { why: e instanceof Error ? e.message : String(e) }) };
          }
        }
      : undefined,
  };
}
