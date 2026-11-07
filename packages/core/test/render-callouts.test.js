// Callouts, part of layer L4 (editor spec §73, render_marks): render/render-callouts.ts. Far out, the top level's
// names stand in order round the drawing. The whole of it is proved in render-marks.test.js; here, how a line of names
// is packed along one side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack } from '../src/render/render-callouts.ts';

// proves: render_marks
test('a line of names keeps its order and gaps, each near its wish, sliding back from the far end if it must', () => {
  assert.deepEqual(
    pack(
      [
        { at: 50, size: 20 },
        { at: 200, size: 20 },
      ],
      0,
      400,
    ),
    [40, 190],
    'room for both: each centred where it would like',
  );
  const crowded = pack(
    [
      { at: 100, size: 20 },
      { at: 100, size: 20 },
      { at: 100, size: 20 },
    ],
    0,
    400,
  );
  assert.deepEqual(crowded, [90, 116, 142], 'wishing for one place, they stand in turn, a gap apart');
  assert.deepEqual(
    pack(
      [
        { at: 390, size: 20 },
        { at: 395, size: 20 },
      ],
      0,
      400,
    ),
    [354, 380],
    'pushed past the end, the line slides back',
  );
  assert.equal(pack([{ at: 0, size: 500 }], 0, 400), null, 'too long for the side: none');
});
