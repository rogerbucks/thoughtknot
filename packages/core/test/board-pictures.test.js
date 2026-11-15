// The boards of a note as pictures (editor spec ES§45, board_exchange). Each board is drawn whole, in fixed colours.
// As a PNG or a PDF page it is drawn at twice its natural size, within what a canvas holds.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boardPicturesOf, pictureSize, slidePicturesOf } from '../src/board-pictures.ts';

const NOTE = `# Trip

\`\`\`gql
// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'Go by train'}),
(b:Card {x: 900, y: 500, w: 200, h: 100, text: 'Far <away> & back'}),
(a)-[:CONNECTS {label: 'then'}]->(b)
\`\`\`

\`\`\`gql
// graph: plan · BOARD
(t:Text {x: 0, y: 0, text: 'Book'})
\`\`\`
`;

describe('board_pictures', () => {
  // proves: board_exchange
  test('each board of a note is drawn whole as an SVG that stands on its own', () => {
    const [ideas, plan] = boardPicturesOf(NOTE, 'light');
    assert.equal(ideas.name, 'ideas');
    assert.equal(plan.name, 'plan');
    assert.match(ideas.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="/);
    for (const said of ['Go by train', 'Far &lt;away&gt; &amp; back', 'then'])
      assert.ok(ideas.svg.includes(said), `${said} is drawn`);
    const [, , w, h] = /viewBox="([^" ]+) ([^" ]+) ([^" ]+) ([^" ]+)"/.exec(ideas.svg).slice(1).map(Number);
    assert.deepEqual([ideas.width, ideas.height], [w, h], 'its size is the whole board');
    assert.ok(w >= 1100 && h >= 600, 'the far card is inside the picture');
    assert.deepEqual(boardPicturesOf('# No board\n', 'light'), []);
  });

  // proves: board_exchange
  test('its colours are fixed by the theme asked for, never taken from the page it is opened on', () => {
    const [light] = boardPicturesOf(NOTE, 'light');
    const [dark] = boardPicturesOf(NOTE, 'dark');
    assert.notEqual(light.svg, dark.svg);
    assert.match(light.svg, /style="background:/);
    assert.doesNotMatch(light.svg, /var\(--/, 'no colour is left to the page');
    assert.doesNotMatch(dark.svg, /var\(--/);
  });

  // proves: board_exchange
  test('a picture is drawn at twice its size, or less when a canvas could not hold it', () => {
    assert.deepEqual(pictureSize(400, 200, 16_777_216), { width: 800, height: 400 });
    const big = pictureSize(8000, 4000, 16_777_216);
    assert.ok(big.width * big.height <= 16_777_216);
    assert.ok(Math.abs(big.width / big.height - 2) < 0.01, 'its shape is kept');
    assert.deepEqual(pictureSize(0, 0, 100), { width: 1, height: 1 });
  });

  // proves: board_slides
  test('each slide is a picture of what its frame holds, in the order the show plays them', () => {
    const deck = `\`\`\`gql
// graph: deck · BOARD
(notes:Layer {name: 'Notes', order: 1, hidden: true}),
(two:Frame {x: 0, y: 0, w: 400, h: 300, text: 'Second', slide: 2}),
(one:Frame {x: 1000, y: 0, w: 400, h: 300, text: 'First', slide: 1}),
(out:Frame {x: 2000, y: 0, w: 400, h: 300, text: 'Left out', slide: 0}),
(a:Sticky {x: 50, y: 50, text: 'On the second'}),
(b:Sticky {x: 1050, y: 50, text: 'On the first'}),
(c:Sticky {x: 1050, y: 150, text: 'A hidden note', in_layer: 'notes'})
\`\`\`
`;
    const [first, second, ...more] = slidePicturesOf(NOTE + deck, 'light');
    assert.deepEqual(more, [], 'a frame left out is no slide, and a board with no frame gives none');
    assert.deepEqual([first.name, second.name], ['deck 1', 'deck 2']);
    assert.deepEqual([first.width, first.height], [400, 300], 'a slide is the size of its frame');
    assert.match(first.svg, /viewBox="1000 0 400 300"/);
    assert.ok(first.svg.includes('On the first') && !first.svg.includes('On the second'));
    assert.ok(second.svg.includes('On the second') && !second.svg.includes('On the first'));
    assert.ok(!first.svg.includes('A hidden note'), 'a hidden layer is not drawn');
    assert.doesNotMatch(first.svg, /var\(--/, 'no colour is left to the page');
  });
});
