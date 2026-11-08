// The notes a Bases view picks, as one graph (Bases graph decisions B2, B3, B5, decided by Roger, 8 Nov 2026).
// proves: bases_graph_links
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '@thoughtknot/core';
import { BASE_GRAPH, baseGraphText, noteKey } from '../src/bases/base-graph.ts';

const NOTES = [
  { path: 'Trip/Plan.md', name: 'Plan', links: ['Trip/Budget.md', 'Trip/Plan.md', 'Elsewhere/Map.md'] },
  { path: 'Trip/Budget.md', name: "Budget 'v2'", links: ['Trip/Plan.md', 'Trip/Plan.md'] },
  { path: 'Trip/Packing.md', name: 'Packing', links: [] },
];
const drawn = (text) => readNote([text]).graphs.get(BASE_GRAPH);

describe('a Bases view as a graph', () => {
  test('each note picked is a thing, named as the note and carrying a link to it', () => {
    const d = drawn(baseGraphText(NOTES));
    assert.deepEqual(d.boxes.map((b) => b.text).sort(), ["Budget 'v2'", 'Packing', 'Plan']);
    assert.ok(baseGraphText(NOTES).includes("note: '[[Trip/Plan]]'"), 'its details open the note');
    assert.equal(readNote([baseGraphText(NOTES)]).problems.length, 0, 'read without a problem');
  });

  test('a link between two notes picked is one link; none to itself, none written twice', () => {
    const d = drawn(baseGraphText(NOTES));
    const pairs = d.links.map((l) => `${l.from}>${l.to}`).sort();
    const [plan, budget] = ['Trip/Plan.md', 'Trip/Budget.md'].map(noteKey);
    assert.deepEqual(pairs, [`${budget}>${plan}`, `${plan}>${budget}`].sort());
  });

  test('a linked note outside the view is left out by default, and shown as an Outside thing when asked (B5)', () => {
    assert.equal(drawn(baseGraphText(NOTES)).boxes.length, 3);
    const shown = drawn(baseGraphText(NOTES, 'show'));
    assert.equal(shown.boxes.length, 4);
    assert.ok(
      shown.boxes.some((b) => b.text === 'Map'),
      'named from its path',
    );
    assert.ok(baseGraphText(NOTES, 'show').includes(`(${noteKey('Elsewhere/Map.md')}:Outside`));
  });

  test('a note keeps its thing’s name whatever else the view picks, so its place is kept (nodes stay put)', () => {
    assert.equal(noteKey('Trip/Plan.md'), noteKey('Trip/Plan.md'));
    assert.notEqual(noteKey('Trip/Plan.md'), noteKey('Trip/Plan2.md'));
    assert.match(noteKey('Any path/with spaces & signs.md'), /^n[0-9a-z]+$/);
    const alone = baseGraphText([NOTES[0]]);
    assert.ok(alone.includes(`(${noteKey('Trip/Plan.md')}:Note`));
  });
});
