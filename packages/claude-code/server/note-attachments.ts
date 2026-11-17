// Pictures kept beside an open note, and sent back (editor spec ES§45, board_images_kept; spec §26, cc_pictures_kept).
// The page hands over one picture; the server keeps it in the `attachments` folder beside the note, and sends it back
// to be shown. Nothing is read from the page but the picture's bytes and a name to start its own from.
// - Only a PNG, JPEG, GIF or WebP, by its first bytes, whatever the name says. Never SVG. At most 8 MB.
// - The folder is made where missing, one folder only. Each step from the vault to it must be a real folder.
//   It is never a link. Its real path is checked to be inside the vault before anything is written.
// - A file is opened to be created and no more: exclusively (`O_EXCL`), never through a link (`O_NOFOLLOW`), never
//   truncating. A name taken gives the next number. So nothing is ever overwritten.
// - A picture is read back only by a name this server could have given, as a plain file in that folder. Its bytes
//   must still be a picture. It is sent with its own type, `nosniff` and a policy that runs nothing.
import { word } from '@thoughtknot/core';
import {
  PICTURE_FOLDER,
  PICTURE_MOST_BYTES,
  isKeptName,
  pictureKind,
  pictureName,
  pictureStem,
} from '@thoughtknot/core';
import { constants, promises as fs } from 'node:fs';
import type { ApiAnswer } from './start-server.ts';
import { answer } from './editor-changes.ts';
import { dirname, join, sep } from 'node:path';

/** The most names tried for a picture before it is refused. */
const MOST_NAMES = 1000;

/** A picture's bytes and its type, or why there is none, with the status to answer with. */
export type Fetched = { ok: true; bytes: Uint8Array; type: string } | { ok: false; status: number; why: string };

/** The picture kept, as the page links it from the vault's top, or why not, with the status to answer with. */
export type Kept = { ok: true; src: string } | { ok: false; status: number; why: string };

/** The picture a request carries: its name and bytes, or why the request is not one. */
export function pictureOf(body: string): { name: string; bytes: Uint8Array } | { status: number; why: string } {
  let given: unknown;
  try {
    given = JSON.parse(body);
  } catch {
    return { status: 400, why: word('server.export.not-json') };
  }
  const { name, base64 } = (given && typeof given === 'object' ? given : {}) as { name?: unknown; base64?: unknown };
  if (typeof name !== 'string' || typeof base64 !== 'string')
    return { status: 400, why: word('server.picture.needs-both') };
  const bytes = Buffer.from(base64, 'base64');
  // only canonical base64 decodes and encodes back to itself
  if (bytes.toString('base64') !== base64) return { status: 400, why: word('server.picture.not-base64') };
  if (bytes.length === 0) return { status: 400, why: word('server.picture.empty') };
  if (bytes.length > PICTURE_MOST_BYTES)
    return { status: 413, why: word('server.picture.too-large', { most: PICTURE_MOST_BYTES }) };
  return { name, bytes: new Uint8Array(bytes) };
}

/**
 * The real folder `parts` name inside the vault `root`. Each part must be a real folder, never a link. With `make`, the
 * last is made when it is not there. Null when a part is a link, is no folder, or leads outside the vault.
 */
async function folderOf(root: string, parts: string[], make: boolean): Promise<string | null> {
  let at = root;
  for (const [i, part] of parts.entries()) {
    const next = join(at, part);
    let found = await fs.lstat(next).catch(() => null);
    if (!found && make && i === parts.length - 1) {
      await fs.mkdir(next, { mode: 0o755 }).catch(() => {});
      found = await fs.lstat(next).catch(() => null);
    }
    if (!found || found.isSymbolicLink() || !found.isDirectory()) return null;
    at = next;
  }
  const real = await fs.realpath(at).catch(() => null);
  return real !== null && (real === root || real.startsWith(root + sep)) && real === at ? real : null;
}

/** The folder parts the note at `inVault` (its path inside the vault, with `/`) keeps its pictures in. */
const partsOf = (inVault: string): string[] => [
  ...dirname(inVault)
    .split('/')
    .filter((p) => p !== '' && p !== '.'),
  PICTURE_FOLDER,
];

/**
 * Keeps `bytes` beside the note at `inVault`, in the vault at `root` (its real path), under a name from `given`. It gives
 * the picture's path from the vault's top, `/` between parts.
 */
export async function keepPicture(root: string, inVault: string, given: string, bytes: Uint8Array): Promise<Kept> {
  const kind = pictureKind(bytes);
  if (!kind) return { ok: false, status: 415, why: word('server.picture.not-a-picture') };
  const parts = partsOf(inVault);
  const folder = await folderOf(root, parts, true);
  if (!folder) return { ok: false, status: 403, why: word('server.picture.folder', { folder: PICTURE_FOLDER }) };
  const stem = pictureStem(given);
  for (let n = 1; n <= MOST_NAMES; n++) {
    const name = pictureName(stem, kind.ending, n);
    const file = join(folder, name);
    const handle = await fs
      .open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o644)
      .catch((e: NodeJS.ErrnoException) => e);
    if (handle instanceof Error) {
      if (handle.code === 'EEXIST' || handle.code === 'ELOOP') continue;
      return {
        ok: false,
        status: 500,
        why: word('server.picture.not-kept', { why: handle.code ?? word('server.export.failed') }),
      };
    }
    try {
      await handle.write(bytes);
      await handle.sync();
    } catch (e) {
      await handle.close().catch(() => {});
      await fs.unlink(file).catch(() => {});
      return {
        ok: false,
        status: 500,
        why: word('server.picture.not-kept', {
          why: (e as NodeJS.ErrnoException).code ?? word('server.export.failed'),
        }),
      };
    }
    await handle.close();
    return { ok: true, src: [...parts, name].join('/') };
  }
  return { ok: false, status: 500, why: word('server.picture.names-used') };
}

/** The picture `name` kept beside the note at `inVault`, if it is one this server keeps and is still a picture. */
export async function pictureBeside(root: string, inVault: string, name: string): Promise<Fetched> {
  const none: Fetched = { ok: false, status: 404, why: word('server.picture.none') };
  if (!isKeptName(name)) return none;
  const folder = await folderOf(root, partsOf(inVault), false);
  if (!folder) return none;
  const file = join(folder, name);
  const found = await fs.lstat(file).catch(() => null);
  if (!found || found.isSymbolicLink() || !found.isFile() || found.size > PICTURE_MOST_BYTES) return none;
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() => null);
  if (!handle) return none;
  try {
    const buffer = new Uint8Array(found.size);
    const { bytesRead } = await handle.read(buffer, 0, found.size, 0);
    const bytes = buffer.subarray(0, bytesRead);
    const kind = pictureKind(bytes);
    return kind ? { ok: true, bytes, type: kind.type } : none;
  } finally {
    await handle.close();
  }
}

/** The answer to a picture handed over: where it was kept, as its link, or why it was not. */
export async function keptAnswer(root: string, inVault: string, body: string): Promise<ApiAnswer> {
  const given = pictureOf(body);
  if ('why' in given) return answer(given.status, { why: given.why });
  const kept = await keepPicture(root, inVault, given.name, given.bytes);
  return kept.ok ? answer(200, { src: kept.src }) : answer(kept.status, { why: kept.why });
}

/** The answer to a call for a picture kept beside the note: its bytes with its own type, and nothing it may run. */
export async function sentAnswer(root: string, inVault: string, name: string): Promise<ApiAnswer> {
  const got = await pictureBeside(root, inVault, name);
  if (!got.ok) return answer(got.status, { why: got.why });
  const headers = { 'content-type': got.type, 'content-security-policy': "default-src 'none'; sandbox" };
  return { status: 200, text: '', bytes: got.bytes, headers };
}
