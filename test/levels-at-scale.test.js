// The levels of detail at 2,000 things (editor spec §68, level_scale). The UX review, 3 Nov 2026: only 430 items were
// tried, so run 2,000 before release. Here, a graph of 2,000 things gets its levels, its seed layout, its clouds and
// its roads. Every thing sits in one group at each level, and each group nests. Every thing gets its own spot. Every
// link between two clouds is in exactly one road.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS_MOST, detailLevels, levelAt } from '../packages/core/src/detail-levels.ts';
import { levelSeed } from '../packages/core/src/layouts/level-seed.ts';
import { cloudsAt } from '../packages/core/src/level-clouds.ts';
import { roadsAt } from '../packages/core/src/level-roads.ts';

const N = 2000;
const things = [],
  links = [];
for (let i = 0; i < N; i++) {
  things.push({ key: `t${i}`, text: `Thing ${i}`, kinds: ['Task'] });
  const ring = Math.floor(i / 6) * 6;
  links.push({ from: `t${i}`, to: `t${Math.min(N - 1, ring + ((i + 1) % 6))}` });
  if (i % 6 === 0) links.push({ from: `t${i}`, to: `t${(i * 7 + 36) % N}` });
}
const shape = { things, links };

// proves: level_scale
test('2,000 things get nested levels, a spot each, clouds that fit and roads that carry every link once', () => {
  const levels = detailLevels(shape);
  assert.equal(levels.length, LEVELS_MOST);
  for (let i = 0; i < levels.length - 1; i++) {
    const all = levels[i].groups.flatMap((g) => g.things);
    assert.equal(all.length, N, `level ${i}: every thing once`);
    assert.equal(new Set(all).size, N);
    if (i > 0)
      for (const g of levels[i].groups) {
        const p = levels[i - 1].groups.find((q) => q.key === g.parent);
        assert.ok(p && g.things.every((t) => p.things.includes(t)), `${g.key} nests`);
      }
  }
  const seed = levelSeed(shape, 2, 40);
  assert.equal(seed.size, N, 'a spot for every thing');
  assert.equal(new Set([...seed.values()].map(([x, y]) => `${x},${y}`)).size, N, 'no two share');
  const rects = new Map([...seed].map(([key, [x, y]]) => [key, { left: x, top: y, right: x + 40, bottom: y + 20 }]));
  const at = levelAt(levels, new Set(seed.keys()));
  assert.ok(at < levels.length - 1, 'far out, groups show, not every item');
  const clouds = cloudsAt(levels, at, rects, 10);
  assert.equal(clouds.length, levels[at].groups.length);
  const groupOf = new Map(levels[at].groups.flatMap((g) => g.things.map((t) => [t, g.key])));
  const across = links.filter((l) => groupOf.get(l.from) !== groupOf.get(l.to)).length;
  const roads = roadsAt(levels, at, links, clouds, 6, 20);
  assert.equal(
    roads.reduce((n, r) => n + r.count, 0),
    across,
    'links never vanish: each one is in a road',
  );
});
