// A card dragged to another column of the grid view (editor spec §68, projection_grid). On a kanban board:
// - A card pressed and dragged over another column says the value it would take.
// - Let go there, the value is written as its status in the data block, and the line says it was moved.
// - Let go in its own column, nothing is written.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, settled, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';
import { mouse } from './host/drag-steps.js';

before(() => build());

const PATH = 'Some note.md';
const WORK = `// graph: work
(a:Task {name: 'Plan', status: 'todo'}),
(b:Task {name: 'Build', status: 'todo'}),
(c:Task {name: 'Test', status: 'doing'}),
(a)-[:BEFORE]->(b)`;
const STYLE = "// graph: work_style · STYLE work\n(d1:Diagram {type: 'thoughtknot.diagrams.grid'})";
const NOTE = ['# Board', '', fence(WORK), '', fence(STYLE), ''].join('\n');

/** The board's card, and a way to point at a card's middle in the viewport's pixels. */
async function board() {
  const env = await load({ files: { [PATH]: NOTE } });
  let svgText = '';
  const draw = env.plugin.outside.drawDiagram.bind(env.plugin.outside);
  env.plugin.outside.drawDiagram = async (...a) => {
    const r = await draw(...a);
    if (r && 'svg' in r) svgText = r.svg;
    return r;
  };
  const { el } = await show(env, NOTE, 0);
  await until(() => el.querySelector('svg g.node[data-key]'));
  const { hitAreas } = await import('../../core/src/hits.ts');
  const areas = hitAreas(svgText);
  const vp = el.querySelector('.thoughtknot-viewport'),
    svg = el.querySelector('svg');
  const boxOf = (key) => el.querySelectorAll('g.node').find((g) => g.getAttribute('data-key') === key);
  /** A card's middle, as the viewport's pixels. */
  const middleOf = (key) => {
    const s = areas.shapes.find((x) => x.id === boxOf(key).getAttribute('id'));
    const xs = s.polygons.flat().map(([x]) => x),
      ys = s.polygons.flat().map(([, y]) => y);
    const [x, y] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    const vb = areas.viewBox;
    return {
      clientX: parseFloat(vp.cssProps['--thoughtknot-x']) + ((x - vb.x) * Number(svg.getAttribute('width'))) / vb.width,
      clientY:
        parseFloat(vp.cssProps['--thoughtknot-y']) + ((y - vb.y) * Number(svg.getAttribute('height'))) / vb.height,
    };
  };
  return { env, el, vp, boxOf, middleOf };
}

describe('a card dragged on a kanban board', () => {
  // proves: projection_grid
  test('to another column, says where it would go, then writes that status where the card is written', async () => {
    const { env, el, vp, boxOf, middleOf } = await board();
    try {
      const plan = boxOf('a'),
        over = { ...middleOf('c'), clientY: middleOf('c').clientY + 40 };
      vp.dispatch('pointerdown', mouse(1, plan, middleOf('a')));
      vp.dispatch('pointermove', mouse(1, vp, over));
      const hint = el.querySelector('.thoughtknot-move-hint');
      assert.equal(hint.textContent, 'Move Plan to doing');
      assert.equal(hint.getAttribute('role'), 'status', 'said to a screen reader too');
      vp.dispatch('pointerup', mouse(1, vp, over));
      await until(() => env.state.files.get(PATH).includes("status: 'doing'}),\n(b:"));
      await settled();
      const now = env.state.files.get(PATH);
      assert.ok(now.includes("(a:Task {name: 'Plan', status: 'doing'})"), now);
      assert.ok(now.includes(fence(STYLE)), 'the style block untouched');
      assert.equal(el.querySelector('.thoughtknot-details')?.hidden ?? true, true, 'a drag is not a tap');
    } finally {
      env.uninstall();
    }
  });

  // proves: projection_grid
  test('let go in its own column, writes nothing', async () => {
    const { env, vp, boxOf, middleOf } = await board();
    try {
      const plan = boxOf('a'),
        mid = middleOf('b');
      vp.dispatch('pointerdown', mouse(2, plan, middleOf('a')));
      vp.dispatch('pointermove', mouse(2, vp, { ...mid, clientY: mid.clientY + 40 }));
      vp.dispatch('pointerup', mouse(2, vp, { ...mid, clientY: mid.clientY + 40 }));
      await settled();
      assert.equal(env.state.files.get(PATH), NOTE);
    } finally {
      env.uninstall();
    }
  });
});
