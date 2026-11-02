// A view of the core's own laid out again by the View menu (editor spec §68, view_options_everywhere): view-drawn.ts.
// Roger, 2 Nov 2026: options must work the same in every view. Force lays things out itself, so it takes the spacing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pictureAgain } from '../src/display/graph-view/view-drawn.ts';

const picture = (type, asked) => ({
  svg: '<svg>as drawn</svg>',
  type: `thoughtknot.diagrams.${type}`,
  plugin: 'thoughtknot.diagrams',
  width: 600,
  height: 400,
  redraw: async (layout) => (asked.push(layout), `<svg>spaced ${layout.spacing}</svg>`),
});

// proves: view_options_everywhere
test('a force view is drawn again as the View menu spaces it; a matrix stays as drawn', async () => {
  const asked = [];
  assert.equal((await pictureAgain(picture('force', asked), { spacing: 2 })).svg, '<svg>spaced 2</svg>');
  assert.deepEqual(asked, [{ spacing: 2 }]);
  assert.equal((await pictureAgain(picture('matrix', asked), { spacing: 2 })).svg, '<svg>as drawn</svg>');
  assert.equal(asked.length, 1, 'a matrix is not drawn again: its shape is its layout');
  assert.equal(pictureAgain(undefined, { spacing: 2 }), undefined);
});
