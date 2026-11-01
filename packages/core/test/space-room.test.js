// Room for things a view drew, as they are lifted into space (editor spec §53, space_room_as_drawn): space-room.ts.
// A view's things are kept where it put them, but spread apart evenly until most stand clear. Its shape is kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardRoom, roomyScale } from '../src/space-room.ts';
import { spreadSpace } from '../src/space-spread.ts';

/** A small dot of a view for thing `key` at (`x`, `y`), as a force view draws one, with its name. */
const dot = (key, x, y) => [
  { id: `t:${key}`, kind: 'box', style: 'svg.0', of: key, x: x - 3, y: y - 3, width: 6, height: 6 },
  {
    id: `l:${key}`,
    kind: 'label',
    style: 'svg.0',
    of: key,
    x,
    y,
    text: `Thing ${key} of a long name`,
    size: 6,
    anchor: 'middle',
  },
];
/** Six dots on a ring 40 pixels across, and a link round it. */
const ring = () => {
  const marks = [];
  for (let i = 0; i < 6; i++) marks.push(...dot('k' + i, 20 * Math.cos(i), 20 * Math.sin(i)));
  for (let i = 0; i < 6; i++)
    marks.push({
      id: 'e' + i,
      kind: 'link',
      style: 'link',
      points: [
        [0, 0],
        [1, 1],
      ],
      from: 'k' + i,
      to: 'k' + ((i + 1) % 6),
    });
  return marks;
};
/** Whether two cards, each `w` by `h` round its middle, overlap. */
const overlap = (a, b, w, h) => Math.abs(a[0] - b[0]) < w && Math.abs(a[1] - b[1]) < h;

test('a card holds its name, and things already clear spread no further', () => {
  const [w, h] = cardRoom('Thing 38 of a long name', 6, 6);
  assert.ok(w > 80 && h > 30, `the card is ${w} by ${h}`);
  assert.equal(
    roomyScale(
      [
        [0, 0],
        [500, 0],
      ],
      [
        [100, 40],
        [100, 40],
      ],
    ),
    1,
  );
  assert.equal(
    roomyScale(
      [
        [0, 0],
        [0, 0],
      ],
      [
        [100, 40],
        [100, 40],
      ],
    ),
    1,
    'two at one spot',
  );
});

test("a view's things, piled as cards in space, are spread until they stand clear, its shape kept", () => {
  const { space } = spreadSpace(ring(), undefined, true, true);
  const mids = space.blocks.map((b) => [b.x + b.width / 2, b.y + b.depth / 2]);
  const [w, h] = cardRoom('Thing k0 of a long name', 6, 6);
  let piled = 0;
  for (let i = 0; i < mids.length; i++)
    for (let j = i + 1; j < mids.length; j++) if (overlap(mids[i], mids[j], w, h)) piled++;
  assert.ok(piled <= 1, `${piled} pairs of cards overlap`);
  // the ring is still a ring: each is as far from the middle as the others
  const mx = mids.reduce((t, m) => t + m[0], 0) / 6,
    my = mids.reduce((t, m) => t + m[1], 0) / 6;
  const reach = mids.map((m) => Math.hypot(m[0] - mx, m[1] - my));
  assert.ok(Math.max(...reach) / Math.min(...reach) < 1.3, 'the ring keeps its shape');
});

test('balls are spread by their own size, and a network laid out afresh is left to its own spacing', () => {
  const { space } = spreadSpace(ring(), undefined, false, true);
  const xs = space.blocks.map((b) => b.x + b.width / 2);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 40, 'balls bigger than the dots spread out');
});
