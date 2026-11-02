// One "changed" signal for every surface showing a card's drawing (view_options_everywhere): focus-marks.ts. It says
// what changed. The view in space only paints a new lens again, and lays out anew for a new look or drawings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeOf, MARKED, tellChanged } from '../src/display/graph-view/focus-marks.ts';

// proves: view_options_everywhere
test('each change says what changed, and every listener hears it on the one event', () => {
  const drawing = new EventTarget(),
    heard = [];
  drawing.addEventListener(MARKED, (e) => heard.push(changeOf(e)));
  for (const what of ['look', 'lens', 'sketch']) tellChanged(drawing, what);
  assert.deepEqual(heard, ['look', 'lens', 'sketch']);
});

// proves: view_options_everywhere
test('a change that does not say what it was is taken as a new look, so all is laid out again', () => {
  assert.equal(changeOf(new Event(MARKED)), 'look');
  assert.equal(changeOf(new CustomEvent(MARKED, { detail: 'other' })), 'look');
});
