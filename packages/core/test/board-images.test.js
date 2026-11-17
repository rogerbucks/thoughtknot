// Pictures and notes brought onto a board, in a host (editor spec ES§45, board_images). A dropped or pasted picture
// is kept by the host, then placed as an Image item. A note becomes a card. Each Image item's picture is painted into
// its frame from where the host keeps it, and a link to the web is never asked for.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readBoard } from '../src/board.ts';
import { boardSvg } from '../src/board-svg.ts';
import { bindDrop, bringIn, broughtIn, paintImages } from '../src/display/board/board-images.ts';

const PALETTE = { text: '#111', edge: '#222', muted: '#333', fill: (h) => `fill-${h}`, blend: (h) => `ink-${h}` };
const BOARD = readBoard(`// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'Go by train'}),
(pic:Image {x: 300, y: 0, w: 200, h: 100, text: 'cat', src: 'Attachments/cat.png'}),
(web:Image {x: 600, y: 0, w: 200, h: 100, text: 'far', src: 'https://x.org/far.png'})`).board;

/** What a drop or paste carries, as the browser gives it. */
const carried = (files = [], text = '') => ({
  files,
  types: [...(files.length ? ['Files'] : []), ...(text ? ['text/plain'] : [])],
  getData: (type) => (type === 'text/plain' ? text : ''),
});
const file = (name, type) => ({ name, type });

/** The hooks of a board that keeps what is written and said. */
function hooks(readOnly = false) {
  const done = { writes: [], said: [], chosen: [] };
  let board = BOARD;
  const h = {
    board: () => board,
    centre: () => [1000, 1000],
    write: async (c) => {
      done.writes.push(c);
      if (c.kind === 'add') board = { ...board, items: [...board.items, c.item] };
    },
    say: (w) => done.said.push(w),
    choose: (id) => done.chosen.push(id),
    readOnly,
  };
  return { h, done };
}
const keeper = () => {
  const asked = [];
  return {
    asked,
    url: async (src) => (asked.push(src), `app://vault/${src}`),
    keep: async (f) => ({ src: `Attachments/${f.name}` }),
  };
};

describe('pictures brought onto a board', () => {
  // proves: board_images
  test('a dropped picture is kept by the host, then placed where it was dropped and chosen', async () => {
    const { h, done } = hooks();
    const took = await bringIn(
      carried([file('Eiffel.png', 'image/png'), file('notes.pdf', 'application/pdf')]),
      [400, 300],
      h,
      keeper(),
    );
    assert.ok(took);
    assert.equal(done.writes.length, 1, 'only the picture: a document is not one');
    const { item } = done.writes[0];
    assert.equal(item.kind, 'Image');
    assert.equal(item.more.src, 'Attachments/Eiffel.png');
    assert.deepEqual([item.x + item.w / 2, item.y + item.h / 2], [400, 300]);
    assert.deepEqual(done.chosen, [item.id]);
    assert.match(done.said.join(' '), /Added the picture Eiffel/);
  });

  // proves: board_images
  test('two pictures at once get two ids, and a picture never covers another item: it goes just below', async () => {
    const { h, done } = hooks();
    await bringIn(carried([file('a.png', 'image/png'), file('b.jpg', 'image/jpeg')]), [1500, 1500], h, keeper());
    const [one, two] = done.writes.map((w) => w.item);
    assert.notEqual(one.id, two.id);
    assert.ok(two.y >= one.y + one.h, 'the second is below the first');
    const over = hooks();
    await bringIn(carried([file('c.png', 'image/png')]), [50, 50], over.h, keeper());
    const { item } = over.done.writes[0];
    assert.ok(item.y >= 160, 'dropped on the sticky, it lands clear of it');
    assert.equal(item.x + item.w / 2, 50, 'and no further across');
  });

  // proves: board_images
  test('a host with nowhere to keep a picture says so and adds nothing; a refusal to keep is said too', async () => {
    const none = hooks();
    assert.ok(await bringIn(carried([file('a.png', 'image/png')]), [0, 0], none.h, undefined));
    assert.equal(none.done.writes.length, 0);
    assert.match(none.done.said.join(' '), /cannot be kept here/);
    const full = hooks();
    const refuses = { url: async () => null, keep: async () => ({ refused: 'The disk is full.' }) };
    await bringIn(carried([file('a.png', 'image/png')]), [0, 0], full.h, refuses);
    assert.equal(full.done.writes.length, 0);
    assert.deepEqual(full.done.said, ['The disk is full.']);
  });

  // proves: board_images
  test('a note dropped or pasted becomes a card that links to it; plain words and a read-only board take nothing', async () => {
    const { h, done } = hooks();
    assert.ok(await bringIn(carried([], '[[Trips/Paris]]'), [300, 200], h, undefined));
    const { item } = done.writes[0];
    assert.equal(item.kind, 'Card');
    assert.equal(item.text, 'Paris');
    assert.equal(item.more.links, 'Trips/Paris');
    assert.equal(await bringIn(carried([], 'just some words'), [0, 0], h, undefined), false);
    const locked = hooks(true);
    assert.equal(await bringIn(carried([file('a.png', 'image/png')]), [0, 0], locked.h, keeper()), false);
    assert.deepEqual(broughtIn(null), { files: [], note: null });
  });

  // proves: board_images
  test('each picture kept beside the notes is painted into its frame; a link to the web is never asked for', async () => {
    const { window } = new JSDOM(`<body>${boardSvg(BOARD, PALETTE)}</body>`);
    const svg = window.document.querySelector('svg');
    const pictures = keeper();
    paintImages(svg, BOARD, pictures);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(pictures.asked, ['Attachments/cat.png'], 'only the local one');
    const pic = svg.querySelector('[data-image="pic"] image');
    assert.equal(pic.getAttribute('href'), 'app://vault/Attachments/cat.png');
    assert.deepEqual(
      ['x', 'y', 'width', 'height'].map((k) => pic.getAttribute(k)),
      ['300', '0', '200', '100'],
    );
    assert.equal(svg.querySelector('[data-image="web"] image'), null);
    paintImages(svg, BOARD, pictures);
    assert.equal(svg.querySelectorAll('[data-image="pic"] image').length, 1, 'painted again, still one picture');
    paintImages(svg, BOARD, undefined); // a host with no pictures paints none, and nothing fails
  });

  // proves: board_images
  test('a drop on the board is taken at its spot, and a paste in the middle of the view', async () => {
    const { window } = new JSDOM('<body><div id="vp" tabindex="0"></div></body>');
    const vp = window.document.getElementById('vp');
    const { h, done } = hooks();
    bindDrop(vp, h, keeper(), () => [40, 2050]);
    const fire = (type, key, data) => {
      const e = new window.Event(type, { bubbles: true, cancelable: true });
      e[key] = data;
      vp.dispatchEvent(e);
      return e;
    };
    assert.ok(fire('dragover', 'dataTransfer', carried([file('a.png', 'image/png')])).defaultPrevented);
    assert.ok(fire('drop', 'dataTransfer', carried([file('a.png', 'image/png')])).defaultPrevented);
    assert.ok(!fire('drop', 'dataTransfer', carried([], 'just words')).defaultPrevented, 'left to the browser');
    assert.ok(fire('paste', 'clipboardData', carried([], '[[Paris]]')).defaultPrevented);
    await new Promise((r) => setImmediate(r));
    const items = done.writes.map((w) => w.item);
    const pic = items.find((i) => i.kind === 'Image'),
      card = items.find((i) => i.kind === 'Card');
    assert.deepEqual([pic.x + pic.w / 2, pic.y + pic.h / 2], [40, 2050]);
    assert.deepEqual([card.kind, card.x + 100, card.y + 60], ['Card', 1000, 1000]);
  });
});
