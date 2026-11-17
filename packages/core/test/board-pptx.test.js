// A PowerPoint deck brought onto a board, a frame to a slide (ES§45 board_exchange). The decks are made by
// pptx-fixture.js. The block it writes is read back with the board's own reader.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { deckBoard, isPresentationPlace, pptxBlock, pptxBoard } from '../src/board-pptx.ts';
import { slidesOf } from '../src/board-slides.ts';
import { PNG, deck, frame, pic, sp } from './pptx-fixture.js';

const DECK = deck([
  {
    shapes: [
      sp({ ph: { type: 'title' }, paras: ['Plan'] }),
      sp({
        ph: { idx: '1' },
        paras: [
          'First',
          { runs: ['Deeper'], lvl: 1 },
          { runs: ['One'], bullet: 'num' },
          { runs: ['Two'], bullet: 'num' },
        ],
      }),
      pic({ embed: 'rId5', at: [700, 200, 400, 300], alt: 'The logo' }),
      sp({ geom: 'ellipse', at: [10, 600, 100, 80], fill: true, paras: ['Round'] }),
    ],
    notes: ['Say hello', 'Then wait'],
    media: { rId5: ['logo.png', PNG] },
  },
  {
    shapes: [
      sp({ ph: { type: 'title' }, paras: ['Costs'] }),
      frame({
        rows: [
          ['Item', 'Cost'],
          ['Rent', '12'],
        ],
        at: [50, 150, 400, 200],
      }),
    ],
    hidden: true,
  },
  {
    shapes: [pic({ embed: 'rId5', at: [0, 0, 50, 50] }), sp({ ph: { type: 'subTitle', idx: '9' }, paras: ['Loose'] })],
    media: { rId5: ['logo.png', PNG] },
  },
  { shapes: [frame({ uri: 'http://schemas.openxmlformats.org/drawingml/2006/chart' })] },
]);

describe('board_pptx', () => {
  test('each slide is a frame as large as the slide, titled and numbered, in rows of three', () => {
    const made = pptxBoard(DECK, 'talk', 'Talks/My Deck.pptx');
    const frames = made.board.items.filter((i) => i.kind === 'Frame');
    assert.deepEqual(
      frames.map((f) => [f.id, f.text, f.x, f.y, f.w, f.h, f.more.slide]),
      [
        ['s1', 'Plan', 0, 0, 1280, 720, 1],
        ['s2', 'Costs', 1400, 0, 1280, 720, 0],
        ['s3', 'Slide 3', 2800, 0, 1280, 720, 2],
        ['s4', 'Slide 4', 0, 1060, 1280, 720, 3],
      ],
    );
  });

  test('text, shapes, tables and pictures stand where the slide had them, inside their frame', () => {
    const items = pptxBoard(DECK, 'talk', 'Talks/My Deck.pptx').board.items;
    const at = (id) => items.find((i) => i.id === id);
    assert.deepEqual([at('s1_1').kind, at('s1_1').text, at('s1_1').x, at('s1_1').y], ['Text', 'Plan', 60, 30]);
    assert.equal(at('s1_2').text, '- First\n  - Deeper\n1. One\n2. Two');
    assert.deepEqual(
      [at('s1_3').kind, at('s1_3').more, at('s1_3').x, at('s1_3').y, at('s1_3').w],
      ['Image', { src: 'My-Deck-1.png', alt: 'The logo' }, 700, 200, 400],
    );
    assert.deepEqual([at('s1_4').kind, at('s1_4').more, at('s1_4').text], ['Shape', { shape: 'ellipse' }, 'Round']);
    assert.equal(at('s2_2').text, 'Item | Cost\nRent | 12');
    // a hidden slide keeps its place; its items stand in its own frame
    assert.deepEqual([at('s2_2').x, at('s2_2').y], [1450, 150]);
  });

  test('a shape with no place is stacked inside its frame, and a picture used twice is kept once', () => {
    const made = pptxBoard(DECK, 'talk', 'Talks/My Deck.pptx');
    const loose = made.board.items.find((i) => i.text === 'Loose');
    assert.ok(loose.x >= 2800 && loose.x + loose.w <= 2800 + 1280 && loose.y >= 0 && loose.y + loose.h <= 720);
    assert.deepEqual(
      made.pictures.map((p) => [p.name, p.ending, p.bytes.length]),
      [['My-Deck-1.png', 'png', 11]],
    );
    assert.equal(
      made.board.items.filter((i) => i.kind === 'Image').every((i) => i.more.src === 'My-Deck-1.png'),
      true,
    );
  });

  test('speaker notes are a card under their slide, and a slide with none has no card', () => {
    const items = pptxBoard(DECK, 'talk', 'x.pptx').board.items;
    const notes = items.filter((i) => i.id.endsWith('_notes'));
    assert.deepEqual(
      notes.map((n) => [n.id, n.kind, n.text, n.more.body, n.x, n.y]),
      [['s1_notes', 'Card', 'Speaker notes, slide 1', 'Say hello\nThen wait', 0, 744]],
    );
  });

  test('what is left out is said in sentences, always with the look that is not kept', () => {
    const made = pptxBoard(DECK, 'talk', 'x.pptx');
    assert.equal(made.notes[0], 'Left out: 1 chart.');
    assert.match(made.notes[1], /Colours, fonts, backgrounds/);
    assert.equal(
      pptxBoard(deck([{ shapes: [sp({ ph: { type: 'title' }, paras: ['T'] })] }]), 'a', 'a.pptx').notes.length,
      1,
    );
  });

  test('the block reads back with no problem, links kept pictures, and the slides play in the deck order', () => {
    const made = pptxBoard(DECK, 'talk', 'Talks/My Deck.pptx');
    const done = pptxBlock(made, new Map([['My-Deck-1.png', 'attachments/My-Deck-1.png']]));
    const text = done.block.replace(/^```gql\n/, '').replace(/\n```$/, '');
    const { board, problems } = readBoard(text);
    assert.deepEqual(problems, []);
    assert.equal(board.name, 'talk');
    assert.deepEqual(
      board.items.filter((i) => i.kind === 'Image').map((i) => i.more.src),
      ['attachments/My-Deck-1.png', 'attachments/My-Deck-1.png'],
    );
    assert.deepEqual(
      slidesOf(board).map((f) => f.text),
      ['Plan', 'Slide 3', 'Slide 4'],
    );
    assert.equal(board.items.find((i) => i.id === 's1_2').text, '- First\n  - Deeper\n1. One\n2. Two');
    assert.equal(board.items.find((i) => i.id === 's1_notes').more.body, 'Say hello\nThen wait');
  });

  test('a picture the host could not keep is left out of the block, and the sentences say how many', () => {
    const made = pptxBoard(DECK, 'talk', 'x.pptx');
    const done = pptxBlock(made, new Map());
    assert.equal(
      readBoard(done.block.replace(/^```gql\n/, '').replace(/\n```$/, '')).board.items.some((i) => i.kind === 'Image'),
      false,
    );
    assert.equal(done.notes[0], 'Left out: 2 pictures that could not be saved.');
  });

  test('a graph name that is no name, and a file that is no deck, are refused in words', () => {
    assert.match(pptxBoard(DECK, '1 bad', 'x.pptx').refused, /bad/);
    assert.match(pptxBoard(new Uint8Array([1, 2]), 'ok', 'x.pptx').refused, /not a PowerPoint/);
    assert.equal(
      deckBoard({ size: { w: 1, h: 1 }, slides: [], pictures: new Map(), left: {} }, 'ok', 'x.pptx').board.items.length,
      0,
    );
  });

  test('a presentation is told by its ending', () => {
    assert.deepEqual(['a.pptx', 'A.PPTX', 'a.ppt', 'a.pptx.md', 'a.docx'].map(isPresentationPlace), [
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});
