// The names in the 3D view (editor spec §53, scale_space_labels): space-labels.ts. A name is never dropped for being
// small. It is painted at a readable size, facing the camera. The picked thing's name comes first, then those
// nearest where you look, and no name covers another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LABELS_MOST,
  NAME_TINY,
  READABLE_LEAST,
  READABLE_MOST,
  hubGrow,
  labelsOnScreen,
  largestName,
} from '../src/space-labels.ts';
import { orbitFit, spaceMatrix, spaceOf, zoomBy } from '../src/space-view.ts';

/** A grid of `count` things, 20 a row, each a box with its name in a small font, as Graphviz draws 9-pixel names. */
function grid(count, size = 9) {
  const marks = [];
  for (let i = 0; i < count; i++) {
    const x = (i % 20) * 120,
      y = Math.floor(i / 20) * 80;
    marks.push({ id: `t:${i}`, kind: 'box', style: 'thing', of: `${i}`, x, y, width: 90, height: 40 });
    marks.push({
      id: `l:${i}`,
      kind: 'label',
      style: 'thing.name',
      of: `${i}`,
      x: x + 45,
      y: y + 20,
      text: `Thing ${i}`,
      size,
      anchor: 'middle',
    });
  }
  return spaceOf(marks, { by: 'group' });
}

/** The labels on a screen `w` by `h`, with the whole of `space` in view, zoomed in `times`. */
function shownOf(space, w, h, times = 1, picked) {
  const orbit = zoomBy(orbitFit(space, w / h), times);
  return labelsOnScreen(space, spaceMatrix(orbit, w / h, 4000), w, h, picked === undefined ? {} : { picked });
}

/** Whether two labels' boxes, estimated as the painter will paint them, overlap. */
const overlap = (a, b) => {
  const half = (l) => (l.text.length * l.size * 0.56) / 2;
  return Math.abs(a.x - b.x) < half(a) + half(b) && Math.abs(a.y - b.y) < (a.size + b.size) / 2;
};

test('with the whole graph in view, names still show, scaled with their things and never under the tiny size', () => {
  const shown = shownOf(grid(200), 400, 640);
  assert.ok(shown.length >= 5, `only ${shown.length} names shown`);
  assert.ok(shown.length <= LABELS_MOST);
  assert.ok(shown.every((l) => l.size >= NAME_TINY));
  const near = shownOf(grid(200), 400, 640, 12);
  assert.ok(Math.max(...near.map((l) => l.size)) > Math.max(...shown.map((l) => l.size)), 'nearer, larger');
});

test('no name covers another, and zooming in shows more names', () => {
  const space = grid(200);
  // the fitted view already fills the screen, so far is zoomed out from it and near is the fit
  const far = shownOf(space, 800, 600, 0.3),
    near = shownOf(space, 800, 600);
  for (const list of [far, near])
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        assert.ok(!overlap(list[i], list[j]), `${list[i].text} / ${list[j].text}`);
  assert.ok(near.length > far.length, `${near.length} near, ${far.length} far`);
});

test('the names nearest the middle of the screen come first', () => {
  const shown = shownOf(grid(200), 800, 600);
  const off = (l) => Math.hypot(l.x - 400, l.y - 300);
  assert.ok(off(shown[0]) < off(shown.at(-1)));
});

test('the picked thing always has its name shown, first and at least a set size', () => {
  const space = grid(400);
  // a thing in a far corner, whose name loses to many nearer ones
  const shown = shownOf(space, 400, 300, 1, '19');
  assert.equal(shown[0]?.id, 'l:19');
  assert.equal(shown[0]?.picked, true);
  assert.ok(shown[0].size >= 14);
  assert.ok(!shown.slice(1).some((l) => l.picked));
});

test('a name is painted whole, up to the shown-text rule\'s 80 letters; a longer one ends in "…"', () => {
  // Roger, 24 Oct 2026: cutting a name short in 3D "doesn't make much sense"
  const marks = [
    { id: 't:a', kind: 'box', style: 'thing', of: 'a', x: 0, y: 0, width: 90, height: 40 },
    {
      id: 'l:a',
      kind: 'label',
      style: 'thing.name',
      of: 'a',
      x: 45,
      y: 20,
      text: 'x'.repeat(90),
      size: 9,
      anchor: 'middle',
    },
  ];
  const [l] = shownOf(spaceOf(marks, { by: 'group' }), 800, 600);
  assert.equal(l.text.length, 80);
  assert.ok(l.text.endsWith('…'));
  const whole = marks.map((m) => (m.kind === 'label' ? { ...m, text: 'x'.repeat(60) } : m));
  assert.equal(shownOf(spaceOf(whole, { by: 'group' }), 800, 600)[0].text, 'x'.repeat(60));
});

// proves: space_phone_readable
test('on a phone the names are smaller, and none runs past the sides of the view', () => {
  const space = grid(40, 30);
  for (const l of space.labels) l.text = `${l.text} ${'and a great deal more said about it '.repeat(3)}`.trim();
  const [w, h] = [390, 600];
  assert.ok(largestName(w, h) < READABLE_MOST && largestName(w, h) >= READABLE_LEAST);
  assert.equal(largestName(1200, 800), READABLE_MOST, 'a wide view keeps the full size');
  const shown = shownOf(space, w, h, 6);
  assert.ok(shown.length > 0);
  for (const l of shown) {
    assert.ok(l.size <= largestName(w, h), `${l.size}`);
    assert.ok(l.text.length * l.size * 0.56 <= w, `${l.text} fits across`);
  }
  assert.ok(
    shown.some((l) => l.text.endsWith('…')),
    'a long name is cut to fit',
  );
});

// proves: names_readable_any_zoom
test('the busiest thing is named first and larger, as in 2D', () => {
  const thing = (k, x) => [
    { id: `t:${k}`, kind: 'box', style: 'thing', of: k, x, y: 0, width: 20, height: 20 },
    {
      id: `l:${k}`,
      kind: 'label',
      style: 'thing.name',
      of: k,
      x: x + 10,
      y: 10,
      text: 'Name',
      size: 9,
      anchor: 'middle',
    },
  ];
  const link = (i, to) => ({
    id: `e${i}`,
    kind: 'link',
    style: 'link',
    from: 'b',
    to,
    points: [
      [0, 0],
      [1, 1],
    ],
  });
  const marks = [...thing('a', 0), ...thing('b', 22), ...thing('c', 44), link(0, 'a'), link(1, 'c')];
  const shown = shownOf(spaceOf(marks, { by: 'group' }), 800, 600);
  assert.equal(shown[0]?.id, 'l:b', 'the thing with the most links is placed first');
  const quiet = shown.find((l) => l.id !== 'l:b');
  if (quiet) assert.ok(shown[0].size > quiet.size, 'and drawn larger');
  assert.equal(hubGrow(2, 2), 1.4);
});
