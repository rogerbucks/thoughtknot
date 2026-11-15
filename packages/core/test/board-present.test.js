// A board presented as a slide show (editor spec ES§45, board_slides). Present shows the board alone and puts the view
// on the first slide. Keys, a press and a swipe step through the slides. Escape ends the show, and the view goes back.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readBoard } from '../src/board.ts';
import { slidePlace } from '../src/board-slides.ts';
import { boardFrame, itemBox } from '../src/board-svg.ts';
import { installHost } from '../src/display/host.ts';
import { Presenter } from '../src/display/board/board-present.ts';
import { BoardSpace } from '../src/display/board/board-space.ts';
import { Zoom } from '../src/zoom.ts';

const TEXT = `// graph: talk · BOARD
(intro:Frame {x: 0, y: 0, w: 800, h: 600, text: 'Why trains'}),
(plan:Frame {x: 900, y: 0, w: 800, h: 600, text: 'The plan'}),
(end:Frame {x: 0, y: 700, w: 800, h: 600}),
(a:Sticky {x: 40, y: 40, text: 'Go by train'})`;

/** A show in a page with the DOM helpers Obsidian adds, where motion is still, so each slide shows at once. */
function show(text = TEXT) {
  const { window } = new JSDOM('<body><div id="root"><div class="vp" tabindex="0"></div></div></body>');
  const P = window.Element.prototype;
  P.createEl = function (tag, o = {}) {
    const el = this.ownerDocument.createElement(tag);
    if (o.text) el.textContent = o.text;
    if (o.cls) el.className = o.cls;
    for (const [k, v] of Object.entries(o.attr ?? {})) el.setAttribute(k, v);
    this.append(el);
    return el;
  };
  P.createDiv = function (o) {
    return this.createEl('div', o);
  };
  P.createSpan = function (o) {
    return this.createEl('span', o);
  };
  P.addClass = function (c) {
    this.classList.add(c);
  };
  P.removeClass = function (c) {
    this.classList.remove(c);
  };
  P.setText = function (t) {
    this.textContent = t;
  };
  window.matchMedia = () => ({ matches: true }); // reduced motion
  const root = window.document.getElementById('root');
  const vp = root.querySelector('.vp');
  const screen = { width: 1600, height: 900 };
  root.getBoundingClientRect = () => ({ ...screen });
  vp.getBoundingClientRect = () => ({ width: screen.width, height: 420, left: 0, top: 0 });
  const board = readBoard(text).board;
  const frame = boardFrame(board);
  const zoom = new Zoom({ width: frame.w, height: frame.h }, { width: 1600, height: 420 }, 'note');
  const space = new BoardSpace(
    vp,
    () => zoom,
    () => frame,
  );
  const said = [];
  const p = new Presenter(
    root,
    vp,
    { board: () => board, say: (w) => said.push(w), centre: () => space.centre() },
    zoom,
    space,
  );
  const go = root.querySelector('.thoughtknot-board-present button');
  const bar = root.querySelector('.thoughtknot-board-present-bar');
  const key = (k, on = vp) => {
    const e = new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    on.dispatchEvent(e);
    return e;
  };
  const point = (type, x) => {
    const e = new window.Event(type, { bubbles: true, cancelable: true });
    e.clientX = x;
    vp.dispatchEvent(e);
  };
  const placeOf = (id) => slidePlace(itemBox(board.items.find((i) => i.id === id)), frame, screen);
  const view = () => {
    const v = zoom.view();
    return { scale: v.scale, x: v.x, y: v.y };
  };
  return { window, root, vp, p, go, bar, said, key, point, placeOf, view, zoom, screen };
}

beforeEach(() => installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} }));

describe('a board presented as a slide show', () => {
  // proves: board_slides
  test('has a Present button above the board, and no bar until the show plays', () => {
    const { go, bar, root, vp } = show();
    assert.equal(go.getAttribute('aria-label'), 'Present');
    assert.equal(go.parentElement.nextElementSibling, vp, 'above the board');
    assert.ok(bar.hidden);
    assert.ok(!root.classList.contains('thoughtknot-board-show'));
  });

  // proves: board_slides
  test('shows the board alone, the view on the slide the person was looking at, and says which slide it is', () => {
    const { go, bar, root, said, placeOf, view, p } = show();
    go.click();
    assert.ok(root.classList.contains('thoughtknot-board-show'));
    assert.ok(!bar.hidden);
    assert.equal(p.at, 0);
    assert.deepEqual(view(), placeOf('intro'));
    assert.equal(said.at(-1), 'Slide 1 of 3: Why trains');
    assert.equal(bar.querySelector('.thoughtknot-board-present-count').textContent, '1 / 3');
  });

  // proves: board_slides
  test('steps on and back by the keys, to either end by Home and End, and stays at the last slide', () => {
    const { go, key, placeOf, view, p, said } = show();
    go.click();
    assert.ok(key('ArrowRight').defaultPrevented);
    assert.deepEqual(view(), placeOf('plan'));
    key(' ');
    assert.deepEqual(view(), placeOf('end'));
    assert.equal(said.at(-1), 'Slide 3 of 3');
    key('PageDown');
    assert.equal(p.at, 2, 'the show stays on its last slide');
    key('ArrowLeft');
    assert.equal(p.at, 1);
    key('Home');
    assert.equal(p.at, 0);
    key('End');
    assert.equal(p.at, 2);
  });

  // proves: board_slides
  test('keeps every key and press from the board under it, so nothing on the board changes', () => {
    const { window, go, vp, key, point } = show();
    const heard = [];
    vp.addEventListener('keydown', (e) => heard.push(e.key));
    vp.addEventListener('pointerdown', () => heard.push('press'));
    go.click();
    key('Delete');
    key('n');
    key('ArrowRight');
    point('pointerdown', 100);
    assert.deepEqual(heard, []);
    assert.ok(window.document.body.contains(vp));
  });

  // proves: board_slides
  test('goes on by a press or a swipe to the left, and back by a swipe to the right', () => {
    const { go, point, p } = show();
    go.click();
    point('pointerdown', 500);
    point('pointerup', 500);
    assert.equal(p.at, 1, 'a press goes on');
    point('pointerdown', 500);
    point('pointerup', 300);
    assert.equal(p.at, 2, 'a swipe to the left goes on');
    point('pointerdown', 300);
    point('pointerup', 600);
    assert.equal(p.at, 1, 'a swipe to the right goes back');
  });

  // proves: board_slides
  test('steps by the buttons of its bar, and ends by its End button', () => {
    const { go, bar, p, root } = show();
    go.click();
    const press = (label) => bar.querySelector(`button[aria-label="${label}"]`).click();
    press('Next slide');
    assert.equal(p.at, 1);
    press('Previous slide');
    assert.equal(p.at, 0);
    press('End the show');
    assert.equal(p.at, -1);
    assert.ok(!root.classList.contains('thoughtknot-board-show'));
  });

  // proves: board_slides
  test('ends by Escape: the bars come back, the view goes back where it was, and the keyboard to the button', () => {
    const { window, go, bar, root, key, view, said, zoom } = show();
    zoom.place(0.5, -120, -40);
    const before = view();
    go.click();
    key('ArrowRight');
    key('Escape');
    assert.ok(!root.classList.contains('thoughtknot-board-show'));
    assert.ok(bar.hidden);
    assert.deepEqual(view(), before);
    assert.equal(said.at(-1), 'The show has ended. The board is where you left it.');
    assert.equal(window.document.activeElement, go);
  });

  // proves: board_slides
  test('says how to make a slide on a board with no frame, and starts no show', () => {
    const { go, root, said } = show(`// graph: talk · BOARD\n(a:Sticky {x: 40, y: 40, text: 'Go by train'})`);
    go.click();
    assert.ok(!root.classList.contains('thoughtknot-board-show'));
    assert.equal(said.at(-1), 'Add a frame first: each frame is a slide.');
  });
});
