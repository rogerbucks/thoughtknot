// Levels that fit the graph (editor spec §68, detail_levels): detail-levels.ts. Subjects first, then areas, topics and
// every item as you zoom in, as many levels as the graph needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRANCH,
  everyItem,
  LEVELS_MOST,
  looseName,
  detailLevels,
  levelAt,
  levelBadge,
  levelCount,
  levelNames,
} from '../src/detail-levels.ts';

/** `clumps` clumps of `each` things, each clump a ring, the clumps joined in a ring by one link each. */
function clumped(clumps, each) {
  const things = [],
    links = [];
  for (let c = 0; c < clumps; c++)
    for (let i = 0; i < each; i++) {
      things.push({ key: `c${c}t${i}`, text: `Thing ${c}.${i}`, kinds: [] });
      links.push({ from: `c${c}t${i}`, type: 'USES', to: `c${c}t${(i + 1) % each}` });
      if (i === 0) links.push({ from: `c${c}t0`, type: 'USES', to: `c${(c + 1) % clumps}t0` });
    }
  return { things, links };
}

// proves: detail_levels
test('the count of levels fits the graph: a handful has one, hundreds have the most', () => {
  assert.equal(levelCount(2), 1);
  assert.equal(levelCount(BRANCH), 1);
  assert.equal(levelCount(20), 2);
  assert.equal(levelCount(430), LEVELS_MOST);
  assert.deepEqual(levelNames(1), [everyItem()]);
  assert.deepEqual(levelNames(4), ['Subjects', 'Areas', 'Topics', everyItem()]);
  assert.deepEqual(detailLevels(clumped(1, 2)), [{ name: everyItem(), groups: [] }]);
});

// proves: detail_levels
test('things that link closely share a group, each group nests in one a level out, and every thing is in one', () => {
  const shape = clumped(5, 6);
  const levels = detailLevels(shape);
  assert.deepEqual(
    levels.map((l) => l.name),
    ['Subjects', everyItem()],
  );
  const [top] = levels;
  assert.equal(
    top.groups.reduce((s, g) => s + g.things.length, 0),
    30,
    'every thing in exactly one group',
  );
  assert.ok(top.groups.length <= BRANCH && top.groups.length >= 2, `${top.groups.length} groups`);
  for (const g of top.groups) {
    const clumps = new Set(g.things.map((k) => k.split('t')[0]));
    assert.equal(clumps.size * 6, g.things.length, 'a clump is never split');
  }
  const big = detailLevels(clumped(20, 8));
  assert.equal(big.length, 3);
  for (const g of big[1].groups)
    assert.ok(
      big[0].groups.some((p) => p.key === g.parent),
      'nests in a parent',
    );
  assert.ok(big[0].groups.length <= BRANCH);
  assert.ok(big[1].groups.length <= BRANCH ** 2);
});

// proves: detail_levels
test('far out the farthest level shows, nearer the nearest that fits, and a badge says where you are', () => {
  const levels = detailLevels(clumped(20, 8));
  const all = new Set(levels[0].groups.flatMap((g) => g.things));
  assert.equal(levelAt(levels, all, BRANCH), 0, 'far out, every thing on screen: the subjects');
  const area = levels[1].groups[0];
  assert.equal(levelAt(levels, new Set(area.things.slice(0, 10))), 2, 'zoomed into one area: every item');
  const smallest = [...levels[0].groups].sort((a, b) => a.things.length - b.things.length);
  const twoSubjects = new Set(smallest.slice(0, 2).flatMap((g) => g.things));
  assert.equal(levelAt(levels, twoSubjects, 8), 1, 'a few subjects on screen: their areas');
  assert.equal(levelBadge(levels, 1), 'Level 2 of 3 · Areas');
  assert.equal(levelAt([{ name: everyItem(), groups: [] }], new Set()), 0);
});

// proves: detail_levels
test('things linked to nothing gather in one group of loose ends, and a group is named for its biggest thing', () => {
  const shape = clumped(4, 6);
  for (let i = 0; i < 12; i++) shape.things.push({ key: `lone${i}`, text: `Lone ${i}`, kinds: [] });
  shape.things.push({ key: 'hub', text: 'The hub', kinds: [] });
  for (let i = 0; i < 6; i++) shape.links.push({ from: 'hub', type: 'USES', to: `c0t${i}` });
  const [top] = detailLevels(shape);
  assert.ok(top.groups.length <= BRANCH);
  assert.ok(top.groups.some((g) => g.name === 'The hub'));
  const lone = top.groups.filter((g) => g.things.some((k) => k.startsWith('lone')));
  assert.equal(lone.length, 1, 'loose ends together');
  assert.equal(lone[0].name, looseName());
  assert.equal(lone[0].things.length, 12);
});
