// The options every layout takes (editor spec §53, layout_options): layout-options.ts, and each layout keeping to them.
// Spacing, link length and how tightly groups gather, each a share of the layout's own default, in 2D and 3D.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LAYOUT_OPTIONS, layoutOptions } from '../src/layouts/layout-options.ts';
import { FORCE_2D, FORCE_3D } from '../src/layouts/layouts.ts';
import { layered } from '../src/layouts/layered.ts';
import { groupedLayered } from '../src/layouts/grouped.ts';
import { optionsIn, ownSource } from '../src/layouts/own-draw.ts';

/** A shape of things by key and links `[from, to]`. */
const shapeOf = (keys, links = []) => ({
  things: keys.map((key) => ({ key, text: key, kinds: ['Thing'] })),
  links: links.map(([from, to]) => ({ from, type: 'LINKS', to })),
});
const chain = shapeOf(
  ['a', 'b', 'c', 'd', 'e', 'f'],
  [
    ['a', 'b'],
    ['b', 'c'],
    ['a', 'd'],
    ['d', 'e'],
    ['a', 'f'],
  ],
);
const sizes = new Map(chain.things.map((t) => [t.key, [100, 40]]));
/** The mean length of the links of `shape` between `spots`. */
const meanLink = (shape, spots) =>
  shape.links.reduce((t, l) => {
    const p = spots.get(l.from),
      q = spots.get(l.to);
    return t + Math.hypot(...p.map((v, i) => v - q[i]));
  }, 0) / shape.links.length;

describe('the layout options', () => {
  // proves: layout_options
  test('are spacing, link length and group pull, each kept in its range, the default where missing', () => {
    assert.deepEqual(layoutOptions(), DEFAULT_LAYOUT_OPTIONS);
    assert.deepEqual(layoutOptions({ spacing: 9, linkLength: 0, groupPull: 'tight' }), {
      spacing: 4,
      linkLength: 0.25,
      groupPull: 0.5,
    });
    assert.deepEqual(layoutOptions({ spacing: Number.NaN, groupPull: 1 }), { spacing: 1, linkLength: 1, groupPull: 1 });
  });

  test('rows lay out farther apart for longer links, and things farther apart beside each other for more spacing', () => {
    const at = (options) => layered(chain, sizes, 'LR', undefined, options).spots;
    const plain = at(),
      long = at({ linkLength: 2 }),
      wide = at({ spacing: 3 });
    assert.ok(long.get('b')[0] - long.get('a')[0] > plain.get('b')[0] - plain.get('a')[0], 'rows farther apart');
    const spread = (s) =>
      Math.max(...['b', 'd', 'f'].map((k) => s.get(k)[1])) - Math.min(...['b', 'd', 'f'].map((k) => s.get(k)[1]));
    assert.ok(spread(wide) > spread(plain), 'things in a row farther apart');
  });

  test('a group’s box holds its things more tightly as the pull grows', () => {
    const groups = [{ id: 'g', label: 'G', members: ['b', 'c'] }];
    const box = (groupPull) => groupedLayered(chain, sizes, groups, 'LR', undefined, { groupPull }).boxes[0];
    assert.ok(box(1).width < box(0.5).width && box(0.5).width < box(0).width);
  });

  test('the force layouts, in 2D and 3D, draw links longer as asked', () => {
    for (const layout of [FORCE_2D, FORCE_3D]) {
      const short = meanLink(chain, layout.place(chain, undefined, { linkLength: 0.5 })),
        long = meanLink(chain, layout.place(chain, undefined, { linkLength: 2 }));
      assert.ok(long > short * 1.2, `${layout.id}: ${long} against ${short}`);
    }
  });

  test('travel with the source our engine is given, so a source laid out another way is another source', () => {
    const dot = 'digraph G {\n  a [label="A"];\n}';
    assert.deepEqual(optionsIn(ownSource(dot, { spacing: 2 })), { ...DEFAULT_LAYOUT_OPTIONS, spacing: 2 });
    assert.notEqual(ownSource(dot, { spacing: 2 }), ownSource(dot));
    assert.deepEqual(optionsIn(dot), DEFAULT_LAYOUT_OPTIONS);
  });
});
