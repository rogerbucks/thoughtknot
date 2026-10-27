// Things as cards in the 3D view (editor spec §53, space_cards): space-cards.ts. Each thing is a card flat to the
// screen, with its whole name inside. Far ones come first, a click picks the nearest, and arrowheads sit at card edges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ZOOM_OPENS,
  cardArrows,
  cardAt,
  cardsOnScreen,
  clusterFilling,
  fills,
  frameOf,
  isCluster,
  rowsOf,
} from '../src/space-cards.ts';
import { spreadSpace } from '../src/space-spread.ts';
import { OUTLINE_FOLD, outlinesOf, stripTap } from '../src/space-outlines.ts';
import { spotsKept } from '../src/space-parts.ts';
import { middleOf, orbitFit, spaceMatrix } from '../src/space-view.ts';

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

// proves: cluster_named_everywhere
test('a folded group is a named card with its count even among balls, never a nameless ball', () => {
  const marks = [
    ...MARKS,
    { id: 't:group: 1', kind: 'box', style: 'muted', of: 'group: 1', x: 0, y: 200, width: 220, height: 60 },
    {
      id: 'l:group: 1',
      kind: 'label',
      style: 'muted',
      of: 'group: 1',
      x: 110,
      y: 230,
      text: 'Identity · 8 things',
      size: 14,
      anchor: 'middle',
    },
    { id: 'e:a1', kind: 'link', style: 'link', from: 'a', to: 'group: 1', points: [] },
  ];
  assert.ok(isCluster('fold_group_2'), 'the drawing on screen names a folded group by its id');
  assert.ok(!isCluster('group: x') && !isCluster('a'));
  const { space } = spreadSpace(marks);
  const group = space.blocks.find((b) => b.of === 'group: 1');
  assert.deepEqual(group.card, { width: 220, height: 60 });
  assert.equal(space.blocks.find((b) => b.of === 'a').card, undefined, 'a thing stays a ball');
  const orbit = orbitFit(space, W / H);
  const frame = frameOf(space, spaceMatrix(orbit, W / H, orbit.distance * 4), W, H, null);
  assert.deepEqual(
    frame.cards.map((c) => c.block.of),
    ['group: 1'],
  );
  assert.match(frame.cards[0].rows.join(' '), /Identity · 8 things/);
  assert.ok(!frame.shapes.blocks.some((b) => isCluster(b.of)), 'no ball is painted for the group');
  assert.equal(frame.arrows.length, 2, 'one arrowhead into the ball, one at the edge of the group card');
});

// proves: cluster_named_everywhere
test('an open group is outlined round its things, its name on the outline, as cards and as balls', () => {
  const marks = [
    { id: 'g:team', kind: 'group', style: 'group', x: -10, y: -10, width: 420, height: 80, name: 'Team' },
    ...MARKS.map((m) => (m.kind === 'box' ? { ...m, group: 'g:team' } : m)),
    { id: 't:c', kind: 'box', style: 'thing', of: 'c', x: 0, y: 300, width: 90, height: 40 },
    { id: 'e:bc', kind: 'link', style: 'link', from: 'b', to: 'c', points: [] },
  ];
  for (const cards of [true, false]) {
    const { space } = spreadSpace(marks, undefined, cards);
    const orbit = orbitFit(space, W / H);
    const frame = frameOf(space, spaceMatrix(orbit, W / H, orbit.distance * 4), W, H, null);
    assert.equal(frame.outlines.length, 1, cards ? 'cards' : 'balls');
    const [o] = frame.outlines;
    assert.equal(o.name, 'Team');
    assert.equal(o.style, 'group');
    const inside = (k) => {
      const c = cardsOnScreen(space, spaceMatrix(orbit, W / H, orbit.distance * 4), W, H).find((x) => x.block.of === k);
      return c.x > o.x && c.x < o.x + o.width && c.y > o.y && c.y < o.y + o.height;
    };
    assert.ok(inside('a') && inside('b'), 'its things sit inside it');
    assert.ok(!inside('c'), 'a thing in no group sits outside it');
    assert.ok(!frame.labels.some((l) => l.text === 'Team'), 'its name is on the outline, not floating twice');
  }
});

// proves: cluster_opens
test('zooming in on a folded group until its card fills the screen opens it; seen whole, it stays folded', () => {
  assert.ok(fills({ width: W * ZOOM_OPENS, height: 10 }, W, H) && fills({ width: 10, height: H }, W, H));
  assert.ok(!fills({ width: W * ZOOM_OPENS - 1, height: H * ZOOM_OPENS - 1 }, W, H));
  const marks = [
    ...MARKS,
    { id: 't:fold_group_1', kind: 'box', style: 'muted', of: 'fold_group_1', x: 0, y: 200, width: 220, height: 60 },
  ];
  const { space } = spreadSpace(marks);
  const whole = orbitFit(space, W / H);
  const at = (orbit) => {
    const m = spaceMatrix(orbit, W / H, orbit.distance * 4);
    const card = cardsOnScreen(space, m, W, H).find((c) => c.block.of === 'fold_group_1');
    return clusterFilling(space, m, W, H, card.x, card.y);
  };
  assert.equal(at(whole), undefined, 'the whole graph seen: the group stays folded');
  const group = space.blocks.find((b) => b.of === 'fold_group_1');
  assert.equal(at({ ...whole, target: middleOf(group), distance: whole.distance / 30 }), 'fold_group_1');
  assert.equal(clusterFilling(space, spaceMatrix(whole, W / H, whole.distance * 4), W, H, -50, -50), undefined);
});

/** Four things as cards: a and b in a group drawn open, which `folds` folds back when given; c and d outside it. */
const grouped = (folds) => [
  { id: 'g:1', kind: 'group', style: 'group', name: 'Makers', x: -10, y: -10, width: 300, height: 80, ...folds },
  ...['a', 'b', 'c', 'd'].map((k, i) => ({
    id: `t:${k}`,
    kind: 'box',
    style: 'thing',
    of: k,
    x: i * 140,
    y: 0,
    width: 100,
    height: 40,
    ...(i < 2 ? { group: 'g:1' } : {}),
  })),
  { id: 'e:ac', kind: 'link', style: 'link', from: 'a', to: 'c', points: [] },
  { id: 'e:bd', kind: 'link', style: 'link', from: 'b', to: 'd', points: [] },
];

// proves: cluster_fold_back
test('a tap on an opened group’s button folds it back; one on its name fits the view to its things', () => {
  const { space } = spreadSpace(grouped({ of: 'group:Makers' }), undefined, true);
  assert.equal(space.groups?.[0]?.folds, 'group:Makers', 'the group keeps the fold that folds it back');
  const matrix = spaceMatrix(orbitFit(space, W / H), W / H, 4000);
  const [o] = outlinesOf(space, matrix, W, H);
  assert.equal(o.folds, 'group:Makers');
  assert.deepEqual(stripTap(space, matrix, W, H, o.x + o.width - OUTLINE_FOLD / 2, o.y + 6), { folds: 'group:Makers' });
  const named = stripTap(space, matrix, W, H, o.x + 12, o.y + 6);
  assert.deepEqual(
    named.fit.blocks.map((b) => b.of),
    ['a', 'b'],
    'its name fits the view to its things only',
  );
  assert.equal(stripTap(space, matrix, W, H, o.x + 12, o.y + o.height / 2), undefined, 'inside it, no tap of its own');
  // a group open by the View menu, with no box to fold back to, has no button: its whole strip zooms to it
  const { space: open } = spreadSpace(grouped({}), undefined, true);
  const [all] = outlinesOf(open, matrix, W, H);
  assert.ok(!all.folds);
  assert.ok('fit' in stripTap(open, matrix, W, H, all.x + all.width - OUTLINE_FOLD / 2, all.y + 6));
});

// proves: cluster_in_place
test('laid out again, a group just opened starts where its box was, and one just folded at its things’ middle', () => {
  const kept = spotsKept(
    new Map([
      ['fold_group_1', [4, 5, 6]],
      ['c', [0, 0, 0]],
    ]),
    [['fold_group_1', ['a', 'b']]],
  );
  assert.deepEqual(kept.get('c'), [0, 0, 0], 'what was there stays');
  for (const k of ['a', 'b']) assert.ok(Math.hypot(...kept.get(k).map((v, i) => v - [4, 5, 6][i])) < 0.5, k);
  assert.notDeepEqual(kept.get('a'), kept.get('b'), 'no two start in one place');
  const folded = spotsKept(
    new Map([
      ['a', [0, 0, 0]],
      ['b', [2, 4, 0]],
    ]),
    [['fold_group_1', ['a', 'b']]],
  );
  assert.deepEqual(folded.get('fold_group_1'), [1, 2, 0]);
  // laid out from them, the things opened stay round where the box was, and the rest stay put
  const box = [
    { id: 't:fold_group_1', kind: 'box', style: 'thing', of: 'fold_group_1', x: 0, y: 0, width: 100, height: 40 },
  ];
  const toBox = (k) => ({ id: `e:${k}`, kind: 'link', style: 'link', from: 'fold_group_1', to: k, points: [] });
  const before = spreadSpace([...box, ...grouped({}).slice(3, 5), toBox('c'), toBox('d')]).spots;
  const after = spreadSpace(grouped({}), spotsKept(before, [['fold_group_1', ['a', 'b']]])).spots;
  const far = (p, q) => Math.hypot(...p.map((v, i) => v - q[i]));
  for (const k of ['a', 'b']) assert.ok(far(after.get(k), before.get('fold_group_1')) < 1.5, `${k} opens in place`);
  for (const k of ['c', 'd']) assert.ok(far(after.get(k), before.get(k)) < 1, `${k} stays put`);
});
