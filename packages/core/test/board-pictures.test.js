// The boards of a note as pictures (editor spec ES§45, board_exchange). Each board is drawn whole, in fixed colours.
// As a PNG or a PDF page it is drawn at twice its natural size, within what a canvas holds.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boardPicturesOf, pictureSize } from '../src/board-pictures.ts';

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
});
