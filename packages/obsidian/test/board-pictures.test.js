// The pictures of a whiteboard in Obsidian (editor spec ES§45, board_images). A picture on a board is shown from the
// vault alone. A picture dropped or pasted is kept among the note's attachments under a free, safe name, and placed
// as an Image item. Nothing is fetched, and a link to the web is never loaded.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { show } from './host/view-notes.js';
import { fence } from './host/notes.js';
import { png } from '../../core/test/image-bytes.js';

before(() => build());

const PATH = 'Some note.md';
const BOARD = `// graph: ideas · BOARD
(a:Sticky {x: 10, y: 20, text: 'Go by train'}),
(pic:Image {x: 300, y: 20, w: 200, h: 100, text: 'cat', src: 'cat.png'}),
(web:Image {x: 600, y: 20, w: 200, h: 100, text: 'far', src: 'https://x.org/far.png'})`;
const NOTE = `# Trip\n\n${fence(BOARD)}\n`;

/** A file as a drop or a paste gives it. */
const dropped = (name, type) => ({ name, type, arrayBuffer: async () => png().buffer });
const carried = (files) => ({ files, types: ['Files'], getData: () => '' });

async function board() {
  const env = await load({ files: { [PATH]: NOTE, 'attachments/cat.png': png() } });
  const fetched = [],
    realFetch = globalThis.fetch;
  globalThis.fetch = (url) => (fetched.push(String(url)), Promise.reject(new Error('offline')));
  const uninstall = env.uninstall;
  env.uninstall = () => ((globalThis.fetch = realFetch), uninstall());
  const { el } = await show(env, NOTE);
  const vp = () => el.querySelector('.thoughtknot-board .thoughtknot-viewport');
  return { env, el, vp, fetched, noteNow: () => env.state.files.get(PATH) };
}

describe('pictures on a board in a note', () => {
  // proves: board_images
  test('a picture kept in the vault is shown from the vault; one on the web is left as its name, and nothing is fetched', async () => {
    const { env, el, fetched } = await board();
    try {
      const pic = () => el.querySelector('[data-image="pic"] image');
      await until(() => pic());
      assert.equal(pic().getAttribute('href'), 'app://vault/attachments/cat.png');
      assert.equal(el.querySelector('[data-image="web"] image'), null, 'a link to the web is never loaded');
      assert.deepEqual(fetched, []);
    } finally {
      env.uninstall();
    }
  });

  // proves: board_images
  test('a dropped picture is kept among the attachments under a free, safe name and placed as an Image item', async () => {
    const { env, vp, noteNow } = await board();
    try {
      const drop = (file) =>
        vp().dispatch('drop', { target: vp(), clientX: 50, clientY: 60, dataTransfer: carried([file]) });
      assert.ok(drop(dropped('cat.png', 'image/png')).defaultPrevented ?? true);
      await until(() => /\(image1:Image \{[^}]*src: 'attachments\/cat 1\.png'\}\)/.test(noteNow()));
      assert.ok(env.state.files.has('attachments/cat 1.png'), 'kept beside the first, which is not overwritten');
      assert.ok(noteNow().includes("(a:Sticky {x: 10, y: 20, text: 'Go by train'})"), 'nothing else moved');
      // a pasted picture with no name, and one whose name a vault cannot hold
      drop(dropped('', 'image/jpeg'));
      await until(() => /src: 'attachments\/Pasted picture\.jpg'/.test(noteNow()));
      drop(dropped('../up/my:cat?.gif', 'image/gif'));
      await until(() => /src: 'attachments\/my cat \.gif'/.test(noteNow()));
      assert.ok(![...env.state.files.keys()].some((p) => p.includes('..')), 'never outside the attachments');
    } finally {
      env.uninstall();
    }
  });
});
