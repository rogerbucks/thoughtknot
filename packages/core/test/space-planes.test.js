// The ladder of detail as stacked planes in 2.5D and 3D (editor spec §53, cluster_planes): space-planes.ts. Over the
// things floats a plane of overview, one named card for each open group, with stalks down and links between groups.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlane, stackedPlanes } from '../src/space-planes.ts';
import { frameOf } from '../src/space-cards.ts';
import { spreadSpace } from '../src/space-spread.ts';
import { orbitFit, spaceMatrix } from '../src/space-view.ts';

const W = 800,
  H = 600;
const box = (of, x, group) => ({
  id: `t:${of}`,
  kind: 'box',
  style: 'thing',
  of,
  x,
  y: 0,
  width: 90,
  height: 40,
  group,
});
/** Four things in two groups, Makers and Helpers, two links between the groups and one inside Makers. */
const MARKS = [
  { id: 'g:makers', kind: 'group', style: 'group', x: -10, y: -10, width: 300, height: 60, name: 'Makers' },
  { id: 'g:helpers', kind: 'group', style: 'group', x: 390, y: -10, width: 300, height: 60, name: 'Helpers' },
  box('ann', 0, 'g:makers'),
  box('bob', 150, 'g:makers'),
  box('cy', 400, 'g:helpers'),
  box('dee', 550, 'g:helpers'),
  { id: 'e:1', kind: 'link', style: 'link', from: 'ann', to: 'cy', points: [] },
  { id: 'e:2', kind: 'link', style: 'link', from: 'bob', to: 'dee', points: [] },
  { id: 'e:3', kind: 'link', style: 'link', from: 'ann', to: 'bob', points: [] },
];

for (const cards of [true, false])
  // proves: cluster_planes
  test(`over the things floats a named card for each group, with its count and a stalk down (${cards ? '2.5D' : '3D'})`, () => {
    const { space } = spreadSpace(MARKS, undefined, cards);
    const stacked = stackedPlanes(space);
    const planes = stacked.blocks.filter((b) => isPlane(b.of));
    assert.deepEqual(planes.map((b) => b.name).sort(), ['Helpers · 2 things', 'Makers · 2 things']);
    const highest = Math.max(...space.blocks.map((b) => b.floor + b.tall));
    assert.ok(
      planes.every((b) => b.floor > highest && b.card),
      'each is a card, above every thing',
    );
    assert.equal(new Set(planes.map((b) => b.floor)).size, 1, 'all on one plane');
    assert.equal(stacked.lines.filter((l) => l.id.endsWith('\nstalk')).length, 2, 'a stalk from each card down');
    const between = stacked.lines.filter((l) => isPlane(l.from) && isPlane(l.to));
    assert.deepEqual(
      between.map((l) => l.words),
      ['2 links'],
      'the links between two groups are one line between their cards, counted; a link inside a group is not',
    );
    const orbit = orbitFit(stacked, W / H);
    const frame = frameOf(stacked, spaceMatrix(orbit, W / H, orbit.distance * 4), W, H, null);
    const shown = frame.cards.filter((c) => isPlane(c.block.of));
    assert.equal(shown.length, 2, 'each painted as a card, never a ball');
    assert.match(shown.map((c) => c.rows.join(' ')).join(' | '), /Makers · 2 things/);
    assert.ok(!frame.shapes.blocks.some((b) => isPlane(b.of)), 'no ball is painted for a card');
  });

// proves: cluster_planes
test('a drawing with no more than one group has no plane over it: there is nothing to see from above', () => {
  const one = MARKS.filter((m) => m.id !== 'g:helpers').map((m) =>
    m.group === 'g:helpers' ? { ...m, group: undefined } : m,
  );
  const { space } = spreadSpace(one);
  assert.equal(stackedPlanes(space), space);
});
