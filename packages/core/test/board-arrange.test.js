// A board's linked items arranged by a layout of the graph (editor spec ES§45, board_arranged_by_graph):
// - Only linked items that are not locked move, to where a layout puts their things, and one undo puts them back.
// - The middle of the moved items stays where it was, and the glide says where each went.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { arrangeBoard } from '../src/board-arrange.ts';
import { readBoard } from '../src/board.ts';
import { gqlBlocks } from '../src/blocks.ts';
import { layoutById } from '../src/layouts/layouts.ts';
import { fitOf, fittingLayout } from '../src/layouts/arrange-fit.ts';

const TEAM = `// graph: team
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(cat:Person {name: 'Cat'}),
(ann)-[:KNOWS]->(bob),
(bob)-[:KNOWS]->(cat)`;
const BOARD = `// graph: ideas · BOARD ON team
(a:Sticky {x: 0, y: 0, text: 'Ann', graph: 'ann'}),
(b:Sticky {x: 10, y: 10, text: 'Bob', graph: 'bob'}),
(c:Sticky {x: 20, y: 20, text: 'Cat', graph: 'cat', locked: true}),
(d:Sticky {x: 500, y: 500, text: 'Free note'})`;
const NOTE = `# Team\n\n\`\`\`gql\n${TEAM}\n\`\`\`\n\n\`\`\`gql\n${BOARD}\n\`\`\`\n`;
const force = layoutById('force', 2);
// the same board with the locked card well away, for what is about the arrangement alone
const FAR = NOTE.replace("x: 20, y: 20, text: 'Cat'", "x: 3000, y: 3000, text: 'Cat'");
const boardOf = (note) => readBoard(gqlBlocks(note).find((b) => b.text.includes('BOARD')).text).board;
const rows = (b) => b.items.map((i) => [i.id, i.x, i.y]);

describe('a board arranged by the graph', () => {
  // proves: board_arranged_by_graph
  test('linked items that are not locked move, the rest stay, and one undo puts all back', () => {
    const r = arrangeBoard(NOTE, 'ideas', force);
    assert.ok(!('refused' in r), r.refused);
    const after = boardOf(r.note);
    const by = Object.fromEntries(after.items.map((i) => [i.id, i]));
    assert.deepEqual([by.c.x, by.c.y], [20, 20], 'a locked item stays');
    assert.deepEqual([by.d.x, by.d.y], [500, 500], 'an item with no thing stays');
    assert.ok(by.a.x !== 0 || by.a.y !== 0 || by.b.x !== 10, 'a linked item moved');
    assert.deepEqual(r.glide.map((g) => g.id).sort(), ['a', 'b']);
    assert.deepEqual(rows(boardOf(r.undo)), rows(boardOf(NOTE)), 'undo is the note as it was');
    assert.equal(r.undo, NOTE);
  });

  test('the moved items keep their middle, and stand apart', () => {
    const r = arrangeBoard(FAR, 'ideas', force);
    const [a, b] = r.glide;
    const mid = (k) => (a.to[k] + b.to[k]) / 2;
    assert.ok(Math.abs(mid(0) - 5) <= 1 && Math.abs(mid(1) - 5) <= 1, 'the middle of 0,0 and 10,10');
    assert.ok(Math.hypot(a.to[0] - b.to[0], a.to[1] - b.to[1]) >= 190, 'a note is not drawn over another');
  });

  test('the same arrangement twice gives the same places, and nothing moves a second time', () => {
    const once = arrangeBoard(FAR, 'ideas', force);
    assert.equal(arrangeBoard(FAR, 'ideas', force).note, once.note);
    const twice = arrangeBoard(once.note, 'ideas', force);
    assert.ok('refused' in twice, 'already as arranged');
  });

  test('a board that is not there, not on a graph, or with no linked item is refused in words', () => {
    assert.match(arrangeBoard(NOTE, 'nope', force).refused, /no board nope/);
    const free = NOTE.replace(' ON team', '');
    assert.match(arrangeBoard(free, 'ideas', force).refused, /not on a graph/);
    const bare = NOTE.replace(/, graph: '\w+'/g, '');
    assert.match(arrangeBoard(bare, 'ideas', force).refused, /No item/);
  });
});

const shapeOf = (keys, links) => ({
  things: keys.map((key) => ({ key, text: key, kinds: [] })),
  links: links.map(([from, to]) => ({ from, type: 'KNOWS', to })),
});

describe('the arrangement that fits the links', () => {
  // proves: board_arranged_by_graph
  test('is a grid with no links, a tree for parents and children, a flow where paths join, a cluster for a loop', () => {
    assert.equal(fitOf(shapeOf(['a', 'b', 'c'], [])), 'grid');
    assert.equal(
      fitOf(
        shapeOf(
          ['a', 'b', 'c'],
          [
            ['a', 'b'],
            ['a', 'c'],
          ],
        ),
      ),
      'tree',
    );
    assert.equal(
      fitOf(
        shapeOf(
          ['a', 'b', 'c'],
          [
            ['a', 'c'],
            ['b', 'c'],
          ],
        ),
      ),
      'flow',
    );
    assert.equal(
      fitOf(
        shapeOf(
          ['a', 'b'],
          [
            ['a', 'b'],
            ['b', 'a'],
          ],
        ),
      ),
      'cluster',
    );
  });

  test('a tree stands each parent over its children, and a flow runs across', () => {
    const kids = shapeOf(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['a', 'c'],
      ],
    );
    const t = fittingLayout(kids).layout.place(kids);
    assert.equal(t.get('a')[1], 0);
    assert.equal(t.get('b')[1], 1);
    assert.equal(t.get('a')[0], (t.get('b')[0] + t.get('c')[0]) / 2, 'the parent is over the middle of its children');
    const join = shapeOf(
      ['a', 'b', 'c'],
      [
        ['a', 'c'],
        ['b', 'c'],
      ],
    );
    const f = fittingLayout(join).layout.place(join);
    assert.ok(f.get('c')[0] > f.get('a')[0] && f.get('a')[1] !== f.get('b')[1], 'c is a step on, a and b side by side');
  });

  test('the same things fit the same way every time', () => {
    const s = shapeOf(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['a', 'c'],
        ['c', 'd'],
      ],
    );
    assert.deepEqual([...fittingLayout(s).layout.place(s)], [...fittingLayout(s).layout.place(s)]);
  });
});

describe('only the items chosen are arranged', () => {
  // proves: board_arranged_by_graph
  test('the others stay, the chosen are arranged by the links among them, and the way is named', () => {
    const r = arrangeBoard(NOTE, 'ideas', undefined, [], ['a', 'b']);
    assert.ok(!('refused' in r), r.refused);
    assert.equal(r.how, 'tree', 'ann leads to bob: a tree');
    assert.deepEqual(r.glide.map((g) => g.id).sort(), ['a', 'b']);
    const by = Object.fromEntries(boardOf(r.note).items.map((i) => [i.id, i]));
    assert.deepEqual([by.c.x, by.c.y, by.d.x, by.d.y], [20, 20, 500, 500]);
    assert.equal(r.undo, NOTE);
  });

  test('a pinned (locked) item chosen with others stays, and a free item cannot be arranged', () => {
    const r = arrangeBoard(NOTE, 'ideas', undefined, [], ['a', 'b', 'c']);
    assert.deepEqual(r.glide.map((g) => g.id).sort(), ['a', 'b']);
    assert.equal(r.how, 'tree');
    const one = arrangeBoard(NOTE, 'ideas', undefined, [], ['d']);
    assert.match(one.refused, /No item/, 'a free item cannot be moved by the graph');
  });
});

describe('arranged cards keep clear of every other card', () => {
  const lap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  // proves: board_arranged_by_graph
  test('no arranged card lies over a card that stays, nor over another arranged card', () => {
    const r = arrangeBoard(NOTE, 'ideas', undefined);
    assert.ok(!('refused' in r), r.refused);
    const items = boardOf(r.note).items;
    const box = (i) => ({ x: i.x, y: i.y, w: i.w ?? 160, h: i.h ?? 160 });
    for (const g of r.glide) {
      const mine = items.find((i) => i.id === g.id);
      for (const other of items)
        if (other !== mine) assert.ok(!lap(box(mine), box(other)), `${g.id} clear of ${other.id}`);
    }
    const by = Object.fromEntries(items.map((i) => [i.id, i]));
    assert.deepEqual([by.c.x, by.c.y, by.d.x, by.d.y], [20, 20, 500, 500], 'the cards that stay did not move');
  });

  test('big cards are spaced by their own size', () => {
    const big = FAR.replace("text: 'Ann'", "w: 600, h: 400, text: 'Ann'").replace(
      "text: 'Bob'",
      "w: 600, h: 400, text: 'Bob'",
    );
    const r = arrangeBoard(big, 'ideas', force);
    const [a, b] = boardOf(r.note).items;
    assert.ok(
      a.x + 600 <= b.x || b.x + 600 <= a.x || a.y + 400 <= b.y || b.y + 400 <= a.y,
      'the big cards are clear of each other',
    );
  });
});
