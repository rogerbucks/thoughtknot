// The ground under a drawing in space (editor spec §68, space_ground): space-ground.ts. A faint grid lies under the lowest
// thing in 2.5D and 3D, so the view has a plane to steer by.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundGrid } from '../src/space-ground.ts';
import { orbitFit, projectPoint, spaceMatrix } from '../src/space-view.ts';

const W = 800,
  H = 600;

// proves: space_ground
test('a grid lies on the ground under the drawing, a little wider than it, and turns with the view', () => {
  const space = { blocks: [], lines: [], labels: [], arrows: [], least: [0, 0, -50], most: [1000, 600, 300] };
  const orbit = orbitFit(space, W / H);
  const m = spaceMatrix(orbit, W / H, 4000);
  const grid = groundGrid(space, m, W, H);
  assert.ok(grid.length >= 20, `lines both ways: ${grid.length}`);
  // every point lies on the ground, under the lowest thing: one grid corner, past the drawing, is on it
  const corner = projectPoint(m, [(-1000 / 12) * 2, (-1000 / 12) * 2, -50], W, H);
  const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6;
  assert.ok(
    grid.some((run) => run.some((p) => near(p, corner))),
    'its corner sits under the lowest thing, past the edge',
  );
  const turned = groundGrid(space, spaceMatrix({ ...orbit, turn: orbit.turn + 1 }, W / H, 4000), W, H);
  assert.notDeepEqual(turned[0], grid[0], 'it turns with the view');
});
