// A whiteboard opened in Obsidian (editor spec §45):
// - A board block opens as a board, drawn in a viewport, offline: nothing is fetched (board_view).
// - It pans and zooms with a drawing's gestures (board_view). These are the wheel with Ctrl, a drag once zoomed in, a
//   pinch, a double tap, and the keys + - 0 and the arrows.
// - Every item is reached, made, moved, sized, joined and taken out by keyboard (board_keyboard). Each step is said in
//   a live region, and the outline lists the board. A mouse drag moves an item too.
// - Every edit is written to the board block in the note, and the view and every other item stay where they were.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, settled, until } from './host/load-plugin.js';
import { show } from './host/view-notes.js';
import { fence } from './host/notes.js';
import { mouse, touch } from './host/drag-steps.js';

before(() => build());

const PATH = 'Some note.md';
const BOARD = `// graph: ideas · BOARD
(a:Sticky {x: 10, y: 20, text: 'Go by train'}),
(b:Card {x: 300, y: 20, w: 160, h: 90, text: 'Paris'}),
(c:Sticky {x: 1600, y: 1200, text: 'Far'}),
(a)-[:CONNECTS]->(b)`;
const NOTE = `# Trip\n\n${fence(BOARD)}\n`;

/** The board shown as Obsidian shows the block, with its parts and a way to press keys on it. */
async function board(note = NOTE) {
  const env = await load({ files: { [PATH]: note } });
  // offline: anything the board asked of the network would be counted here
  const fetched = [],
    realFetch = globalThis.fetch;
  globalThis.fetch = (url) => (fetched.push(String(url)), Promise.reject(new Error('offline')));
  const uninstall = env.uninstall;
  env.uninstall = () => ((globalThis.fetch = realFetch), uninstall());
  const { el } = await show(env, note);
  const vp = el.querySelector('.thoughtknot-board .thoughtknot-viewport');
  const press = (key, more = {}) => vp.dispatch('keydown', { key, target: vp, ...more });
  const said = () => el.querySelector('.thoughtknot-board-said').text;
  const place = () => ({
    x: parseFloat(vp.cssProps['--thoughtknot-x']),
    y: parseFloat(vp.cssProps['--thoughtknot-y']),
    w: Number(el.querySelector('svg.thoughtknot-svg').getAttribute('width')),
  });
  const noteNow = () => env.state.files.get(PATH);
  return { env, el, vp, press, said, place, noteNow, fetched };
}

describe('a board opened in a note', () => {
  test('is drawn as one picture in a viewport, named as a whiteboard, with its outline', async () => {
    const { env, el, vp, fetched } = await board();
    try {
      assert.deepEqual(fetched, [], 'nothing fetched: it opens offline');
      assert.ok(vp, 'a viewport');
      assert.equal(vp.getAttribute('aria-roledescription'), 'whiteboard');
      assert.equal(vp.getAttribute('tabindex'), '0');
      const svg = el.querySelector('svg.thoughtknot-svg');
      for (const id of ['a', 'b', 'c']) assert.ok(svg.querySelector(`[data-item="${id}"]`), `item ${id} drawn`);
      const lines = el.querySelectorAll('.thoughtknot-board-outline li').map((li) => li.text);
      assert.equal(lines.length, 3);
      assert.match(lines[0], /Sticky note: Go by train. leads to Card: Paris/);
      assert.equal(el.querySelector('pre'), null, 'not shown as code');
    } finally {
      env.uninstall();
    }
  });
});

describe('pan and zoom, as a drawing', () => {
  test('the keys + and - zoom in and out, and 0 fits the whole board again', async () => {
    const { env, press, place } = await board();
    try {
      const fit = place().w;
      press('+');
      assert.ok(place().w > fit, 'zoomed in');
      press('-');
      press('-');
      press('0');
      assert.equal(place().w, fit, 'fitted again');
    } finally {
      env.uninstall();
    }
  });

  test('the wheel with Ctrl zooms about the pointer; alone it leaves the note to scroll', async () => {
    const { env, vp, place } = await board();
    try {
      const fit = place().w;
      const plain = vp.dispatch('wheel', { clientX: 100, clientY: 100, deltaY: -100, deltaMode: 0 });
      assert.equal(plain.defaultPrevented, false);
      assert.equal(place().w, fit);
      const zoomed = vp.dispatch('wheel', { clientX: 100, clientY: 100, deltaY: -200, deltaMode: 0, ctrlKey: true });
      assert.ok(zoomed.defaultPrevented);
      assert.ok(place().w > fit);
    } finally {
      env.uninstall();
    }
  });

  test('once zoomed in, a drag on empty room pans, and the arrow keys pan with nothing in focus', async () => {
    const { env, vp, press, place } = await board();
    try {
      press('+');
      press('+');
      const before = place();
      vp.dispatch('pointerdown', mouse(1, vp, { clientX: 300, clientY: 300 }));
      vp.dispatch('pointermove', mouse(1, vp, { clientX: 260, clientY: 280 }));
      vp.dispatch('pointerup', mouse(1, vp, { clientX: 260, clientY: 280 }));
      const dragged = place();
      assert.deepEqual([dragged.x - before.x, dragged.y - before.y], [-40, -20]);
      press('ArrowRight');
      assert.ok(place().x < dragged.x, 'the board moves left, as a drag to the left would take it');
    } finally {
      env.uninstall();
    }
  });

  test('two fingers pinch to zoom, and a double tap zooms in', async () => {
    const { env, vp, place } = await board();
    try {
      const fit = place().w;
      vp.dispatch('pointerdown', touch(1, vp, { clientX: 200, clientY: 200 }));
      vp.dispatch('pointerdown', touch(2, vp, { clientX: 300, clientY: 200 }));
      vp.dispatch('pointermove', touch(2, vp, { clientX: 400, clientY: 200 }));
      vp.dispatch('pointerup', touch(2, vp, { clientX: 400, clientY: 200 }));
      vp.dispatch('pointerup', touch(1, vp, { clientX: 200, clientY: 200 }));
      const pinched = place().w;
      assert.ok(pinched > fit, 'pinched open');
      vp.dispatch('pointerdown', touch(3, vp, { clientX: 50, clientY: 380 }));
      vp.dispatch('pointerup', touch(3, vp, { clientX: 50, clientY: 380, timeStamp: 1000 }));
      vp.dispatch('pointerdown', touch(4, vp, { clientX: 50, clientY: 380 }));
      vp.dispatch('pointerup', touch(4, vp, { clientX: 50, clientY: 380, timeStamp: 1100 }));
      assert.ok(place().w > pinched, 'a double tap zooms in');
    } finally {
      env.uninstall();
    }
  });
});

describe('editing by keyboard, written to the note', () => {
  test('Tab reaches an item and says it; an arrow moves it, and only its line changes', async () => {
    const { env, el, press, said, noteNow, place } = await board();
    try {
      press('Tab');
      assert.match(said(), /Sticky note: Go by train/);
      assert.ok(el.querySelector('[data-item="a"]').classList.contains('is-focused'));
      const view = place();
      press('ArrowRight', { shiftKey: true });
      await until(() => /\(a:Sticky \{x: 60, y: 20/.test(noteNow()));
      await settled();
      assert.match(said(), /Moved to 60, 20/);
      assert.ok(noteNow().includes("(b:Card {x: 300, y: 20, w: 160, h: 90, text: 'Paris'})"), 'b stays put');
      assert.deepEqual([place().x, place().y], [view.x, view.y], 'the view stays where it was');
      assert.ok(el.querySelector('[data-item="a"]').classList.contains('is-focused'), 'focus kept');
    } finally {
      env.uninstall();
    }
  });

  test('Alt and an arrow size the item; N makes a note beside it and its text is typed in', async () => {
    const { env, el, press, said, noteNow } = await board();
    try {
      press('Tab');
      press('Tab');
      press('ArrowDown', { altKey: true });
      await until(() => /\(b:Card \{x: 300, y: 20, w: 160, h: 100/.test(noteNow()));
      press('n');
      await until(() => /sticky1:Sticky/.test(noteNow()));
      await settled();
      const field = el.querySelector('.thoughtknot-board-edit textarea');
      assert.ok(field, 'its text is opened');
      assert.match(field.getAttribute('aria-label'), /Text of Sticky note/);
      field.value = 'Book seats';
      field.dispatch('keydown', { key: 'Enter' });
      await until(() => /sticky1:Sticky \{x: \d+, y: \d+, text: 'Book seats'\}/.test(noteNow()));
      await settled();
      assert.match(
        el
          .querySelectorAll('.thoughtknot-board-outline li')
          .map((l) => l.text)
          .join('\n'),
        /Book seats/,
      );
      assert.ok(said());
    } finally {
      env.uninstall();
    }
  });

  test('C joins two items, and Delete takes one out with its connectors', async () => {
    const { env, press, said, noteNow } = await board();
    try {
      press('Tab'); // a
      press('Tab'); // b
      press('c');
      assert.match(said(), /Joining from Card: Paris/);
      press('Tab'); // c
      press('c');
      await until(() => /\(b\)-\[:CONNECTS\]->\(c\)/.test(noteNow()));
      await settled();
      assert.match(said(), /Card: Paris now leads to Sticky note: Far/);
      press('Tab', { shiftKey: true }); // b
      press('Delete');
      await until(() => !/\(b:Card/.test(noteNow()));
      assert.doesNotMatch(noteNow(), /CONNECTS\]->\(b\)|\(b\)-\[/);
      await settled();
      assert.match(said(), /Took out Card: Paris/);
    } finally {
      env.uninstall();
    }
  });

  test('a mouse drag moves an item, and a tap on one puts the keyboard on it', async () => {
    const { env, el, vp, said, noteNow, place } = await board();
    try {
      const s = place().w / 1760; // the drawing's width at this zoom over the board's
      const item = el.querySelector('[data-item="a"]');
      vp.dispatch('pointerdown', mouse(1, item, { clientX: place().x + 50 * s, clientY: place().y + 50 * s }));
      vp.dispatch('pointerup', mouse(1, item, { clientX: place().x + 50 * s, clientY: place().y + 50 * s }));
      assert.match(said(), /Sticky note: Go by train/);
      const again = el.querySelector('[data-item="a"]');
      vp.dispatch('pointerdown', mouse(2, again, { clientX: 100, clientY: 100 }));
      vp.dispatch('pointermove', mouse(2, again, { clientX: 100 + 30 * s, clientY: 100 }));
      vp.dispatch('pointerup', mouse(2, again, { clientX: 100 + 30 * s, clientY: 100 }));
      await until(() => /\(a:Sticky \{x: 40, y: 20/.test(noteNow()));
    } finally {
      env.uninstall();
    }
  });
});
