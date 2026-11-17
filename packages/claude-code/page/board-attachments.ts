// The pictures of a whiteboard on the browser editor's page (editor spec ES§45, board_images_kept). A picture dropped
// or pasted on a board is handed to the server to keep beside the note; the server answers its link. Each picture is
// shown by asking the server for its bytes with the page's token, so the token is never in an address. The page names
// no path: the server keeps and finds a picture only in the folder it made beside the note.
import { PICTURE_FOLDER, PICTURE_MOST_BYTES, isKeptName, word } from '@thoughtknot/core';
import type { Pictures } from '@thoughtknot/core/display/board/board-images';
import { base64 } from './export-calls.ts';
import { refusedWhy } from './server-calls.ts';

/** The address each picture was last shown from, by its link, so a board drawn again asks for no picture twice. */
const shown = new Map<string, string>();

/**
 * The pictures of the note `id`, kept and shown by the server with `token`. `notePath` is the note's path in the vault,
 * when the page knows it. Then a picture beside another note is not shown from this one's folder.
 */
export function pageAttachments(
  token: string,
  fetcher: typeof fetch,
  makeUrl: (bytes: Blob) => string,
  id: string,
  notePath: string | null,
): Pictures {
  const headers = { authorization: `Bearer ${token}` };
  const folder =
    notePath === null
      ? null
      : `${notePath.includes('/') ? `${notePath.slice(0, notePath.lastIndexOf('/'))}/` : ''}${PICTURE_FOLDER}`;
  return {
    url: async (src) => {
      const cut = src.lastIndexOf('/');
      const name = src.slice(cut + 1);
      const beside = cut < 0 ? '' : src.slice(0, cut);
      if (!isKeptName(name)) return null;
      // beside this note, or when its path is not known, in a folder of the name the server keeps its pictures in
      if (!(folder === null ? beside === PICTURE_FOLDER || beside.endsWith(`/${PICTURE_FOLDER}`) : beside === folder))
        return null;
      const key = `${id}\n${src}`;
      const known = shown.get(key);
      if (known) return known;
      try {
        const reply = await fetcher(`/api/notes/${encodeURIComponent(id)}/attachment/${name}`, { headers });
        if (!reply.ok) return null;
        const url = makeUrl(await reply.blob());
        shown.set(key, url);
        return url;
      } catch {
        return null;
      }
    },
    keep: async (file) => {
      if (file.size > PICTURE_MOST_BYTES)
        return { refused: word('server.picture.too-large', { most: PICTURE_MOST_BYTES }) };
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const reply = await fetcher(`/api/notes/${encodeURIComponent(id)}/attachment`, {
          method: 'PUT',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ name: file.name, base64: base64(bytes) }),
        });
        if (!reply.ok) return { refused: await refusedWhy(reply) };
        const { src } = (await reply.json()) as { src: string };
        return { src };
      } catch (e) {
        return { refused: word('board.image.keep-failed', { why: e instanceof Error ? e.message : String(e) }) };
      }
    },
  };
}
