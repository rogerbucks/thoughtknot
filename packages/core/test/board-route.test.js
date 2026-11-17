// How a connector of a board runs (editor spec ES§45, board_routes). It is straight while nothing is in its way,
// and bows round an item that is. It may be told to run straight, as an elbow or curved, and where its arrows are.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard, writeBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { connectorRun, connectorsOf, sharedRoute } from '../src/board-route.ts';
import { boardSvg, itemBox } from '../src/board-svg.ts';

const PALETTE = { text: '#111', edge: '#222', muted: '#333', fill: (h) => `fill-${h}`, blend: (h) => `ink-${h}` };

const TEXT = `// graph: ideas · BOARD
(a:Sticky {x: 40, y: 60, text: 'Go by train'}),
(b:Sticky {x: 260, y: 60, text: 'Book early'}),
(c:Card {x: 520, y: 80, w: 180, h: 100, text: 'Paris'}),
(d:Text {x: 60, y: 300, text: 'Things to settle'}),
(a)-[:CONNECTS]->(c),
(a)-[:CONNECTS {label: 'then'}]->(d)`;

/** The connector `key` as drawn: its group, cut out of the board's picture by plain search. */
function drawn(text, key) {
  const svg = boardSvg(readBoard(text).board, PALETTE);
  const from = svg.indexOf(`<g data-connector="${key}">`);
  assert.ok(from >= 0, `no connector ${key} is drawn`);
  return svg.slice(from, svg.indexOf('</g>', from) + 4);
}
const routed = (set, links = [{ from: 'a', to: 'c' }]) => boardEdit(TEXT, { kind: 'routes', links, set }).text;

/** The spots along a drawn cubic path, to see what it runs through. */
function along(path) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = path.match(/-?[\d.]+/g).map(Number);
  return Array.from({ length: 21 }, (_, i) => {
    const t = i / 20,
      u = 1 - t;
    return [
      u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3,
      u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3,
    ];
  });
}

describe('how a connector of a board runs', () => {
  // proves: board_routes
  test('is straight while nothing is in its way, and bows round an item that is', () => {
    assert.match(drawn(TEXT, 'a-d'), /<line [^>]*marker-end="url\(#board-arrow\)"/, 'nothing in the way: a line');
    const path = drawn(TEXT, 'a-c').match(/<path d="(M[^"C]+C[^"]+)"/)[1];
    const b = itemBox(readBoard(TEXT).board.items[1]);
    const inside = ([x, y]) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
    assert.ok(!along(path).some(inside), 'the curve clears the note between the two');
    const clear = TEXT.replace('x: 260, y: 60', 'x: 260, y: 400');
    assert.match(drawn(clear, 'a-c'), /<line /, 'with the note moved away it is straight again');
    const frame = TEXT.replace('(b:Sticky {x: 260, y: 60', '(b:Frame {x: 20, y: 20, w: 700, h: 220');
    assert.match(drawn(frame, 'a-c'), /<line /, 'a frame holds items, so it is not in the way');
  });

  // proves: board_routes
  test('runs straight, as an elbow from side to side, or curved when told to, kept as text on the connector', () => {
    const straight = routed({ route: 'straight' });
    assert.match(straight, /\(a\)-\[:CONNECTS \{route: 'straight'\}\]->\(c\)/);
    assert.match(drawn(straight, 'a-c'), /<line /, 'told to be straight, it goes through what is in its way');
    const elbow = routed({ route: 'elbow' });
    assert.match(drawn(elbow, 'a-c'), /<path d="M200 140H360V130H520"/, 'from the right side to the left side');
    const down = routed({ route: 'elbow' }, [{ from: 'a', to: 'd' }]);
    assert.match(drawn(down, 'a-d'), /<path d="M120 220V260H[\d.]+V300"/, 'from the bottom to the top');
    assert.match(drawn(down, 'a-d'), />then<\/text>/, 'its label is kept');
    assert.match(down, /\(a\)-\[:CONNECTS \{label: 'then', route: 'elbow'\}\]->\(d\)/);
    const curved = routed({ route: 'curved' }, [{ from: 'a', to: 'd' }]);
    assert.match(drawn(curved, 'a-d'), /<path d="M[^"C]+C/, 'curved even with nothing in its way');
    assert.equal(routed({ route: null }), TEXT, 'given back to the board, nothing is written');
    assert.equal(writeBoard(readBoard(elbow).board), elbow, 'read back as written');
    const over = { x: 0, y: 0, w: 100, h: 100 };
    assert.ok(connectorRun({ from: 'a', to: 'b', route: 'elbow' }, over, { x: 50, y: 50, w: 100, h: 100 }, []).line);
  });

  // proves: board_routes
  test('has an arrow at its end, at both ends or at neither', () => {
    assert.doesNotMatch(drawn(TEXT, 'a-d'), /marker-start/);
    const both = routed({ tips: 'both' });
    assert.match(both, /\(a\)-\[:CONNECTS \{tips: 'both'\}\]->\(c\)/);
    assert.match(drawn(both, 'a-c'), /marker-end="url\(#board-arrow\)" marker-start="url\(#board-arrow\)"/);
    const none = routed({ tips: 'none' });
    assert.doesNotMatch(drawn(none, 'a-c'), /marker-/);
    assert.equal(boardEdit(both, { kind: 'routes', links: [{ from: 'a', to: 'c' }], set: { tips: 'end' } }).text, TEXT);
    const odd = TEXT.replace('(a)-[:CONNECTS]->(c)', "(a)-[:CONNECTS {route: 'wavy', tips: 'three'}]->(c)");
    assert.deepEqual(readBoard(odd).board.connectors[0], { from: 'a', to: 'c' }, 'words not known are left out');
    const sly = { route: "wavy'}]->(x), (y)-[:CONNECTS {route: 'elbow", tips: 'three' };
    const kept = boardEdit(both, { kind: 'routes', links: [{ from: 'a', to: 'c' }], set: sly }).text;
    assert.equal(kept, both, 'a change writes only the words a board knows');
  });

  // proves: board_routes
  test('a change is for the connectors between the items chosen, or else all that touch them', () => {
    const { board } = readBoard(routed({ route: 'elbow', tips: 'both' }));
    assert.deepEqual(
      connectorsOf(board, ['a', 'c']).map((c) => c.to),
      ['c'],
    );
    assert.deepEqual(
      connectorsOf(board, ['a']).map((c) => c.to),
      ['c', 'd'],
    );
    assert.deepEqual(connectorsOf(board, ['b']), []);
    assert.deepEqual(sharedRoute(connectorsOf(board, ['a', 'c'])), { route: 'elbow', tips: 'both' });
    assert.deepEqual(sharedRoute(connectorsOf(board, ['a'])), {}, 'they differ in both');
    assert.deepEqual(sharedRoute(readBoard(TEXT).board.connectors), { route: null, tips: 'end' });
    assert.match(boardEdit(TEXT, { kind: 'routes', links: [{ from: 'b', to: 'c' }], set: {} }).refused, /./);
  });
});
