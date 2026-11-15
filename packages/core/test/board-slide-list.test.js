// The Slides list beside Present (editor spec ES§45, board_slides). It starts folded. Open, it lists the frames in
// the order they play, then those left out. Each row steps its slide, leaves it out or puts it back.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { installHost } from '../src/display/host.ts';
import { SlideList } from '../src/display/board/board-slide-list.ts';

const TEXT = `// graph: talk · BOARD
(intro:Frame {x: 0, y: 0, w: 800, h: 600, text: 'Why trains'}),
(plan:Frame {x: 900, y: 0, w: 800, h: 600, text: 'The plan'}),
(end:Frame {x: 0, y: 700, w: 800, h: 600}),
(a:Sticky {x: 40, y: 40, text: 'Go by train'})`;

/** A list in a page with the DOM helpers Obsidian adds, over a board kept as text and written by its changes. */
function list(text = TEXT) {
  const { window } = new JSDOM('<body><div id="row"></div></body>');
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
  const row = window.document.getElementById('row');
  const state = { text, chosen: [], changes: [] };
  new SlideList(row, {
    board: () => readBoard(state.text).board,
    say: () => {},
    choose: (id) => state.chosen.push(id),
    write: async (change) => {
      state.changes.push(change);
      const r = boardEdit(state.text, change);
      if ('text' in r) state.text = r.text;
    },
  });
  const fold = row.querySelector('.thoughtknot-board-slides-fold');
  const panel = row.querySelector('.thoughtknot-board-layers-list');
  const does = (what) => row.querySelector(`[data-slide-do="${what}"]`);
  const names = () => [...row.querySelectorAll('.thoughtknot-board-layer-name')].map((b) => b.textContent);
  const settle = () => new Promise((done) => setImmediate(done));
  return { window, state, fold, panel, does, names, settle };
}

beforeEach(() => installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} }));

describe('the Slides list', () => {
  // proves: board_slides
  test('starts folded to one button, and opens to the slides in the order they play', () => {
    const { fold, panel, names, does } = list(TEXT.replace('// graph: talk', '// graph: first'));
    assert.equal(fold.getAttribute('aria-expanded'), 'false');
    assert.ok(panel.hidden);
    fold.click();
    assert.equal(fold.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(names(), ['1. Why trains', '2. The plan', '3. end']);
    assert.ok(does('earlier:intro').disabled, 'the first plays no earlier');
    assert.ok(does('later:end').disabled, 'the last plays no later');
  });

  // proves: board_slides
  test('steps a slide later and earlier, writing only the order', async () => {
    const { fold, does, names, state, settle } = list(TEXT.replace('// graph: talk', '// graph: steps'));
    fold.click();
    does('later:intro').click();
    await settle();
    assert.deepEqual(names(), ['1. The plan', '2. Why trains', '3. end']);
    does('earlier:end').click();
    await settle();
    assert.deepEqual(names(), ['1. The plan', '2. end', '3. Why trains']);
    assert.ok(state.text.includes('(a:Sticky {x: 40, y: 40'), 'nothing on the board moved');
    assert.ok(state.text.includes('(plan:Frame {x: 900, y: 0, w: 800, h: 600'), 'no frame moved');
  });

  // proves: board_slides
  test('leaves a slide out of the show, lists it after the others, and puts it back', async () => {
    const { fold, does, names, settle } = list(TEXT.replace('// graph: talk', '// graph: skips'));
    fold.click();
    assert.equal(does('skip:plan').getAttribute('aria-label'), 'Leave The plan out of the show');
    does('skip:plan').click();
    await settle();
    assert.deepEqual(names(), ['1. Why trains', '2. end', 'Left out: The plan']);
    assert.equal(does('earlier:plan'), null, 'a frame left out has no place to step');
    does('unskip:plan').click();
    await settle();
    assert.deepEqual(names(), ['1. Why trains', '2. The plan', '3. end']);
  });

  // proves: board_slides
  test('brings a frame into view by a press on its name, and folds by Escape', () => {
    const { window, fold, panel, does, state } = list(TEXT.replace('// graph: talk', '// graph: goes'));
    fold.click();
    does('go:plan').click();
    assert.deepEqual(state.chosen, ['plan']);
    does('go:plan').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.ok(panel.hidden);
    assert.equal(window.document.activeElement, fold);
  });

  // proves: board_slides
  test('says how to make a slide when the board has no frame', () => {
    const { fold, panel } = list(`// graph: bare · BOARD\n(a:Sticky {x: 40, y: 40, text: 'Go by train'})`);
    fold.click();
    assert.match(panel.textContent, /Add a frame first/);
  });
});
