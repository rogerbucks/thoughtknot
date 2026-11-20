// The phone's shell (editor spec ES§40, phone_shell), without a browser. It checks the bar's buttons and the view each
// shows. It checks the room the shell leaves the board and the drawing, and the note's name in the header. A
// computer's page is left alone. The real layout is checked in a browser by test/phone-shell.test.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { PHONE_TABS, phoneShell, phoneTitle } from '../page/phone-shell.ts';

/** A page with a header and the pane's tabs, on a screen that is a phone's or is not. */
function page(phone) {
  const dom = new JSDOM(
    '<header>Head</header><main><div class="gn-pane"><div class="thoughtknot-tabs"><button>Drawing</button><button>Text</button></div></div></main>',
  );
  const win = dom.window;
  win.matchMedia = () => ({ matches: phone });
  Object.defineProperty(win, 'innerHeight', { value: 852 });
  return win;
}

describe('the phone shell', () => {
  test('a phone gets a bar of the four views, on the Board', () => {
    const win = page(true);
    assert.equal(phoneShell(win), true);
    const buttons = [...win.document.querySelectorAll('.gn-tabbar .gn-tab')];
    assert.deepEqual(
      buttons.map((b) => b.dataset.tab),
      [...PHONE_TABS],
    );
    assert.deepEqual(
      buttons.map((b) => b.textContent),
      ['Board', 'Graph', 'Note', 'More'],
    );
    assert.equal(win.document.documentElement.dataset.tab, 'board');
    assert.equal(win.document.querySelector('[aria-current]').textContent, 'Board');
    assert.ok(win.document.documentElement.classList.contains('gn-phone'));
  });

  test('a press shows that view alone, and the Graph view opens on the drawing once', () => {
    const win = page(true);
    phoneShell(win);
    let drawn = 0;
    win.document.querySelector('.thoughtknot-tabs button').addEventListener('click', () => (drawn += 1));
    const press = (tab) => win.document.querySelector(`.gn-tab[data-tab=${tab}]`).click();
    press('graph');
    assert.equal(win.document.documentElement.dataset.tab, 'graph');
    assert.equal(win.document.querySelectorAll('[aria-current]').length, 1);
    assert.equal(win.document.querySelector('[aria-current]').textContent, 'Graph');
    assert.equal(drawn, 1);
    press('note');
    press('graph');
    assert.equal(drawn, 1, 'a second visit keeps where the person left it');
    press('more');
    assert.equal(win.document.documentElement.dataset.tab, 'more');
  });

  test('the board is told how tall to be, and again when the screen turns', () => {
    const win = page(true);
    phoneShell(win);
    const room = () => parseFloat(win.document.documentElement.style.getPropertyValue('--thoughtknot-board-room'));
    assert.ok(room() >= 240 && room() < 852, `room ${room()}`);
    const before = room();
    Object.defineProperty(win, 'innerHeight', { value: 400, configurable: true });
    win.dispatchEvent(new win.Event('resize'));
    assert.ok(room() < before);
    assert.ok(room() >= 240, 'never less than a board can be used in');
  });

  test('a board on the page is told the room from its top to the bar, and keeps it out of sight', () => {
    const win = page(true);
    const doc = win.document;
    doc
      .querySelector('main')
      .insertAdjacentHTML(
        'afterbegin',
        '<section class="gn-boards"><div class="thoughtknot-board"><div class="thoughtknot-viewport"></div></div></section>',
      );
    const vp = doc.querySelector('.thoughtknot-viewport');
    let box = { top: 160, bottom: 560, height: 400 };
    vp.getBoundingClientRect = () => box;
    phoneShell(win);
    const room = () => doc.documentElement.style.getPropertyValue('--thoughtknot-board-room');
    assert.equal(room(), `${852 - 160 - 8}px`, 'from its top to the bar, less a small gap');
    box = { top: 0, bottom: 0, height: 0 };
    win.dispatchEvent(new win.Event('resize'));
    assert.equal(room(), `${852 - 160 - 8}px`, 'out of sight, it keeps its room');
  });

  test('a drawing on the page is told its room too', () => {
    const win = page(true);
    const doc = win.document;
    doc
      .querySelector('.gn-pane')
      .insertAdjacentHTML(
        'beforeend',
        '<div class="thoughtknot-pane-drawing"><div class="thoughtknot-viewport"></div></div>',
      );
    doc.querySelector('.thoughtknot-pane-drawing .thoughtknot-viewport').getBoundingClientRect = () => ({
      top: 220,
      bottom: 500,
      height: 280,
    });
    phoneShell(win);
    assert.equal(doc.documentElement.style.getPropertyValue('--thoughtknot-graph-room'), `${852 - 220 - 8}px`);
  });

  test('on a phone the header names the note; elsewhere it is left alone', () => {
    const win = page(true);
    win.document.querySelector('header').innerHTML = '<h1 class="gn-title">ThoughtKnot editor</h1>';
    phoneShell(win);
    phoneTitle(win.document, 'Projects/Map.md');
    assert.equal(win.document.querySelector('.gn-title').textContent, 'Map');
    const other = page(false);
    other.document.querySelector('header').innerHTML = '<h1 class="gn-title">ThoughtKnot editor</h1>';
    phoneShell(other);
    phoneTitle(other.document, 'Projects/Map.md');
    assert.equal(other.document.querySelector('.gn-title').textContent, 'ThoughtKnot editor');
  });

  test('a computer’s page is left alone', () => {
    const win = page(false);
    assert.equal(phoneShell(win), false);
    assert.equal(win.document.querySelector('.gn-tabbar'), null);
    assert.ok(!win.document.documentElement.classList.contains('gn-phone'));
  });
});
