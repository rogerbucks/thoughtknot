// The slides of a board (editor spec ES§45, board_slides). Each frame is a slide. They play in reading order until
// the person orders them, and a frame can be left out. The view that shows a slide fills the screen with it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { slideAt, slidePlace, slideSaid, slidesOf } from '../src/board-slides.ts';
import { boardFrame, itemBox } from '../src/board-svg.ts';

const TEXT = `// graph: talk · BOARD
(end:Frame {x: 0, y: 700, w: 800, h: 600, text: 'Thanks'}),
(intro:Frame {x: 0, y: 0, w: 800, h: 600, text: 'Why trains'}),
(plan:Frame {x: 900, y: 0, w: 800, h: 600}),
(a:Sticky {x: 40, y: 40, text: 'Go by train'})`;

const ids = (text) => slidesOf(readBoard(text).board).map((s) => s.id);
const edit = (text, change) => {
  const r = boardEdit(text, change);
  assert.ok('text' in r, `refused: ${r.refused}`);
  return r.text;
};

describe('the slides of a board', () => {
  // proves: board_slides
  test('are its frames, in reading order until the person orders them; other items are not slides', () => {
    assert.deepEqual(ids(TEXT), ['intro', 'plan', 'end']);
  });

  // proves: board_slides
  test('say where each is in the show, with the frame’s title when it has one', () => {
    const slides = slidesOf(readBoard(TEXT).board);
    assert.equal(slideSaid(slides, 0), 'Slide 1 of 3: Why trains');
    assert.equal(slideSaid(slides, 1), 'Slide 2 of 3');
  });

  // proves: board_slides
  test('step a slide later or earlier by numbering the frames, moving nothing on the board', () => {
    const text = edit(TEXT, { kind: 'slide-step', id: 'intro', by: 1 });
    assert.deepEqual(ids(text), ['plan', 'intro', 'end']);
    assert.ok(text.includes("(intro:Frame {x: 0, y: 0, w: 800, h: 600, text: 'Why trains', slide: 2})"));
    assert.ok(text.includes("(a:Sticky {x: 40, y: 40, text: 'Go by train'})"), 'nothing else is written again');
    assert.deepEqual(ids(edit(text, { kind: 'slide-step', id: 'end', by: -1 })), ['plan', 'end', 'intro']);
    assert.ok('refused' in boardEdit(TEXT, { kind: 'slide-step', id: 'intro', by: -1 }), 'first goes no earlier');
    assert.ok('refused' in boardEdit(TEXT, { kind: 'slide-step', id: 'end', by: 1 }), 'last goes no later');
    assert.ok('refused' in boardEdit(TEXT, { kind: 'slide-step', id: 'a', by: 1 }), 'a sticky is not a slide');
  });

  // proves: board_slides
  test('leave a frame out of the show and put it back, by its own line alone', () => {
    const out = edit(TEXT, { kind: 'slide-skip', id: 'plan', skip: true });
    assert.equal(
      out,
      TEXT.replace(
        '(plan:Frame {x: 900, y: 0, w: 800, h: 600})',
        '(plan:Frame {x: 900, y: 0, w: 800, h: 600, slide: 0})',
      ),
    );
    assert.deepEqual(ids(out), ['intro', 'end']);
    assert.equal(edit(out, { kind: 'slide-skip', id: 'plan', skip: false }), TEXT);
    const ordered = edit(out, { kind: 'slide-step', id: 'end', by: -1 });
    assert.deepEqual(ids(edit(ordered, { kind: 'slide-skip', id: 'plan', skip: false })), ['end', 'intro', 'plan']);
  });

  // proves: board_slides
  test('leave out the frames of a hidden layer', () => {
    const text = TEXT.replace(
      '// graph: talk · BOARD',
      "// graph: talk · BOARD\n(l:Layer {name: 'Draft', order: 1, hidden: true}),",
    ).replace("text: 'Thanks'}", "text: 'Thanks', in_layer: 'l'}");
    assert.deepEqual(ids(text), ['intro', 'plan']);
  });

  // proves: board_slides
  test('show a slide whole and centred, as large as fits the screen', () => {
    const board = readBoard(TEXT).board;
    const frame = boardFrame(board);
    const box = itemBox(board.items.find((i) => i.id === 'plan'));
    const screen = { width: 1600, height: 900 };
    const at = slidePlace(box, frame, screen);
    const left = at.x + (box.x - frame.x) * at.scale;
    const top = at.y + (box.y - frame.y) * at.scale;
    assert.ok(left >= 0 && top >= 0, 'inside the screen');
    assert.ok(left + box.w * at.scale <= screen.width && top + box.h * at.scale <= screen.height);
    assert.ok(Math.abs(left + (box.w * at.scale) / 2 - screen.width / 2) < 1e-6, 'centred across');
    assert.ok(Math.abs(top + (box.h * at.scale) / 2 - screen.height / 2) < 1e-6, 'centred down');
    assert.ok(box.h * at.scale > screen.height * 0.9, 'fills the shorter side but for a little room');
  });

  // proves: board_slides
  test('start the show from the slide the person is looking at, else from the first', () => {
    const slides = slidesOf(readBoard(TEXT).board);
    assert.equal(slideAt(slides, [1000, 100]), 1);
    assert.equal(slideAt(slides, [5000, 5000]), 0);
  });
});
