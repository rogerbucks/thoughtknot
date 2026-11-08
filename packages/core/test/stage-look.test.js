// What the new stage draws a card's diagram as (editor spec §73, render_every_type): display/graph-view/stage-look.ts.
// Network and Ego, and each type that keeps its own places, are drawn by the stage; a table and the rest are not yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageKind } from '../src/display/graph-view/stage-look.ts';

const chosen = (drawn) => ({ choice: { drawn } });
const picture = (type) => ({ choice: { drawn: 'network' }, picture: { type } });

test('a card with no other type chosen is drawn as a network', () => {
  assert.equal(stageKind(undefined), 'network');
  assert.equal(stageKind(chosen('network')), 'network');
});

test('types laid out by a layout are drawn at their own places', () => {
  for (const t of ['radial', 'tree', 'flow']) assert.equal(stageKind(chosen(t)), t);
});

test('views drawn as a picture are drawn by the stage by their own name', () => {
  assert.equal(stageKind(picture('thoughtknot.diagrams.ego')), 'ego');
  for (const t of [
    'force',
    'chord',
    'centroid',
    'pole',
    'treemap',
    'containment',
    'block',
    'grid',
    'hive',
    'arc',
    'map',
    'matrix',
    'density',
    'plan',
  ])
    assert.equal(stageKind(picture(`thoughtknot.diagrams.${t}`)), t);
  assert.equal(stageKind(chosen('timeline')), 'timeline');
});

test("a table, and a type not moved yet, are left to today's drawing", () => {
  assert.equal(stageKind({ choice: { drawn: 'network' }, table: {} }), null);
  assert.equal(stageKind(chosen('lanes')), null);
});
