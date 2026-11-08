// The style a Bases graph keeps in the .base file, apart from the notes (decision B4 and R16, decided by Roger, 8 Nov
// 2026). The graph is made again from the notes each time; the places kept still find their things.
// proves: bases_style_kept
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote, readStyle } from '@thoughtknot/core';
import { BASE_GRAPH, baseGraphText, noteKey } from '../src/bases/base-graph.ts';
import { blocksWithStyle, styleAfter } from '../src/bases/base-style.ts';

const NOTES = [
  { path: 'Trip/Plan.md', name: 'Plan', links: ['Trip/Budget.md', 'Trip/Plan.md', 'Elsewhere/Map.md'] },
  { path: 'Trip/Budget.md', name: "Budget 'v2'", links: ['Trip/Plan.md', 'Trip/Plan.md'] },
  { path: 'Trip/Packing.md', name: 'Packing', links: [] },
];

describe('the style a Bases graph keeps in the .base file (R16)', () => {
  test('a box moved is a nudge kept apart from the notes, and read back with the graph made again', () => {
    const text = baseGraphText(NOTES);
    const [plan, packing] = ['Trip/Plan.md', 'Trip/Packing.md'].map(noteKey);
    const r = styleAfter(text, '', { nudge: { word: 'beside', thing: plan, other: packing } });
    assert.ok('kept' in r, JSON.stringify(r));
    assert.ok(!r.kept.includes(':Note'), 'the graph itself is not kept');
    // the notes change: one more is picked; the place is still read
    const again = baseGraphText([...NOTES, { path: 'Trip/Tickets.md', name: 'Tickets', links: [] }]);
    const texts = blocksWithStyle(again, r.kept);
    const styling = readStyle(texts, BASE_GRAPH, readNote(texts));
    assert.deepEqual(
      styling.style.nudges.map((n) => [n.word, n.thing, n.other]),
      [['beside', plan, packing]],
    );
  });

  test('a second change is added to the style kept, and a refused one says why', () => {
    const text = baseGraphText(NOTES);
    const [plan, budget, packing] = ['Trip/Plan.md', 'Trip/Budget.md', 'Trip/Packing.md'].map(noteKey);
    const one = styleAfter(text, '', { nudge: { word: 'beside', thing: plan, other: packing } });
    const two = styleAfter(text, one.kept, { nudge: { word: 'beside', thing: budget, other: packing } });
    const texts = blocksWithStyle(text, two.kept);
    assert.equal(readStyle(texts, BASE_GRAPH, readNote(texts)).style.nudges.length, 2);
    assert.ok('refused' in styleAfter(text, '', { nudge: { word: 'sideways', thing: plan } }));
  });
});
