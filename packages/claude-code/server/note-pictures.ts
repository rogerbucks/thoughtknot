// Whether each picture for readers of a note is up to date (editor spec §62, picture_hidden_when_drawn). The page's
// bar says it. Only the start of each picture is read, for its mark. Nothing of a picture is
// sent: only up to date or out of date, by its graph.
// - A picture is read only inside the vault, under its own name ending .thoughtknot.svg, in no hidden folder.
// - It is never read through a link (cc_no_escape), and only as a plain file.
// - A picture that cannot be read is out of date, as one that is not there.
import { constants, promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  isPictureFile,
  pictureBlocks,
  pictureFingerprint,
  pictureLines,
  pictureState,
  pictureTarget,
  pictureTexts,
} from '@thoughtknot/core';
import type { PictureStates } from '../src/api-types.ts';

/** How much of a picture is read: its mark comes straight after its opening tag. */
export const PICTURE_HEAD_BYTES = 4096;

/** The start of the picture at `path` inside the vault at `root`, or null when it may not be read or is not there. */
async function head(root: string, path: string): Promise<string | null> {
  const parts = path.split('/');
  if (!path || !isPictureFile(path) || parts.some((p) => p === '' || p.startsWith('.') || p === '..')) return null;
  const full = join(root, ...parts);
  // no step of the way may be a link
  for (let i = 1; i <= parts.length; i++) {
    const at = await fs.lstat(join(root, ...parts.slice(0, i))).catch(() => null);
    if (!at || at.isSymbolicLink() || (i === parts.length && !at.isFile())) return null;
  }
  const file = await fs.open(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() => null);
  if (!file) return null;
  try {
    const buffer = new Uint8Array(PICTURE_HEAD_BYTES);
    const { bytesRead } = await file.read(buffer, 0, PICTURE_HEAD_BYTES, 0);
    return new TextDecoder().decode(buffer.subarray(0, bytesRead));
  } finally {
    await file.close();
  }
}

/** The vault path a picture line links, or '' when its link cannot be read, as one escaped badly (`%zz`). */
function targetOf(note: string, href: string): string {
  try {
    return pictureTarget(note, href);
  } catch {
    return '';
  }
}

/** Whether each picture of the note at `note` (its path inside the vault at `root`, with `/`) is up to date. */
export async function pictureStates(root: string, note: string, text: string): Promise<PictureStates> {
  const out: PictureStates = {};
  const lines = new Map(pictureLines(text).map((p) => [p.block, p]));
  for (const { block, graph } of pictureBlocks(text)) {
    const line = lines.get(block);
    if (!line) continue;
    const existing = await head(root, targetOf(note, line.href));
    const fingerprint = pictureFingerprint(note, pictureTexts(text, graph));
    out[graph] = pictureState(existing, fingerprint) === 'current' ? 'current' : 'stale';
  }
  return out;
}
