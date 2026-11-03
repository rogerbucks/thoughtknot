// The pole view (editor spec §58, intent_pole_view): pole-view.ts. Each intent is a fixed pole. A thing sits near the
// intents it supports and away from those it contradicts; one pulled both ways sits between. Things not linked sit in
// a band of their own, and with two intents the poles face each other on one axis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poleMarks, polePlaces } from '../src/view-types/pole-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';
import { VIEW_DRAWERS, VIEW_TYPES } from '../src/view-types/view-types.ts';

const SPACE = { width: 600, height: 500 };
/** A shape of things `[key, kind]` and links `[from, type, to]`. */
const shapeOf = (things, links = []) => ({
  things: things.map(([key, kind]) => ({ key, text: key.toUpperCase(), kinds: kind ? [kind] : [] })),
  links: links.map(([from, type, to]) => ({ from, type, to })),
});
const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const TWO = shapeOf(
  [
    ['early', 'Intent'],
    ['calm', 'Intent'],
    ['prep', 'Thing'],
    ['news', 'Thing'],
    ['alarm', 'Thing'],
    ['torn', 'Thing'],
    ['walk', 'Thing'],
  ],
  [
    ['prep', 'SUPPORTS', 'early'],
    ['news', 'CONTRADICTS', 'early'],
    ['alarm', 'SUPPORTS', 'early'],
    ['alarm', 'SUPPORTS', 'calm'],
    ['torn', 'SUPPORTS', 'early'],
    ['torn', 'CONTRADICTS', 'early'],
  ],
);

// proves: intent_pole_view
test('things that support an intent sit nearer it than things that contradict it, a thing pulled both ways sits between, and unlinked things are in their band', () => {
  const p = polePlaces(TWO, SPACE.width, SPACE.height);
  const early = p.at.get('early');
  assert.ok(far(p.at.get('prep'), early) < far(p.at.get('news'), early), 'support is nearer than contradiction');
  // pulled both ways: between the two, near the middle
  const torn = p.at.get('torn');
  assert.ok(far(torn, p.centre) < far(p.at.get('prep'), p.centre), 'a thing pulled both ways sits nearer the middle');
  // supporting both intents: between the two poles
  const alarm = p.at.get('alarm'),
    calm = p.at.get('calm');
  assert.ok(far(alarm, early) < far(early, calm) && far(alarm, calm) < far(early, calm), 'between the two it supports');
  assert.deepEqual(p.band, ['walk']);
  assert.ok(p.at.get('walk')[1] > p.bandTop, 'a thing not linked sits in the band');
  for (const k of ['prep', 'news', 'alarm', 'torn']) assert.ok(p.at.get(k)[1] < p.bandTop, `${k} is above the band`);
  // two intents face each other on one axis
  assert.equal(Math.round(early[1]), Math.round(calm[1]), 'two poles on one level line');
  assert.ok(early[0] < calm[0] || early[0] > calm[0]);
});

test('the same data gives the same picture, every mark inside the space, poles named and drawn apart', () => {
  const marks = poleMarks({ shape: TWO, space: SPACE });
  assert.deepEqual(poleMarks({ shape: TWO, space: SPACE }), marks);
  assert.ok(Array.isArray(drawMarksOf(marks, SPACE)), 'every mark reads as a drawing mark inside the space');
  for (const m of marks.filter((x) => x.kind === 'box')) {
    assert.ok(m.x >= 0 && m.y >= 0 && m.x + m.width <= SPACE.width && m.y + m.height <= SPACE.height, m.id);
  }
  const box = (k) => marks.find((m) => m.kind === 'box' && m.id === k);
  assert.equal(box('early').shape, 'diamond');
  assert.equal(box('early').name, 'Intent: EARLY');
  assert.equal(box('prep').shape, 'ellipse');
  assert.ok(marks.some((m) => m.kind === 'group' && m.name === 'Not linked to an intent'));
  assert.equal(marks.filter((m) => m.kind === 'link').length, 6);
  assert.ok(VIEW_TYPES.includes('pole'));
  assert.ok(VIEW_DRAWERS.pole({ shape: TWO, space: SPACE }).length);
});

test('things at one place are spread round it, so none hides another', () => {
  const shape = shapeOf(
    [['goal', 'Intent'], ...['a', 'b', 'c', 'd'].map((k) => [k, 'Thing'])],
    ['a', 'b', 'c', 'd'].map((k) => [k, 'SUPPORTS', 'goal']),
  );
  const p = polePlaces(shape, SPACE.width, SPACE.height);
  const spots = new Set(['a', 'b', 'c', 'd'].map((k) => p.at.get(k).map(Math.round).join(',')));
  assert.equal(spots.size, 4);
  assert.deepEqual(poleMarks({ shape: shapeOf([]), space: SPACE }), []);
});
