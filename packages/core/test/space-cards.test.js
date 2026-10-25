// Things as cards in the 3D view (editor spec §53, space_cards): space-cards.ts. Each thing is a card flat to the
// screen, with its whole name inside. Far ones come first, a click picks the nearest, and arrowheads sit at card edges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardArrows, cardAt, cardsOnScreen, frameOf, rowsOf } from '../src/space-cards.ts';
import { spreadSpace } from '../src/space-spread.ts';
import { orbitFit, spaceMatrix } from '../src/space-view.ts';

const LONG = 'Data warehouse and reporting suite for the whole company';
/** Two things in a row and a link from the first to the second, as the 2D drawing marks them. */
const MARKS = [
  { id: 't:a', kind: 'box', style: 'thing', of: 'a', x: 0, y: 0, width: 130, height: 50 },
  { id: 'l:a', kind: 'label', style: 'thing', of: 'a', x: 65, y: 25, text: LONG, size: 14, anchor: 'middle' },
  { id: 't:b', kind: 'box', style: 'thing', of: 'b', x: 300, y: 0, width: 90, height: 40 },
  { id: 'l:b', kind: 'label', style: 'thing', of: 'b', x: 345, y: 20, text: 'Billing', size: 14, anchor: 'middle' },
  { id: 'e:ab', kind: 'link', style: 'link', from: 'a', to: 'b', name: 'FEEDS', points: [] },
];
const W = 800,
  H = 600;
const seen = () => {
  const { space } = spreadSpace(MARKS, undefined, true);
  const orbit = orbitFit(space, W / H);
  return { space, matrix: spaceMatrix(orbit, W / H, orbit.distance * 4) };
};

test('words are cut into rows at their spaces, a long word a row of its own', () => {
  assert.deepEqual(rowsOf('Identity and access management', 14), ['Identity and', 'access', 'management']);
  assert.deepEqual(rowsOf('Supercalifragilistic word', 8), ['Supercalifragilistic', 'word']);
  assert.deepEqual(rowsOf('  ', 8), []);
});

test('laid out as cards, each thing keeps its box size and its links run to its middle', () => {
  const { space } = spreadSpace(MARKS, undefined, true);
  assert.equal(space.cards, true);
  const a = space.blocks.find((b) => b.of === 'a');
  assert.deepEqual(a.card, { width: 130, height: 50 });
  assert.equal(spreadSpace(MARKS).space.cards, undefined, 'balls by default here');
});

test('each card holds the whole name, wrapped to fit, and the picked card is marked', () => {
  const { space, matrix } = seen();
  const cards = cardsOnScreen(space, matrix, W, H, 'a');
  const a = cards.find((c) => c.block.of === 'a'),
    b = cards.find((c) => c.block.of === 'b');
  assert.equal(a.rows.join(' '), LONG, 'nothing of the name is lost');
  assert.ok(a.rows.length > 1, 'a long name wraps');
  assert.ok(a.picked && !b.picked);
  assert.ok(a.width >= Math.max(...a.rows.map((r) => r.length)) * a.size * 0.5, 'the card is wide enough');
  assert.ok(a.height >= a.rows.length * a.size, 'and tall enough');
  assert.equal(cards.at(-1), a, 'the picked card is painted last, over the rest');
  const rest = cardsOnScreen(space, matrix, W, H);
  for (let i = 1; i < rest.length; i++) assert.ok(rest[i - 1].far >= rest[i].far, 'far ones first');
});

test('far off, a card still shows its name where that covers no nearer name, else it is plain', () => {
  // the two things far apart, so seen whole their words are too small to be painted whatever they cover
  const { space } = spreadSpace(MARKS, undefined, true);
  const apart = { ...space, blocks: space.blocks.map((b, i) => ({ ...b, x: i ? 3000 : -3000, y: 0 })) };
  apart.least = [-3100, -100, 0];
  apart.most = [3100, 100, 100];
  const orbit = orbitFit(apart, W / H);
  const matrix = spaceMatrix(orbit, W / H, orbit.distance * 4);
  const both = cardsOnScreen(apart, matrix, W, H);
  assert.deepEqual(both.map((c) => c.rows.join(' ')).sort(), ['Billing', LONG].sort(), 'both show their names');
  assert.ok(
    both.every((c) => c.size >= 11),
    'at a size that can be read',
  );
  // the same two things one before the other: only the nearer one is named
  const stacked = { ...apart, blocks: apart.blocks.map((b, i) => ({ ...b, x: 0, floor: b.floor + i * 5 })) };
  const named = cardsOnScreen(stacked, matrix, W, H).filter((c) => c.rows.length);
  assert.equal(named.length, 1, 'one name, never one over another');
});

test('a click picks the nearest card under it', () => {
  const near = { block: { id: 'near' }, x: 100, y: 100, width: 80, height: 40, far: 10, rows: [], size: 11 },
    far = { ...near, block: { id: 'far' }, far: 50 };
  assert.equal(cardAt([far, near], 110, 105)?.block.id, 'near');
  assert.equal(cardAt([far, near], 300, 300), undefined);
});

test("each arrowhead's tip is on the edge of the card it points to", () => {
  const { space, matrix } = seen();
  const cards = cardsOnScreen(space, matrix, W, H);
  const [arrow] = cardArrows(space, matrix, W, H, cards);
  const b = cards.find((c) => c.block.of === 'b');
  const dx = Math.abs(arrow.tip.x - b.x) - b.width / 2,
    dy = Math.abs(arrow.tip.y - b.y) - b.height / 2;
  assert.ok(Math.abs(Math.max(dx, dy)) < 0.5, `the tip is ${dx.toFixed(1)}, ${dy.toFixed(1)} off the edge`);
});

test('with cards the graphics chip paints only the lines, and only link words float', () => {
  const { space, matrix } = seen();
  const frame = frameOf(space, matrix, W, H, null);
  assert.deepEqual(frame.shapes.blocks, []);
  assert.equal(frame.shapes.lines.length, 1);
  assert.deepEqual(
    frame.labels.map((l) => l.text),
    ['FEEDS'],
  );
  assert.equal(frame.ring, null);
  const balls = spreadSpace(MARKS).space;
  assert.equal(frameOf(balls, matrix, W, H, null).shapes, balls, 'balls are painted as before');
});

// proves: select_links_stronger
test("the picked thing's links, and only those, are drawn a little thicker in 3D", () => {
  const marks = [
    ...MARKS,
    { id: 't:c', kind: 'box', style: 'thing', of: 'c', x: 600, y: 0, width: 90, height: 40 },
    { id: 'e:bc', kind: 'link', style: 'link', from: 'b', to: 'c', points: [] },
  ];
  for (const cards of [true, false]) {
    const { space } = spreadSpace(marks, undefined, cards);
    const orbit = orbitFit(space, W / H);
    const matrix = spaceMatrix(orbit, W / H, orbit.distance * 4);
    const a = space.blocks.find((b) => b.of === 'a');
    assert.deepEqual(frameOf(space, matrix, W, H, null).strong, [], 'nothing picked, nothing thicker');
    const strong = frameOf(space, matrix, W, H, a).strong;
    assert.equal(strong.length, 1, "only a's link");
    assert.ok(strong[0].points.length >= 2, 'drawn along its line on the screen');
    assert.equal(frameOf(space, matrix, W, H, null, 'e:bc').strong.length, 1, 'a link picked is thicker too');
  }
});

// proves: space_link_shafts
test('every link is drawn as a solid line, bolder near, with a wide arrowhead never longer than its card', () => {
  const marks = [
    ...MARKS,
    { id: 't:c', kind: 'box', style: 'thing', of: 'c', x: 600, y: 0, width: 90, height: 40 },
    { id: 'e:bc', kind: 'link', style: 'link', from: 'b', to: 'c', points: [] },
  ];
  for (const cards of [true, false]) {
    const { space } = spreadSpace(marks, undefined, cards);
    const orbit = orbitFit(space, W / H);
    const near = spaceMatrix(orbit, W / H, orbit.distance * 4),
      far = spaceMatrix({ ...orbit, distance: orbit.distance * 6 }, W / H, orbit.distance * 24);
    const frame = frameOf(space, near, W, H, null);
    assert.equal(frame.shafts.length, 2, 'each link');
    for (const s of frame.shafts) {
      assert.ok(s.points.length >= 2);
      assert.ok(s.width >= 1.5, `never a hairline: ${s.width}`);
    }
    const thin = frameOf(space, far, W, H, null).shafts;
    assert.ok(thin[0].width < frame.shafts[0].width, 'a far link is thinner than a near one');
    for (const a of frame.arrows) {
      const long = Math.hypot(a.tip.x - (a.left.x + a.right.x) / 2, a.tip.y - (a.left.y + a.right.y) / 2),
        wide = Math.hypot(a.left.x - a.right.x, a.left.y - a.right.y);
      assert.ok(wide >= 0.75 * long, `a bold head: ${wide.toFixed(1)} wide, ${long.toFixed(1)} long`);
      if (!cards) continue;
      const to = frame.cards.find((c) => c.block.of === 'b' || c.block.of === 'c');
      assert.ok(long <= Math.max(11, to.height * 0.8) + 0.01, `${long} no longer than its card`);
    }
  }
});

// proves: space_link_shafts
test('in 2D too, a link is a solid line with a bold, sharp arrowhead, under the focus rules', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');
  const width = (sel) => Number(new RegExp(`${sel}\\s*\\{[^}]*stroke-width:\\s*([\\d.]+)`).exec(css)?.[1]);
  assert.ok(width(String.raw`g\.edge > :where\(path:not\(\[stroke-width\]\)\)`) >= 1.5, 'a link is no hairline');
  assert.ok(width(String.raw`g\.edge > :where\(polygon:not\(\[stroke-width\]\)\)`) >= 2, 'its arrowhead bolder');
  // :where weighs nothing, so a selected, kept or faded link still shows as the focus rules say
  assert.ok(css.indexOf(':where(path:not([stroke-width]))') < css.indexOf('g.is-selected > :is(path, polygon)'));
});
