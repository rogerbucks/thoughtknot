// A whiteboard on the browser editor's page (editor spec §45, board_view, board_keyboard). VS Code's tab, the desktop
// app and the phone app run this page. A board block opens there as it does in Obsidian. It is drawn in a viewport
// that zooms by keys and is worked by the keyboard. Each edit is written to the note on disk. The page runs as built,
// in a DOM, against the real server.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { cleanUp } from './editor-page-support.js';
import { livePage } from './editor-page-live.js';
import { boardEdit } from '../../core/src/board-edit.ts';

after(cleanUp);

const NOTE = [
  '# Ideas',
  '```gql',
  '// graph: ideas · BOARD',
  "(a:Sticky {x: 10, y: 20, text: 'Go by train'}),",
  "(b:Card {x: 300, y: 20, w: 160, h: 90, text: 'Paris'}),",
  '(a)-[:CONNECTS]->(b)',
  '```',
  '',
].join('\n');

describe('a board on the browser editor’s page', () => {
  // proves: board_arranged_by_graph
  test('has an Arrange by graph button that moves linked items once, and Undo puts them back', async () => {
    const note = [
      '# Team',
      '```gql',
      '// graph: team',
      "(ann:Person {name: 'Ann'}), (bob:Person {name: 'Bob'}), (cat:Person {name: 'Cat'}),",
      '(ann)-[:KNOWS]->(bob), (bob)-[:KNOWS]->(cat)',
      '```',
      '```gql',
      '// graph: ideas · BOARD ON team',
      "(a:Sticky {x: 0, y: 0, text: 'Ann', graph: 'ann'}),",
      "(b:Sticky {x: 10, y: 10, text: 'Bob', graph: 'bob'}),",
      "(d:Sticky {x: 500, y: 500, text: 'Free note'})",
      '```',
      '',
    ].join('\n');
    const page = await livePage(note);
    try {
      const board = () => page.doc.querySelector('.gn-boards .thoughtknot-board');
      await until(() => board()?.querySelector('[data-item="a"]'), 8000);
      const buttons = () => Array.from(board().querySelectorAll('.thoughtknot-board-bar button'));
      assert.equal(buttons()[0].textContent, 'Arrange by graph');
      assert.ok(buttons()[1].hidden, 'nothing to undo yet');
      assert.match(page.file(), /\(a:Sticky \{x: 0, y: 0,/, 'nothing moves by itself');
      const click = (id, more) =>
        board()
          .querySelector(`[data-item="${id}"]`)
          .dispatchEvent(
            new page.window.PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, ...more }),
          );
      click('a', { shiftKey: true });
      await until(() => /Arrange 1 chosen/.test(buttons()[0].textContent), 8000);
      assert.ok(board().querySelector('[data-item="a"].is-chosen'), 'the chosen item is ringed');
      board()
        .querySelector('.thoughtknot-viewport')
        .dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await until(() => buttons()[0].textContent === 'Arrange by graph', 8000);
      buttons()[0].click();
      await until(() => !/\(a:Sticky \{x: 0, y: 0,/.test(page.file()), 8000);
      assert.match(page.file(), /\(d:Sticky \{x: 500, y: 500,/, 'a free item stays put');
      await until(() => !buttons()[1].hidden, 8000);
      buttons()[1].click();
      await until(
        () => /\(a:Sticky \{x: 0, y: 0,/.test(page.file()) && /\(b:Sticky \{x: 10, y: 10,/.test(page.file()),
        8000,
      );
    } finally {
      await page.stop();
    }
  });

  // proves: board_tools
  test('has a tool rail, folded at first, that makes a sticky where pressed, pans with Hand and joins two items', async () => {
    const page = await livePage(NOTE);
    try {
      const board = () => page.doc.querySelector('.gn-boards .thoughtknot-board');
      const vp = () => board()?.querySelector('.thoughtknot-viewport');
      await until(() => vp()?.querySelector('[data-item="a"]'), 8000);
      const rail = () => board().querySelector('.thoughtknot-board-tools');
      const tool = (name) => rail().querySelector(`[data-tool="${name}"]:not(.thoughtknot-board-tools-fold)`);
      const fold = () => rail().querySelector('.thoughtknot-board-tools-fold');
      assert.equal(rail().getAttribute('role'), 'toolbar');
      assert.equal(fold().getAttribute('aria-expanded'), 'false', 'folded at first');
      assert.ok(tool('sticky').hidden, 'only the fold button shows');
      assert.match(fold().getAttribute('aria-label'), /Tool in use: Choose/);
      fold().click();
      assert.ok(!tool('sticky').hidden, 'a press opens the rest');
      assert.match(tool('sticky').getAttribute('title'), /press where it goes/);
      const press = (target, more = {}) =>
        target.dispatchEvent(
          new page.window.PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, ...more }),
        );
      const lift = (target) =>
        target.dispatchEvent(new page.window.PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }));

      // a sticky is made where pressed, its text opened, and the tool goes back to Choose
      tool('sticky').click();
      assert.equal(tool('sticky').getAttribute('aria-pressed'), 'true');
      press(vp(), { clientX: 200, clientY: 300 });
      await until(() => /\(sticky1:Sticky \{x: -?\d+, y: -?\d+\}\)/.test(page.file()), 8000);
      assert.ok(page.file().includes("(a:Sticky {x: 10, y: 20, text: 'Go by train'})"), 'a stays put');
      await until(() => board().querySelector('.thoughtknot-board-edit textarea'), 8000);
      assert.equal(tool('choose').getAttribute('aria-pressed'), 'true', 'back to Choose');

      // Hand pans: a drag on an item moves the view, never the item
      tool('hand').click();
      press(vp().querySelector('[data-item="a"]'), { clientX: 20, clientY: 30 });
      lift(vp());
      assert.ok(page.file().includes("(a:Sticky {x: 10, y: 20, text: 'Go by train'})"), 'Hand moves nothing');

      // Connect joins the first item pressed to the second
      tool('connect').click();
      press(vp().querySelector('[data-item="b"]'));
      assert.match(board().querySelector('.thoughtknot-board-said').textContent, /Joining from b/);
      press(vp().querySelector('[data-item="a"]'));
      await until(() => page.file().includes('(b)-[:CONNECTS]->(a)'), 8000);
      vp().dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert.equal(tool('choose').getAttribute('aria-pressed'), 'true', 'Escape lets go of the tool');
    } finally {
      await page.stop();
    }
  });

  // proves: board_ink
  test('draws a stroke with the Pen as one Ink item, keeps drawing until Escape, and the Eraser rubs it out', async () => {
    const page = await livePage(NOTE);
    try {
      const board = () => page.doc.querySelector('.gn-boards .thoughtknot-board');
      const vp = () => board()?.querySelector('.thoughtknot-viewport');
      await until(() => vp()?.querySelector('[data-item="a"]'), 8000);
      const rail = () => board().querySelector('.thoughtknot-board-tools');
      const tool = (name) => rail().querySelector(`[data-tool="${name}"]:not(.thoughtknot-board-tools-fold)`);
      rail().querySelector('.thoughtknot-board-tools-fold').click();
      const fire = (type, x, y) => {
        vp().setPointerCapture = () => {}; // the fake window has none, and the board may be drawn afresh
        return vp().dispatchEvent(
          new page.window.PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            button: 0,
            pointerId: 7,
            clientX: x,
            clientY: y,
          }),
        );
      };
      const stroke = (from) => {
        fire('pointerdown', from, 300);
        for (let i = 1; i <= 6; i++) fire('pointermove', from + i * 20, 300 + (i % 2) * 15);
        fire('pointerup', from + 140, 300);
      };
      tool('pen').click();
      assert.ok(vp().classList.contains('is-inking'), 'a drag now draws, so touch is the pen alone');
      const before = page.file();
      stroke(100);
      await until(
        () => /\(ink1:Ink \{x: -?\d+, y: -?\d+, w: \d+, h: \d+, points: '[\d -]+'\}\)/.test(page.file()),
        8000,
      );
      assert.ok(page.file().includes("(a:Sticky {x: 10, y: 20, text: 'Go by train'})"), 'nothing else moved');
      assert.notEqual(page.file(), before);
      await until(() => vp().querySelector('[data-item="ink1"] path'), 8000);
      assert.equal(tool('pen').getAttribute('aria-pressed'), 'true', 'the Pen stays for the next stroke');

      // the Eraser rubs out the stroke it crosses, and a stroke it does not cross stays
      tool('eraser').click();
      fire('pointerdown', 150, 600);
      fire('pointerup', 160, 600);
      assert.match(page.file(), /\(ink1:Ink /, 'far from the stroke, nothing is erased');
      fire('pointerdown', 100, 300);
      fire('pointermove', 140, 300);
      fire('pointerup', 200, 300);
      await until(() => !/ink1:Ink/.test(page.file()), 8000);
      vp().dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert.equal(tool('choose').getAttribute('aria-pressed'), 'true', 'Escape lets go of the tool');
      assert.ok(!vp().classList.contains('is-inking'));
    } finally {
      await page.stop();
    }
  });

  // proves: board_handles
  test('sizes the item in focus by its handle, and duplicates it by Ctrl+D as one new item', async () => {
    const page = await livePage(NOTE);
    try {
      const board = () => page.doc.querySelector('.gn-boards .thoughtknot-board');
      const vp = () => board()?.querySelector('.thoughtknot-viewport');
      await until(() => vp()?.querySelector('[data-item="b"]'), 8000);
      const fire = (target, type, more = {}) =>
        target.dispatchEvent(
          new page.window.PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, ...more }),
        );
      // a tap on the card puts the keyboard on it, and its handle is drawn
      fire(vp().querySelector('[data-item="b"]'), 'pointerdown', { clientX: 10, clientY: 10 });
      fire(vp(), 'pointerup', { clientX: 10, clientY: 10 });
      await until(() => vp().querySelector('[data-handle="b"]'), 8000);
      assert.equal(vp().querySelectorAll('[data-handle]').length, 1, 'on the item in focus only');
      // a drag by the handle sizes it, and nothing else changes
      fire(vp().querySelector('[data-handle="b"]'), 'pointerdown', { clientX: 100, clientY: 100 });
      fire(vp(), 'pointermove', { clientX: 140, clientY: 120 });
      fire(vp(), 'pointerup', { clientX: 140, clientY: 120 });
      await until(() => !page.file().includes('w: 160, h: 90'), 8000);
      assert.match(page.file(), /\(b:Card \{x: 300, y: 20, w: \d+, h: \d+, text: 'Paris'\}\)/, 'stays where it was');
      assert.ok(page.file().includes("(a:Sticky {x: 10, y: 20, text: 'Go by train'})"), 'a stays put');
      // Ctrl+D duplicates the card beside it
      vp().dispatchEvent(
        new page.window.KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true }),
      );
      await until(() => /\(card1:Card \{/.test(page.file()), 8000);
      assert.match(page.file(), /\(b:Card \{x: 300, y: 20,/, 'the card copied stays put');
    } finally {
      await page.stop();
    }
  });

  // proves: board_view_items
  test('draws a view item’s graph live in its frame, and draws it again when the note changes', async () => {
    const note = [
      '# Trip',
      '```gql',
      '// graph: trip',
      '(paris:City), (lyon:City), (paris)-[:ROAD]->(lyon)',
      '```',
      '```gql',
      '// graph: ideas · BOARD ON trip',
      "(a:Sticky {x: 500, y: 0, text: 'Go by train'}),",
      '(v:View {x: 0, y: 0, w: 400, h: 300})',
      '```',
      '',
    ].join('\n');
    const page = await livePage(note);
    try {
      const vp = () => page.doc.querySelector('.gn-boards .thoughtknot-board .thoughtknot-viewport');
      const picture = () => vp()?.querySelector('[data-item="v"] .thoughtknot-board-view-picture');
      await until(() => picture(), 8000);
      assert.equal(picture().getAttribute('width'), '388', 'inside its frame');
      assert.match(picture().textContent, /paris/);
      // keys move the view: the board is drawn again, and the view's picture with it, never empty
      vp().focus();
      const key = (k, more = {}) =>
        vp().dispatchEvent(
          new page.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...more }),
        );
      key('Tab');
      key('ArrowDown', { shiftKey: true });
      await until(() => page.file().includes('(v:View {x: 0, y: 50, w: 400, h: 300})'), 8000);
      await until(() => picture()?.getAttribute('y') === '72', 8000);
      assert.ok(page.file().includes("(a:Sticky {x: 500, y: 0, text: 'Go by train'})"), 'the sticky stays put');
    } finally {
      await page.stop();
    }
  });

  // proves: board_main_screen
  test('opens a note with a graph and no board on a starter board first, writes it only once changed, and turns back', async () => {
    const note = [
      '# Trip',
      '```gql',
      '// graph: trip',
      '(paris:City), (lyon:City), (paris)-[:ROAD]->(lyon)',
      '```',
      '',
    ].join('\n');
    const page = await livePage(note);
    try {
      const graph = () => page.doc.querySelector('.gn-graph');
      const boards = () => graph()?.querySelector('.gn-boards');
      const vp = () => boards()?.querySelector('.thoughtknot-viewport');
      await until(() => vp()?.querySelector('[data-item="view1"] .thoughtknot-board-view-picture'), 8000);
      assert.equal(graph().firstElementChild, boards(), 'the board comes first');
      assert.match(boards().querySelector('.gn-board-first').textContent, /open on a board/);
      assert.equal(page.file(), note, 'opening the note changes nothing in it');
      // a change to the starter board writes it to the note, with the change
      vp().focus();
      const key = (k, more = {}) =>
        vp().dispatchEvent(
          new page.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...more }),
        );
      key('Tab');
      key('ArrowDown', { shiftKey: true });
      await until(() => page.file().includes('BOARD ON trip'), 8000);
      assert.ok(page.file().startsWith(note.trimEnd()), 'the note as it was comes first');
      assert.match(page.file(), /\(view1:View \{x: 0, y: 50, w: 480, h: 360, of: 'trip'\}\)/);
      // the way back: the graph first, as before
      boards().querySelector('.gn-board-turn').click();
      await until(() => graph().lastElementChild === boards(), 8000);
      assert.match(boards().querySelector('.gn-board-turn').textContent, /board first/);
    } finally {
      await page.stop();
    }
  });

  // proves: board_view, board_keyboard
  test('opens as a board that zooms by keys, and an item moved by keys is written to the note', async () => {
    const page = await livePage(NOTE);
    try {
      const vp = () => page.doc.querySelector('.gn-boards .thoughtknot-board .thoughtknot-viewport');
      await until(() => vp(), 8000);
      assert.equal(vp().getAttribute('aria-roledescription'), 'whiteboard');
      assert.ok(vp().querySelector('svg [data-item="a"]'), 'its items drawn');
      const key = (k, more = {}) =>
        vp().dispatchEvent(
          new page.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...more }),
        );
      const width = () => Number(vp().querySelector('svg').getAttribute('width'));
      const fit = width();
      key('+');
      assert.ok(width() > fit, 'zoomed in');
      key('Tab');
      const said = () => page.doc.querySelector('.gn-boards .thoughtknot-board-said')?.textContent ?? '';
      assert.match(said(), /Sticky note: Go by train/);
      key('ArrowDown', { shiftKey: true });
      await until(() => /\(a:Sticky \{x: 10, y: 70, text: 'Go by train'\}\)/.test(page.file()), 8000);
      await until(() => vp().querySelector('[data-item="a"] rect')?.getAttribute('y') === '70', 8000); // drawn again
      assert.ok(page.file().includes("(b:Card {x: 300, y: 20, w: 160, h: 90, text: 'Paris'})"), 'b stays put');
    } finally {
      await page.stop();
    }
  });

  // proves: board_live_together
  test('a board drawn before sharing starts takes its seat once sharing is ready, and not before', async () => {
    const block = ['// graph: ideas · BOARD', "(a:Sticky {x: 10, y: 20, text: 'Go by train'})"].join('\n');
    const seatText = block + ",\n(z:Sticky {x: 90, y: 90, text: 'From the other device'})";
    let ready = null;
    let open = false;
    const seat = {
      me: 'me',
      peers: () => [],
      announce: () => {},
      watch: () => {},
      text: () => seatText,
      change: async () => undefined,
    };
    const page = await livePage(['# Ideas', '```gql', block, '```', ''].join('\n'), {
      before: (w) => {
        w.thoughtknotSeat = () => (open ? seat : undefined);
        w.thoughtknotSeatsReady = (then) => void (ready = then);
      },
    });
    try {
      const vp = () => page.doc.querySelector('.gn-boards .thoughtknot-board .thoughtknot-viewport');
      await until(() => vp()?.querySelector('[data-item="a"]') && ready, 8000);
      assert.equal(vp().querySelector('[data-item="z"]'), null, 'offline until sharing is ready');
      open = true;
      ready();
      await until(() => vp()?.querySelector('[data-item="z"]'), 8000);
    } finally {
      await page.stop();
    }
  });

  // proves: board_live_together, board_presence, board_offline_merge
  test('a shared board is edited through its seat, shows the others and its clashes, and moves nothing on its own', async () => {
    const block = [
      '// graph: ideas · BOARD',
      "(a:Sticky {x: 10, y: 20, text: 'Go by train'}),",
      "(b:Card {x: 300, y: 20, w: 160, h: 90, text: 'Paris', clash: 'b2'}),",
      "(b2:Card {x: 300, y: 200, w: 160, h: 90, text: 'Rome', clash: 'b'})",
    ].join('\n');
    const state = { text: block, peers: [], watchers: [], told: [], changes: [] };
    const seat = {
      me: 'me',
      peers: () => state.peers,
      announce: (here) => state.told.push(here),
      watch: (f) => state.watchers.push(f),
      text: () => state.text,
      change: async (c) => {
        state.changes.push(c);
        const r = boardEdit(state.text, c);
        if ('refused' in r) return r.refused;
        state.text = r.text;
        return undefined;
      },
    };
    const bo = { id: 'bo', name: 'Bo', selection: ['a'], pointer: [50, 60], seen: Date.now() };
    state.peers = [{ id: 'me', name: 'Ada', selection: [], seen: Date.now() }, bo];
    const page = await livePage(['# Ideas', '```gql', block, '```', ''].join('\n'), {
      before: (w) => {
        w.thoughtknotSeat = () => seat;
      },
    });
    try {
      const root = () => page.doc.querySelector('.gn-boards .thoughtknot-board');
      const vp = () => root()?.querySelector('.thoughtknot-viewport');
      await until(() => vp()?.querySelector('[data-item="a"]'), 8000);
      const key = (k, more = {}) =>
        vp().dispatchEvent(
          new page.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...more }),
        );
      const said = () => root().querySelector('.thoughtknot-board-said')?.textContent ?? '';
      const rect = (id) => vp().querySelector(`[data-item="${id}"] rect`)?.getAttribute('y');
      const note = page.file();

      // the others are drawn over the board, by a shape and an initial, and are listed with a way to go to them
      assert.ok(vp().querySelector('.thoughtknot-presence [data-peer="bo"]'), 'Bo is drawn');
      assert.match(vp().querySelector('[data-peer="bo"]').textContent, /B/);
      assert.ok(root().querySelector('.thoughtknot-board-people button[aria-label="Go to Bo"]'));
      // a clash is flagged on its items and listed, with a button to settle it
      assert.ok(vp().querySelector('[data-item="b"] [data-clash="b2"]'), 'flagged on the item');
      assert.equal(root().querySelectorAll('.thoughtknot-board-clashes button').length, 2);

      // another person's change redraws the board in place: what they moved moves, and nothing else does
      const wide = vp().querySelector('svg').getAttribute('width');
      state.text = state.text.replace("x: 10, y: 20, text: 'Go by train'", "x: 10, y: 90, text: 'Go by train'");
      for (const f of state.watchers) f();
      assert.equal(rect('a'), '90', 'their move is drawn');
      assert.equal(rect('b'), '20', 'the rest stays put');
      assert.equal(vp().querySelector('svg').getAttribute('width'), wide, 'the view is not changed');

      // our keyboard edit goes through the seat, not the page's own write, and we tell the others what is in focus
      key('Tab');
      assert.ok(
        state.told.some((h) => h.selection.length === 1),
        'the focus is told',
      );
      key('ArrowDown', { shiftKey: true });
      await until(() => state.changes.some((c) => c.kind === 'move'), 8000);
      assert.equal(page.file(), note, 'the page wrote nothing of its own');

      // settling a clash writes the item without its flag, and moves nothing
      root().querySelector('.thoughtknot-board-clashes button').click();
      await until(() => state.changes.some((c) => c.kind === 'put'), 8000);
      await until(() => root().querySelectorAll('.thoughtknot-board-clashes button').length === 1, 8000);
      assert.doesNotMatch(state.text, /\(b:Card \{[^}]*clash/);
      assert.equal(rect('b'), '20');

      // going to a person is asked for, and said
      root().querySelector('button[aria-label="Go to Bo"]').click();
      assert.match(said(), /Showing where Bo is/);
    } finally {
      await page.stop();
    }
  });
});

const MANY = [
  '# Ideas',
  '```gql',
  '// graph: ideas · BOARD',
  "(a:Sticky {x: 10, y: 20, text: 'Go by train'})",
  '```',
  '',
  '```gql',
  '// graph: plan · BOARD',
  "(b:Sticky {x: 10, y: 20, text: 'Book it'})",
  '```',
  '',
].join('\n');

describe('a note with many boards on the browser editor’s page', () => {
  // proves: board_many
  test('shows one board in front under a folded list, and the list switches, adds, renames, copies and removes', async () => {
    const page = await livePage(MANY);
    try {
      const list = () => page.doc.querySelector('.gn-boards .thoughtknot-board-list');
      const item = (id) => page.doc.querySelector(`.gn-boards .thoughtknot-board [data-item="${id}"]`);
      const press = (words) =>
        Array.from(list().querySelectorAll('button'))
          .find((b) => b.textContent === words)
          .click();
      await until(() => item('a'), 8000);
      assert.equal(page.doc.querySelectorAll('.gn-boards .thoughtknot-board').length, 1, 'one board in front');
      assert.ok(!list().hasAttribute('open'), 'the list starts folded');
      assert.equal(list().querySelector('summary').textContent, 'Boards: ideas, 1 of 2');
      assert.equal(item('b'), null);

      press('plan');
      await until(() => item('b'), 8000);
      assert.equal(item('a'), null, 'the other board has gone behind');
      assert.ok(page.doc.querySelector('.gn-boards .thoughtknot-board-glide'), 'the board switched to glides in');
      assert.equal(list().querySelector('[aria-current="true"]').textContent, 'plan');
      assert.equal(page.file(), MANY, 'switching writes nothing');

      press('New board');
      await until(() => /\/\/ graph: board · BOARD\n```\n$/.test(page.file()), 8000);
      await until(() => list().querySelector('summary').textContent === 'Boards: board, 3 of 3', 8000);

      press('Rename this board');
      const input = list().querySelector('input');
      input.value = 'plan';
      input.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await until(() => /plan/.test(list().querySelector('[role="status"]').textContent), 8000);
      assert.match(page.file(), /graph: board · BOARD/, 'a taken name is refused and nothing is written');
      input.value = 'later';
      input.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await until(() => /\/\/ graph: later · BOARD/.test(page.file()), 8000);
      await until(() => list().querySelector('summary').textContent === 'Boards: later, 3 of 3', 8000);

      press('plan');
      await until(() => item('b'), 8000);
      press('Copy this board');
      await until(() => /graph: plan_copy · BOARD\n\(b:Sticky/.test(page.file()), 8000);
      await until(() => list().querySelector('summary').textContent === 'Boards: plan_copy, 4 of 4', 8000);

      press('Remove this board');
      assert.match(page.file(), /plan_copy/, 'removing asks first');
      press('Yes, remove it');
      await until(() => !/plan_copy/.test(page.file()), 8000);
      await until(() => list().querySelector('summary').textContent === 'Boards: later, 3 of 3', 8000);
      assert.match(page.file(), /Go by train/, 'the other boards are untouched');
      assert.match(page.file(), /Book it/);
    } finally {
      await page.stop();
    }
  });
});
