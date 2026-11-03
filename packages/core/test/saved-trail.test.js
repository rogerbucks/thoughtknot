// Saving an exploring trail (editor spec §60, discover_saved_trail): as a lens, or as a path that replays each step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathSteps, trailAsLens, trailAsPath } from '../src/saved-trail.ts';

const RULES = ["Task WHERE status == 'open'", 'Task', "Task WHERE owner == 'Ann'"];

test('a saved trail reopens at its last picture, and as a path it replays each step', () => {
  // proves: discover_saved_trail
  assert.equal(
    trailAsLens('t1', 'My trail', RULES),
    "(t1:Lens {name: 'My trail', query: 'Task WHERE owner == \\'Ann\\''})",
  );
  const path = trailAsPath('t2', "Ann's path", RULES);
  const steps = /steps: '(.*)'\}\)$/.exec(path)[1].replace(/\\'/g, "'");
  assert.deepEqual(pathSteps(steps), RULES);
  assert.throws(() => trailAsLens('t3', 'x', []), /cannot be saved/);
  assert.throws(() => trailAsPath('t4', 'x', ['a | b']), /vertical bar/);
});
