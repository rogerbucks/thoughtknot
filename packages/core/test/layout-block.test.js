// Where things sit, kept apart from the data (editor spec §2, layout_block, layout_block_optional, layout_block_checked
// and layout_drag_saves). The places are a block of their own after the graph, named by each thing's key. Saving one
// never touches the graph block. A place for a thing that is gone is a problem whose fix forgets it. A rename carries
// its place.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dataKind } from '../src/blocks.ts';
import { forgetPlace, layoutOf, placeThing, readLayout, renamePlace, writeLayout } from '../src/layout-block.ts';

const BLOCK = `// graph: trip_layout · LAYOUT ON trip
(ann:Place {x: 120, y: 40, group: 'Team'}),
// Bob sits by Ann
(bob:Place {x: 300, y: 40})`;

const codes = (problems) => problems.map((p) => [p.code, p.line]);

describe('a layout block', () => {
  test('is known by its graph line, and is never data to draw as a graph', () => {
    assert.deepEqual(layoutOf(BLOCK), { name: 'trip_layout', on: 'trip' });
    assert.equal(layoutOf('// graph: trip'), null);
    assert.equal(layoutOf('// graph: trip_ink · SKETCH ON trip'), null);
    assert.equal(dataKind(BLOCK), null);
  });

  test('holds each place by its thing key, with the group a person chose', () => {
    const { layout, problems } = readLayout(BLOCK);
    assert.deepEqual(problems, []);
    assert.equal(layout.on, 'trip');
    assert.deepEqual(
      [...layout.places],
      [
        ['ann', { x: 120, y: 40, group: 'Team' }],
        ['bob', { x: 300, y: 40 }],
      ],
    );
  });

  test('is written in one fixed form, and read back is the same places', () => {
    const { layout } = readLayout(BLOCK);
    const again = readLayout(writeLayout(layout)).layout;
    assert.deepEqual([...again.places], [...layout.places]);
    assert.match(
      writeLayout(layout),
      /^\/\/ graph: trip_layout · LAYOUT ON trip\n\(ann:Place \{x: 120, y: 40, group: 'Team'\}\),\n\(bob:Place/,
    );
  });
});

describe('a layout block is checked (layout_block_checked)', () => {
  test('a place for a thing the graph does not hold is a problem whose fix forgets it, and is not used', () => {
    const { layout, problems } = readLayout(BLOCK, new Set(['ann']), 2);
    assert.deepEqual(codes(problems), [['GN910', 4]]);
    assert.equal(problems[0].block, 2);
    assert.match(problems[0].fix, /forget the place of bob/);
    assert.deepEqual([...layout.places.keys()], ['ann']);
    const fixed = forgetPlace(BLOCK, 'bob');
    assert.deepEqual(readLayout(fixed, new Set(['ann'])).problems, []);
    assert.ok(!/bob/.test(fixed.replace('Bob sits', '')));
  });

  test('a line that is not a place is a problem, and the rest is still read', () => {
    const { layout, problems } = readLayout(`${BLOCK},\n(c:Shape {x: 1, y: 2})`);
    assert.deepEqual(codes(problems), [['GN909', 5]]);
    assert.equal(layout.places.size, 2);
  });

  test('a rename carries the place to the new name, and nothing else changes', () => {
    const renamed = renamePlace(BLOCK, 'ann', 'anna');
    assert.deepEqual(readLayout(renamed).layout.places.get('anna'), { x: 120, y: 40, group: 'Team' });
    assert.equal(renamed.replace('anna', 'ann'), BLOCK);
    assert.equal(renamePlace(BLOCK, 'zoe', 'z'), BLOCK);
  });
});

describe('saving a place (layout_drag_saves, layout_block)', () => {
  const GRAPH = "// graph: trip\n(ann:Person {name: 'Ann'})-[:KNOWS]->(bob:Person {name: 'Bob'})";

  test('a place for a thing already placed rewrites only its own line, keeping its group and the comments', () => {
    const moved = placeThing(BLOCK, 'trip', 'ann', 200.4, 80.6);
    assert.equal(moved, BLOCK.replace('{x: 120, y: 40, group', '{x: 200, y: 81, group'));
  });

  test('a new place is added at the end; with no block yet, one is made for the graph', () => {
    const added = placeThing(BLOCK, 'trip', 'cy', 5, 6, 'Team');
    assert.deepEqual(readLayout(added).layout.places.get('cy'), { x: 5, y: 6, group: 'Team' });
    assert.equal(readLayout(added).problems.length, 0);
    const made = placeThing(null, 'trip', 'ann', 1, 2);
    assert.equal(made, '// graph: trip_layout · LAYOUT ON trip\n(ann:Place {x: 1, y: 2})');
  });

  test('the graph block is never rewritten, and the graph reads the same without its layout (layout_block_optional)', () => {
    const before = GRAPH;
    placeThing(null, 'trip', 'ann', 1, 2);
    assert.equal(GRAPH, before);
    assert.equal(dataKind(GRAPH), 'data');
    assert.equal(dataKind(placeThing(null, 'trip', 'ann', 1, 2)), null);
  });

  test('one undo takes the save back: the text before is all it needs', () => {
    const before = BLOCK;
    const after = placeThing(before, 'trip', 'bob', 9, 9);
    assert.notEqual(after, before);
    assert.deepEqual([...readLayout(before).layout.places], [...readLayout(BLOCK).layout.places]);
  });
});
