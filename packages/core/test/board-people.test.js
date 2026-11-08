// proves: board_presence, board_offline_merge
// The people and the clashes under a shared board (editor spec §45, board_presence, board_offline_merge). One list
// says who else is here, with a button to go to each. Another lists each flagged clash, with a button to settle it.
// A list is drawn again only when its words change, so the focus stays on the button it was on.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readBoard } from '../src/board.ts';
import { BoardPeople } from '../src/display/board/board-people.ts';

const BOARD = readBoard(`// graph: ideas · BOARD
(a:Sticky {x: 10, y: 20, text: 'One', clash: 'a2'}),
(a2:Sticky {x: 10, y: 200, text: 'Two', clash: 'a'})`).board;

/** The lists in a page with the DOM helpers Obsidian adds, over `peers`, and what they were asked to do. */
function lists(peers, mayEdit = true) {
  const { window } = new JSDOM('<body><div id="root"></div></body>');
  window.Element.prototype.createEl = function (tag, o = {}) {
    const el = this.ownerDocument.createElement(tag);
    if (o.text) el.textContent = o.text;
    if (o.cls) el.className = o.cls;
    for (const [k, v] of Object.entries(o.attr ?? {})) el.setAttribute(k, v);
    this.append(el);
    return el;
  };
  window.Element.prototype.createDiv = function (o) {
    return this.createEl('div', o);
  };
  window.Element.prototype.createSpan = function (o) {
    return this.createEl('span', o);
  };
  window.HTMLElement.prototype.empty = function () {
    this.replaceChildren();
  };
  const root = window.document.getElementById('root');
  const done = { shown: [], settled: [], said: [], told: [] };
  const state = { peers };
  const together = {
    me: 'me',
    peers: () => state.peers,
    announce: (h) => done.told.push(h),
    watch: () => {},
    text: () => '',
    change: async () => undefined,
  };
  const people = new BoardPeople(root, {
    board: () => BOARD,
    together,
    palette: {},
    parse: () => null,
    mayEdit,
    show: (s) => done.shown.push(s),
    settle: (i) => done.settled.push(i),
    say: (w) => done.said.push(w),
  });
  return { root, people, done, state };
}
const now = Date.now();
const bo = { id: 'bo', name: 'Bo', pointer: [50, 60], selection: ['a'], seen: now };
const mute = { id: 'cy', name: 'Cy', selection: [], seen: now };

describe('the people here', () => {
  test('are listed without this person, each with a button that goes to them once, when pressed', () => {
    const { root, done } = lists([{ id: 'me', name: 'Ada', selection: [], seen: now }, bo]);
    const rows = root.querySelectorAll('.thoughtknot-board-people li');
    assert.equal(rows.length, 1);
    assert.match(rows[0].textContent, /Bo/);
    assert.deepEqual(done.shown, [], 'nothing moves on its own');
    root.querySelector('button[aria-label="Go to Bo"]').click();
    assert.deepEqual(done.shown, [[50, 60]]);
    assert.match(done.said.at(-1), /Showing where Bo is/);
  });

  test('say so when a person has nothing to show yet, and move nothing', () => {
    const { root, done } = lists([mute]);
    root.querySelector('button[aria-label="Go to Cy"]').click();
    assert.deepEqual(done.shown, []);
    assert.match(done.said.at(-1), /Cy has nothing to show yet/);
  });

  test('are drawn again only when their words change, so the focus stays', () => {
    const { root, people, state } = lists([bo]);
    const button = root.querySelector('button');
    button.focus();
    people.refresh();
    assert.equal(root.querySelector('button'), button, 'the same button');
    state.peers = [bo, mute];
    people.refresh();
    assert.equal(root.querySelectorAll('.thoughtknot-board-people li').length, 2);
    assert.equal(root.ownerDocument.activeElement.getAttribute('data-row'), 'bo', 'the focus is where it was');
  });

  test('are hidden when no one else is here', () => {
    const { root } = lists([]);
    assert.equal(root.querySelector('.thoughtknot-board-people').hidden, true);
  });
});

describe('the clashes to settle', () => {
  test('are listed, each with a button that settles that item with its flag off', () => {
    const { root, done } = lists([]);
    const buttons = root.querySelectorAll('.thoughtknot-board-clashes button');
    assert.equal(buttons.length, 2);
    buttons[0].click();
    assert.equal(done.settled.length, 1);
    assert.equal(done.settled[0].id, 'a');
    assert.equal(done.settled[0].more.clash, undefined);
  });

  test('are listed without a button for someone who may not change the board', () => {
    const { root } = lists([], false);
    assert.equal(root.querySelectorAll('.thoughtknot-board-clashes li').length, 2);
    assert.equal(root.querySelectorAll('.thoughtknot-board-clashes button').length, 0);
  });
});

describe('telling the others where this person is', () => {
  test('sends a pointer at most every 80 ms, and a change of focus at once', () => {
    const { people, done } = lists([]);
    people.tell([1, 2], null);
    people.tell([3, 4], null);
    assert.equal(done.told.length, 1, 'the second pointer waits');
    people.tell(undefined, 'a', true);
    assert.deepEqual(done.told.at(-1), { selection: ['a'] });
  });
});
