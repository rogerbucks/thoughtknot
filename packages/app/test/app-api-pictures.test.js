// A board's pictures in the app's own calls (editor spec ES§45, board_images_kept; spec §41). The page's picture calls
// (board-attachments.ts) run against the app's answers, with a folder held in memory:
// - a picture is kept as a new file in the folder `attachments` beside the note, the kind read from its first bytes;
// - it is shown from the bytes read back, only for a name a picture is kept under;
// - a host that cannot read a picture back keeps none, and says so in words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from '../../core/src/note-storage.ts';
import { pageAttachments } from '../../claude-code/page/board-attachments.ts';
import { appFetch } from '../src/app-api.ts';
import { word } from '../../core/src/words.ts';

const NOTE = 'Plans/trip.md';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

/** The app's fetch over a note and a folder of files held in memory, named as `write_new` names a taken file. */
function app({ readable = true } = {}) {
  const files = new Map();
  const taken = (folder, name) => {
    for (let n = 1; ; n++) {
      const named = n === 1 ? name : name.replace(/(\.[^.]+)$/, `-${n}$1`);
      if (!files.has(`${folder}/${named}`)) return named;
    }
  };
  const fetcher = appFetch({
    storage: memoryStorage({ [NOTE]: '# Trip\n' }),
    saveNew: async (folder, list) =>
      list.map((f) => {
        const name = taken(folder, f.name);
        files.set(`${folder}/${name}`, f.bytes);
        return name;
      }),
    ...(readable
      ? {
          readPicture: async (path) => {
            const bytes = files.get(path);
            if (!bytes) throw new Error('ENOENT');
            return bytes;
          },
        }
      : {}),
  });
  const pictures = pageAttachments('app', fetcher, () => 'blob:shown', NOTE, NOTE);
  return { files, fetcher, pictures };
}

test('a picture is kept as a new file in the folder beside the note, and a second of the name takes the next', async () => {
  const { files, pictures } = app();
  const one = await pictures.keep(new File([PNG], 'My photo.png'));
  assert.deepEqual(one, { src: 'Plans/attachments/My-photo.png' });
  const two = await pictures.keep(new File([PNG], 'My photo.png'));
  assert.deepEqual(two, { src: 'Plans/attachments/My-photo-2.png' });
  assert.deepEqual([...files.keys()].sort(), ['Plans/attachments/My-photo-2.png', 'Plans/attachments/My-photo.png']);
});

test('an SVG is refused whatever it is named, and nothing is kept; the kind is read from the first bytes', async () => {
  const { files, pictures } = app();
  assert.match((await pictures.keep(new File([SVG], 'logo.png'))).refused, /Only a PNG, JPEG, GIF or WebP/);
  assert.equal(files.size, 0);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]);
  assert.deepEqual(await pictures.keep(new File([jpeg], 'photo.svg')), { src: 'Plans/attachments/photo.jpg' });
});

test('a picture kept is shown from the bytes read back, and a name never given is not found', async () => {
  const { fetcher, pictures } = app();
  const { src } = await pictures.keep(new File([PNG], 'pic.png'));
  assert.equal(await pictures.url(src), 'blob:shown');
  const id = encodeURIComponent(NOTE);
  const got = await fetcher(`/api/notes/${id}/attachment/pic.png`);
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.deepEqual(new Uint8Array(await got.arrayBuffer()), PNG);
  for (const name of ['missing.png', 'pic.svg', '..', 'a%20b.png'])
    assert.equal((await fetcher(`/api/notes/${id}/attachment/${name}`)).status, 404, name);
});

test('a file in the folder that is no picture is not sent as one', async () => {
  const { files, fetcher } = app();
  files.set('Plans/attachments/fake.png', SVG);
  const id = encodeURIComponent(NOTE);
  assert.equal((await fetcher(`/api/notes/${id}/attachment/fake.png`)).status, 404);
});

test('a request that is not a picture is refused: not JSON, no bytes, base64 that is not plain, none for a note not open', async () => {
  const { fetcher } = app();
  const id = encodeURIComponent(NOTE);
  const put = (body, note = id) => fetcher(`/api/notes/${note}/attachment`, { method: 'PUT', body });
  assert.equal((await put('nope')).status, 400);
  assert.equal((await put(JSON.stringify({ name: 'a.png' }))).status, 400);
  assert.equal((await put(JSON.stringify({ name: 'a.png', base64: '' }))).status, 400);
  assert.equal((await put(JSON.stringify({ name: 'a.png', base64: '%%%' }))).status, 400);
  assert.equal((await put(JSON.stringify({ name: 'a.png', base64: 'AAAA' }), 'Plans%2Fgone.md')).status, 404);
});

test('a host that cannot read a picture back keeps none, and says so', async () => {
  const { pictures } = app({ readable: false });
  assert.equal((await pictures.keep(new File([PNG], 'pic.png'))).refused.includes(word('app.pictures-not-yet')), true);
});
