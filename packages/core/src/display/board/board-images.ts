// Pictures and notes brought onto a board (editor spec ES§45, board_images). A picture can be dropped on the board,
// or pasted while the board has the keyboard. The host keeps it beside the note, and it is placed as an Image item.
// A note dropped or pasted becomes a card that links to it. Each Image item's picture is then painted into its
// frame, from where the host keeps it. A link to the web is never loaded. Kept apart so board-view.ts stays small.
import { word } from '@thoughtknot/core';

import type { Board } from '../../board.ts';
import { freeId, type BoardChange } from '../../board-edit.ts';
import { imageItem, imageSrc, isLocalSrc, isPicture, nameOf, noteCard, noteLinkOf } from '../../board-image.ts';
import { itemBox } from '../../board-svg.ts';

const SVG = 'http://www.w3.org/2000/svg';

/** How a host keeps and shows the pictures of a board. */
export interface Pictures {
  /** The address the picture kept at `src` is shown from, or null when it is not there. */
  url: (src: string) => Promise<string | null>;
  /** Keeps a picture beside the note and gives its link. A host with nowhere to keep one has none. */
  keep?: (file: File) => Promise<{ src: string } | { refused: string }>;
}

/** What bringing things onto a board needs of it (the copy keys' hooks give it all). */
export interface DropHooks {
  board: () => Board;
  centre: () => [number, number];
  write: (change: BoardChange) => Promise<void>;
  say: (words: string) => void;
  choose: (id: string) => void;
  readOnly: boolean;
}

/** The address each picture was last shown from, by its link, so a board drawn again never flickers empty. */
const shown = new Map<string, string>();

/** The picture at `url` put in the frame of an Image item, in place of any there. */
function put(g: Element, board: Board, id: string, url: string): void {
  const item = board.items.find((i) => i.id === id);
  if (!item) return;
  const box = itemBox(item);
  let pic = g.querySelector('.thoughtknot-board-image-picture');
  if (!pic) {
    pic = g.ownerDocument.createElementNS(SVG, 'image');
    pic.setAttribute('class', 'thoughtknot-board-image-picture');
    pic.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    pic.setAttribute('aria-hidden', 'true'); // the item's title says it
    g.insertBefore(pic, g.querySelector('[data-handle]')); // under the sizing handle, when the item has it
  }
  for (const [k, v] of Object.entries({ x: box.x, y: box.y, width: box.w, height: box.h, href: url }))
    pic.setAttribute(k, String(v));
}

/** Paints each Image item's picture in `svg`, from where `pictures` keeps it. One not kept beside the notes is left. */
export function paintImages(svg: SVGSVGElement, board: Board, pictures: Pictures | undefined): void {
  if (!pictures) return;
  for (const g of Array.from(svg.querySelectorAll('[data-image]'))) {
    const id = g.getAttribute('data-image') ?? '';
    const item = board.items.find((i) => i.id === id);
    const src = item && imageSrc(item);
    if (!src || !isLocalSrc(src)) continue;
    const kept = shown.get(src);
    if (kept) put(g, board, id, kept);
    void pictures.url(src).then((url) => {
      if (!url) return;
      shown.set(src, url);
      if (url !== kept && g.isConnected) put(g, board, id, url);
    });
  }
}

/** A picture's own size, read from the file, or null where it cannot be read. */
async function sizeOf(file: File): Promise<{ w: number; h: number } | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null; // a drawing with no size of its own, or a file that is not a picture after all
  }
}

/** What a drop or a paste carries that a board takes: its pictures, else the note its text names. */
export function broughtIn(data: DataTransfer | null): { files: File[]; note: string | null } {
  const files = Array.from(data?.files ?? []).filter((f) => isPicture(f.type));
  return { files, note: files.length ? null : noteLinkOf(data?.getData('text/plain') ?? '') };
}

/**
 * Puts what was brought onto the board at the spot `at`: each picture kept by the host, then placed; or the note as
 * a card. Whether anything was taken. Each item is its own change, so each can be undone.
 */
export async function bringIn(
  data: DataTransfer | null,
  at: [number, number],
  h: DropHooks,
  pictures: Pictures | undefined,
): Promise<boolean> {
  const { files, note } = broughtIn(data);
  if (h.readOnly || (!files.length && !note)) return false;
  if (note) {
    const card = noteCard(freeId(h.board(), 'Card'), note, at);
    h.say(word('board.note.added', { name: nameOf(note) }));
    await h.write({ kind: 'add', item: card });
    h.choose(card.id);
    return true;
  }
  if (!pictures?.keep) {
    h.say(word('board.image.no-store'));
    return true;
  }
  let n = 0;
  for (const file of files) {
    const [kept, size] = await Promise.all([pictures.keep(file), sizeOf(file)]);
    if ('refused' in kept) {
      h.say(kept.refused);
      continue;
    }
    // each next picture a little down and right of the last, so none hides another
    const item = imageItem(freeId(h.board(), 'Image'), kept.src, [at[0] + n * 24, at[1] + n * 24], size);
    n += 1;
    h.say(word('board.image.added', { name: nameOf(kept.src) }));
    await h.write({ kind: 'add', item });
    h.choose(item.id);
  }
  return true;
}

/** Takes pictures and notes dropped on the board `vp`, and pasted while it has the keyboard. */
export function bindDrop(
  vp: HTMLElement,
  h: DropHooks,
  pictures: Pictures | undefined,
  at: (e: DragEvent) => [number, number],
): void {
  if (h.readOnly) return;
  const takes = (data: DataTransfer | null) =>
    !!data && (Array.from(data.types ?? []).includes('Files') || Array.from(data.types ?? []).includes('text/plain'));
  vp.addEventListener('dragover', (e: DragEvent) => {
    if (takes(e.dataTransfer)) e.preventDefault(); // so the drop comes to the board
  });
  vp.addEventListener('drop', (e: DragEvent) => {
    const got = broughtIn(e.dataTransfer);
    if (!got.files.length && !got.note) return;
    e.preventDefault();
    void bringIn(e.dataTransfer, at(e), h, pictures);
  });
  vp.addEventListener('paste', (e: ClipboardEvent) => {
    if (e.target !== vp) return;
    const got = broughtIn(e.clipboardData);
    if (!got.files.length && !got.note) return;
    e.preventDefault();
    void bringIn(e.clipboardData, h.centre(), h, pictures);
  });
}
