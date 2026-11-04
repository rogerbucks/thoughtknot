// Tags that never overlap (editor spec §68, level_tags): level-tags.ts. A cloud name or gate signpost that overlaps one
// moves down just below it, never across. A tag that overlaps none stays where it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spreadTags, tagWidth } from '../src/level-tags.ts';

const overlaps = (a, b) =>
  Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 1e-9 && Math.abs(a.y - b.y) < (a.height + b.height) / 2 - 1e-9;

// proves: level_tags
test('tags that overlap move down below the one above, never across, and the rest stay', () => {
  const tags = [
    { x: 0, y: 0, width: 60, height: 12 },
    { x: 10, y: 4, width: 60, height: 12 },
    { x: 20, y: 2, width: 60, height: 12 },
    { x: 500, y: 0, width: 60, height: 12 },
  ];
  const ys = spreadTags(tags);
  const now = tags.map((t, i) => ({ ...t, y: ys[i] }));
  for (let i = 0; i < now.length; i++)
    for (let j = i + 1; j < now.length; j++) assert.ok(!overlaps(now[i], now[j]), `${i} and ${j} apart`);
  assert.equal(ys[3], 0, 'a tag far away stays');
  assert.ok(ys[0] < ys[1], 'order kept: the higher stays higher');
  assert.deepEqual(spreadTags([{ x: 0, y: 5, width: 10, height: 10 }]), [5]);
  assert.deepEqual(spreadTags([tags[0], { ...tags[0] }]), [0, 12], 'the same spot parts them by order');
  assert.deepEqual(ys.slice(0, 3), [0, 24, 12], 'each just below the one above it');
  assert.equal(tagWidth('Money · 6', 10), 54);
});
