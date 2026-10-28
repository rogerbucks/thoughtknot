// Kinds that link in order, each in a lane of their own (editor spec §68: layout_kind_lanes). Roger chose it, 28 Oct
// 2026: kinds move things, not just colour them, with the why shown and one tap to turn it off. In rows each kind has a
// lane (layers.ts `banded`), in space a plane (space-spread.ts). The View menu's switch is "Lanes by kind".
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ownSpots } from '../src/layouts/own-engine.ts';
import { lanesIn, ownSource } from '../src/layouts/own-draw.ts';
import { lanesShown, pickSaid } from '../src/layouts/fingerprint.ts';
import { spreadSpace } from '../src/space-spread.ts';
import { ViewState, startingSwitches } from '../src/view-switches.ts';
import { DEFAULT_SETTINGS } from '../src/settings.ts';

const box = (of) => ({ kind: 'box', id: of, style: 'thing', role: 'thing', of, x: 0, y: 0, width: 120, height: 40 });
const link = ([from, to]) => ({ kind: 'link', id: `${from} ${to}`, style: 'link', from, to, points: [] });
// requirements, then tests, then code; one requirement is linked straight to its code
const LINKS = [
  ['r1', 't1'],
  ['t1', 'c1'],
  ['r1', 'c2'],
  ['r2', 't2'],
  ['t2', 'c3'],
  ['r2', 't1'],
];
const KEYS = [...new Set(LINKS.flat())];
const KINDS = new Map(KEYS.map((k) => [k, { r: 'Requirement', t: 'Test', c: 'Code' }[k[0]]]));
const LAID = { marks: [...KEYS.map(box), ...LINKS.map(link)], space: { width: 0, height: 0 } };
const across = (spots, letter) => KEYS.filter((k) => k[0] === letter).map((k) => spots.get(k)[0]);

describe('kinds that link in order', () => {
  // proves: layout_kind_lanes
  test('each have a lane of their own in rows, in their order, and without lanes need not', () => {
    const { spots, bands } = ownSpots(LAID, 'LR', undefined, [], {}, KINDS);
    assert.ok(Math.max(...across(spots, 'r')) < Math.min(...across(spots, 't')), 'requirements before tests');
    assert.ok(Math.max(...across(spots, 't')) < Math.min(...across(spots, 'c')), 'tests before code');
    assert.deepEqual(Object.fromEntries(bands), { r1: 0, t1: 1, c1: 2, c2: 2, r2: 0, t2: 1, c3: 2 });
    const plain = ownSpots(LAID, 'LR').spots;
    assert.equal(plain.get('c2')[0], plain.get('t1')[0], 'code linked straight from a requirement sits with the tests');
    assert.equal(ownSpots(LAID, 'LR').bands.size, 0);
  });

  // proves: layout_kind_lanes
  test('across two sides have a lane each, the side most links run from first, whatever their names', () => {
    const links = [
      ['z1', 'a1'],
      ['z1', 'a2'],
      ['z2', 'a2'],
    ];
    const keys = [...new Set(links.flat())];
    const kinds = new Map(keys.map((k) => [k, k[0] === 'z' ? 'Zeta' : 'Alpha']));
    const laid = { marks: [...keys.map(box), ...links.map(link)], space: { width: 0, height: 0 } };
    const { spots, bands } = ownSpots(laid, 'LR', undefined, [], {}, kinds);
    assert.deepEqual(Object.fromEntries(bands), { z1: 0, a1: 1, a2: 1, z2: 0 });
    assert.ok(Math.max(spots.get('z1')[0], spots.get('z2')[0]) < Math.min(spots.get('a1')[0], spots.get('a2')[0]));
  });

  // proves: layout_kind_lanes
  test('each have a plane of their own in space, in their order', () => {
    const bands = ownSpots(LAID, 'LR', undefined, [], {}, KINDS).bands;
    const { space } = spreadSpace(LAID.marks, undefined, false, false, {}, bands);
    const depth = new Map(space.blocks.map((b) => [b.of, b.floor + b.tall / 2]));
    const of = (letter) => KEYS.filter((k) => k[0] === letter).map((k) => depth.get(k));
    for (const letter of ['r', 't', 'c']) {
      const ds = of(letter);
      assert.ok(Math.max(...ds) - Math.min(...ds) < 1e-6, `${letter} things share one plane`);
    }
    assert.ok(of('r')[0] < of('t')[0] && of('t')[0] < of('c')[0], 'the planes stack in the kinds’ order');
  });

  // proves: layout_kind_lanes
  test('say so in the View menu, ride on the drawing to space, and turn off with one switch', () => {
    const said = pickSaid({
      why: 'flow',
      kinds: 'ordered',
      order: ['Requirement', 'Test', 'Code'],
      parts: 1,
      loose: 0,
      lanes: true,
    });
    assert.match(said, /Each kind has a lane of its own\./);
    const attribute = encodeURIComponent(JSON.stringify({ why: 'flow', bands: { r1: 0, t1: 1, bad: 'x' } }));
    assert.deepEqual(Object.fromEntries(lanesShown(attribute)), { r1: 0, t1: 1 });
    assert.equal(lanesShown(null).size, 0);
    assert.equal(DEFAULT_SETTINGS.kindLanes, 'on', 'on unless the person turns it off');
    const off = new ViewState({ ...startingSwitches({ ...DEFAULT_SETTINGS, kindLanes: 'off' }), engine: true });
    const drawing = { boxes: [], links: [], estimates: [] };
    assert.equal(off.folded(drawing).kindLanes, false);
    assert.equal(new ViewState(startingSwitches(DEFAULT_SETTINGS)).folded(drawing).kindLanes, undefined);
    const dot = 'digraph {\n  a [label="a"];\n}';
    assert.equal(lanesIn(ownSource(dot, {}, KINDS, false)), false);
    assert.equal(lanesIn(ownSource(dot, {}, KINDS)), true);
  });
});
