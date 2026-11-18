// A picture of a whiteboard kept beside a note, answered inside the app's window (editor spec ES§45, board_images_kept).
// The same two routes the editor server has: PUT keeps a picture, GET sends one back. The rules are the core's. Where the
// host cannot read a kept picture back, no picture is kept, and the answer says so in words.
import type { NoteStorage } from '@thoughtknot/core';
import {
  PICTURE_FOLDER,
  PICTURE_MOST_BYTES,
  isKeptName,
  pictureKind,
  pictureName,
  pictureStem,
  word,
} from '@thoughtknot/core';

/** What keeping a picture needs of the app: the notes, where new files are written, and how one is read back. */
export interface PictureHost {
  storage: NoteStorage;
  saveNew?: (folder: string, files: { name: string; bytes: Uint8Array }[]) => Promise<string[]>;
  readPicture?: (path: string) => Promise<Uint8Array>;
}

const json = (status: number, body: object): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const plain = (status: number, text: string): Response => new Response(text, { status });

/** The folder beside the note at `path` that its pictures are kept in. */
const pictureFolder = (path: string): string =>
  path.includes('/') ? `${path.slice(0, path.lastIndexOf('/'))}/${PICTURE_FOLDER}` : PICTURE_FOLDER;

/** The answer to a picture route on the note at `path`. PUT: a picture kept beside the note, as a new file under a free name; the link is its path. GET: its bytes. */
export const appPicture = async (
  host: PictureHost,
  method: string,
  path: string,
  name: string | undefined,
  body: string,
): Promise<Response> => {
  const { storage, saveNew, readPicture } = host;
  if (!saveNew || !readPicture) return json(501, { why: word('app.pictures-not-yet') });
  if (!(await storage.read(path))) return plain(404, word('server.note-not-open'));
  const folder = pictureFolder(path);
  if (method === 'GET' && name !== undefined) {
    if (!isKeptName(name)) return json(404, { why: word('server.picture.none') });
    const bytes = await readPicture(`${folder}/${name}`).catch(() => null);
    const kind = bytes && bytes.length <= PICTURE_MOST_BYTES ? pictureKind(bytes) : null;
    if (!bytes || !kind) return json(404, { why: word('server.picture.none') });
    return new Response(bytes.slice(), { status: 200, headers: { 'content-type': kind.type } });
  }
  if (method !== 'PUT' || name !== undefined) return plain(405, word('server.not-this-method'));
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return json(400, { why: word('server.export.not-json') });
  }
  const given = (parsed && typeof parsed === 'object' ? parsed : {}) as { name?: unknown; base64?: unknown };
  if (typeof given.name !== 'string' || typeof given.base64 !== 'string')
    return json(400, { why: word('server.picture.needs-both') });
  if (given.base64.length > Math.ceil((PICTURE_MOST_BYTES * 4) / 3) + 4)
    return json(413, { why: word('server.picture.too-large', { most: PICTURE_MOST_BYTES }) });
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(given.base64), (c) => c.charCodeAt(0));
  } catch {
    return json(400, { why: word('server.picture.not-encoded') });
  }
  if (bytes.length === 0) return json(400, { why: word('server.picture.empty') });
  if (bytes.length > PICTURE_MOST_BYTES)
    return json(413, { why: word('server.picture.too-large', { most: PICTURE_MOST_BYTES }) });
  const kind = pictureKind(bytes);
  if (!kind) return json(415, { why: word('server.picture.not-a-picture') });
  const [made] = await saveNew(folder, [{ name: pictureName(pictureStem(given.name), kind.ending, 1), bytes }]);
  return made ? json(200, { src: `${folder}/${made}` }) : json(500, { why: word('server.no-answer') });
};
