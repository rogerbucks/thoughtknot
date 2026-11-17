// The pictures of a board on the browser editor's page (editor spec ES§45, board_images_kept).
// The page hands a picture to the server to keep. It shows one by asking for its bytes.
// The token is in a header, never in an address.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pageAttachments } from '../page/board-attachments.ts';

const ID = 'a'.repeat(32);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);

/** A fetch that records each call and answers by `reply`. */
function fake(reply) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return reply(String(url), init);
  };
  return { calls, fetcher };
}
const json = (status, body) => new Response(JSON.stringify(body), { status });
const made = [];
const makeUrl = (blob) => `blob:test/${made.push(blob)}`;

describe('board_images_kept: the page keeps a picture by the server', () => {
  // proves: board_images_kept
  test('a picture dropped is sent with its name and bytes in base64, the token in a header, and its link is taken back', async () => {
    const { calls, fetcher } = fake(() => json(200, { src: 'Notes/attachments/pic.png' }));
    const pictures = pageAttachments('tok', fetcher, makeUrl, ID, 'Notes/plan.md');
    const kept = await pictures.keep(new File([PNG], 'pic.png', { type: 'image/png' }));
    assert.deepEqual(kept, { src: 'Notes/attachments/pic.png' });
    const [call] = calls;
    assert.equal(call.url, `/api/notes/${ID}/attachment`);
    assert.equal(call.init.method, 'PUT');
    assert.equal(call.init.headers.authorization, 'Bearer tok');
    assert.deepEqual(JSON.parse(call.init.body), { name: 'pic.png', base64: Buffer.from(PNG).toString('base64') });
    assert.ok(!call.url.includes('tok'), 'the token is never in the address');
  });

  // proves: board_images_kept
  test('a refusal of the server is said in words, and one too large is refused before anything is sent', async () => {
    const { calls, fetcher } = fake(() => json(415, { why: 'Only a PNG, JPEG, GIF or WebP picture is kept.' }));
    const pictures = pageAttachments('tok', fetcher, makeUrl, ID, 'Notes/plan.md');
    const refused = await pictures.keep(new File([PNG], 'logo.svg'));
    assert.match(refused.refused, /Only a PNG, JPEG, GIF or WebP/);
    const big = new File([new Uint8Array(8_000_001)], 'big.png');
    assert.match((await pictures.keep(big)).refused, /at most 8,000,000 bytes/);
    assert.equal(calls.length, 1);
  });

  // proves: board_images_kept
  test('a picture is shown from the bytes the server sends, asked for once, never from an address of the page’s own making', async () => {
    const { calls, fetcher } = fake(() => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } }));
    const pictures = pageAttachments('tok', fetcher, makeUrl, ID, 'Notes/plan.md');
    const url = await pictures.url('Notes/attachments/pic.png');
    assert.match(url, /^blob:/);
    assert.equal(calls[0].url, `/api/notes/${ID}/attachment/pic.png`);
    assert.equal(calls[0].init.headers.authorization, 'Bearer tok');
    assert.equal(await pictures.url('Notes/attachments/pic.png'), url);
    assert.equal(calls.length, 1);
  });

  // proves: board_images_kept
  test('a link to anything but a picture kept beside this note is not asked for: the web, another folder, another ending', async () => {
    const { calls, fetcher } = fake(() => new Response(PNG));
    const pictures = pageAttachments('tok', fetcher, makeUrl, ID, 'Notes/plan.md');
    for (const src of [
      'https://example.com/a.png',
      'Other/attachments/pic.png',
      'Notes/attachments/pic.svg',
      'Notes/pic.png',
      'Notes/attachments/../pic.png',
      'pic.png',
    ])
      assert.equal(await pictures.url(src), null, src);
    assert.equal(calls.length, 0);
  });

  // proves: board_images_kept
  test('a picture the server does not have shows as none, and so does a call that fails', async () => {
    const missing = pageAttachments(
      'tok',
      fake(() => json(404, { why: 'No such picture.' })).fetcher,
      makeUrl,
      ID,
      null,
    );
    assert.equal(await missing.url('attachments/gone.png'), null);
    const down = pageAttachments('tok', () => Promise.reject(new Error('offline')), makeUrl, ID, null);
    assert.equal(await down.url('attachments/gone2.png'), null);
    assert.match((await down.keep(new File([PNG], 'a.png'))).refused, /offline/);
  });
});
