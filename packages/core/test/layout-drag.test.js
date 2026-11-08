// A place a person gives a thing by dragging it is saved in the graph's layout block, and nothing else moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgetInNote, placeInNote, savedPlaces } from '../src/layout-places.ts';
import { sceneOf } from '../src/render/render-scene.ts';
import { roomsOf } from '../src/render/render-rooms.ts';

const GRAPH = "// graph: trip\n(ann:Person {name: 'Ann'}),\n(bob:Person {name: 'Bob'})";
const note = (...more) => ['# Trip', '', '```gql', GRAPH, '```', ...more].join('\n');

// proves: layout_drag_saves
test('a drag saves one place in the layout block, after the graph, and the graph is never rewritten', () => {
  assert.equal(savedPlaces(note(), 'trip').size, 0, 'no layout block: nothing saved');
  const first = placeInNote(note(), 'trip', GRAPH, 'ann', 120.4, 39.6);
  assert.ok('text' in first, JSON.stringify(first));
  assert.ok(first.text.startsWith(note()), 'the note above is as it was');
  assert.match(first.text, /```gql\n\/\/ graph: trip_layout · LAYOUT ON trip\n\(ann:Place \{x: 120, y: 40\}\)\n```$/);
  assert.deepEqual([...savedPlaces(first.text, 'trip')], [['ann', { x: 120, y: 40 }]]);
  // a second drag rewrites that block alone: one place each, the first kept
  const second = placeInNote(first.text, 'trip', GRAPH, 'bob', -5, 7);
  assert.equal(second.text.match(/LAYOUT ON/g).length, 1, 'one layout block');
  assert.deepEqual(Object.fromEntries(savedPlaces(second.text, 'trip')), {
    ann: { x: 120, y: 40 },
    bob: { x: -5, y: 7 },
  });
  // the graph the person saw is gone: nothing is written
  const changed = note().replace("'Bob'", "'Robert'");
  assert.ok('refused' in placeInNote(changed, 'trip', GRAPH, 'ann', 1, 1));
  // another graph's layout is not this one's
  assert.equal(savedPlaces(second.text, 'other').size, 0);
});

// proves: layout_drag_saves
test('saved places put their things there, and every other spot stays where the rooms put it', () => {
  const thing = (key, subject) => ({ key, text: key, kinds: ['Item'], texts: new Map([['subject', subject]]) });
  const things = ['a1', 'a2', 'a3', 'b1', 'b2'].map((k) => thing(k, k[0] === 'a' ? 'A' : 'B'));
  const scene = sceneOf({ things, links: [] });
  const plain = roomsOf(scene);
  const placed = roomsOf(scene, new Map([['a2', { x: 999, y: -40 }]]));
  assert.deepEqual([placed.get('a2').x, placed.get('a2').y], [999, -40]);
  for (const [key, spot] of plain) if (key !== 'a2') assert.deepEqual(placed.get(key), spot, `${key} stays put`);
});
