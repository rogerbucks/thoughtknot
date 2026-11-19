// The phone's shell (editor spec ES§40, phone_shell), without a browser: the bar's buttons, the view each shows, the
// room it leaves the board, and that a computer's page is left alone. The real layout is checked in a browser by
// test/phone-shell.test.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { PHONE_TABS, phoneShell } from '../page/phone-shell.ts';

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

  test('a computer’s page is left alone', () => {
    const win = page(false);
    assert.equal(phoneShell(win), false);
    assert.equal(win.document.querySelector('.gn-tabbar'), null);
    assert.ok(!win.document.documentElement.classList.contains('gn-phone'));
  });
});
