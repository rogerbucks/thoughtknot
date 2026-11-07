// A huge note read in parts within its budgets (editor spec ES§53, scale_parts_budget): the parts steps of
// scripts/scale-benchmark.mjs. Ten times the V-10 graph opens in parts, is filtered and has a group opened, each within
// its budget. A note past the in-parts limit is refused before any of it is read, and says which limit. CI's lint job
// runs one hundred times V-10 too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCALE_BUDGETS } from '../scripts/benchmarks/scale-budgets.mjs';
import { STEPS, hugeBlock, measureMedian, overBudget } from '../scripts/scale-benchmark.mjs';
import { PARTS_LIMITS } from '../packages/core/src/layout-limits.ts';
import { MeshIndex, memoryBackend } from '../packages/core/src/mesh-index.ts';
import { partsRefusal, storedGraphs } from '../packages/core/src/store-drawing.ts';

const fenced = (block) => `\`\`\`gql\n${block}\n\`\`\`\n`;

test('ten times the V-10 graph opens in parts, is filtered and has a group opened, within budget', async () => {
  const { parts, parts_filter } = STEPS;
  const r = await measureMedian(hugeBlock(), 10, { parts, parts_filter });
  assert.match(r.steps.parts.outcome, /^done: 26660 things in \d+ groups$/);
  assert.match(r.steps.parts_filter.outcome, /^done: \d+ facets, a group of \d+ things and \d+ links$/);
  // the time is the middle of three runs, so one slow moment on a busy machine cannot fail it.
  // Memory is measured only where garbage is collected first (--expose-gc), as in CI's lint run: here only the time
  assert.deepEqual(
    overBudget([r]).filter((line) => !line.includes(' MB kept')),
    [],
  );
});

test('the parts steps have a budget at ten and one hundred times V-10', () => {
  for (const name of ['parts', 'parts_filter'])
    for (const s of [1, 10, 100]) assert.ok(SCALE_BUDGETS[name]?.[s], `${name} at ${s}×`);
});

test('a note past the in-parts limit is refused before any of it is read, naming the limit', async () => {
  const lines = fenced(
    ['// graph: huge', ...Array.from({ length: PARTS_LIMITS.lines }, (_, i) => `(t${i}),`)].join('\n'),
  );
  assert.equal(partsRefusal(lines)?.limit, 'text-lines');
  const unread = memoryBackend();
  unread.put = () => assert.fail('nothing past the in-parts limit is read into the store');
  assert.equal((await storedGraphs(new MeshIndex(unread), 'big.md', lines, () => Promise.resolve())).size, 0);
  const bytes = fenced(`// graph: huge\n(a {name: '${'x'.repeat(PARTS_LIMITS.bytes)}'})`);
  assert.equal(partsRefusal(bytes)?.limit, 'text-bytes');
  assert.equal(partsRefusal(fenced(hugeBlock())), null);
});
