// A view described by six layers (editor spec §68: layout_concept_layers). Roger, 25 Oct 2026: the data's dimensions,
// the filters, the layout strategy and its variables, the projection, the conditional formatting and the painter. Each
// is set in the style graph, and each changes alone.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { readStyle } from '../src/style.ts';
import { VIEW_LAYERS, viewLayers } from '../src/view-layers.ts';
import { paintersFrom, renderFor, spaceMode } from '../src/render-choice.ts';

const DATA = "// graph: work\n(a:Task {name: 'A'}),\n(b:Task {name: 'B'}),\n(c:Person {name: 'C'}),\n(a)-[:NEXT]->(b)";

/** Each layer of the view `plan`, set by its own line. */
const LINES = {
  dimensions: "(d1:Diagram {type: 'radial', view: 'plan', centre: 'a'})",
  filters: "(f1:Filter {keep: 'Kind: Task', view: 'plan'})",
  strategy: "(s1:Shown {view: 'plan', layout_strategy: 'rows', spacing: 2})",
  projection: "(r1:Render {view: 'plan', space: '3d'})",
  formatting: "(l1:Look {view: 'plan', kind: 'Task', colour: 'red', means: 'late'})",
  painter: "(r2:Render {view: 'plan', painter: 'canvas'})",
};
/** The same line, its layer changed. */
const CHANGED = {
  dimensions: "(d1:Diagram {type: 'radial', view: 'plan', centre: 'b'})",
  filters: "(f1:Filter {keep: 'Kind: Person', view: 'plan'})",
  strategy: "(s1:Shown {view: 'plan', layout_strategy: 'spread', spacing: 2})",
  projection: "(r1:Render {view: 'plan', space: '2.5d'})",
  formatting: "(l1:Look {view: 'plan', kind: 'Task', colour: 'green', means: 'late'})",
  painter: "(r2:Render {view: 'plan', painter: 'webgl2'})",
};

/** The style graph of `lines`, read, with its problems. */
function styled(lines) {
  const texts = [DATA, `// graph: work_style · STYLE work\n${Object.values(lines).join(',\n')}`];
  return readStyle(texts, 'work', readNote(texts));
}
/** A layer without where each line was written, which moves as lines change. */
const bare = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'at' ? undefined : x)));

describe('a view is six layers, each set in the style graph (layout_concept_layers)', () => {
  // proves: layout_concept_layers
  test('each layer is read from its own line', () => {
    const { style, problems } = styled(LINES);
    assert.deepEqual(problems, []);
    const l = bare(viewLayers(style, 'plan'));
    assert.deepEqual(Object.keys(l), [...VIEW_LAYERS]);
    assert.deepEqual(l.dimensions, { centre: 'a' });
    assert.deepEqual(l.filters, { keep: { Kind: ['Task'] } });
    assert.equal(l.strategy.options.strategy, 'rows');
    assert.equal(l.strategy.options.spacing, 2);
    assert.deepEqual(l.projection, { type: 'radial', space: '3d' });
    assert.deepEqual(
      l.formatting.looks.map((x) => x.colour),
      ['red'],
    );
    assert.equal(l.painter, 'canvas');
  });

  // proves: layout_concept_layers
  test('each layer changes alone: changing one line changes its layer and no other', () => {
    const before = bare(viewLayers(styled(LINES).style, 'plan'));
    for (const layer of VIEW_LAYERS) {
      const { style, problems } = styled({ ...LINES, [layer]: CHANGED[layer] });
      assert.deepEqual(problems, [], layer);
      const after = bare(viewLayers(style, 'plan'));
      for (const other of VIEW_LAYERS)
        if (other === layer) assert.notDeepEqual(after[other], before[other], `${layer} changed`);
        else assert.deepEqual(after[other], before[other], `${other} kept as ${layer} changed`);
    }
  });

  // proves: layout_concept_layers
  test('a view with nothing set is the whole graph: flat, its strategy picked by its shape, painted by the best', () => {
    const l = viewLayers(styled({}).style, 'plan');
    assert.deepEqual(l.dimensions, {});
    assert.deepEqual(l.filters, {});
    assert.equal(l.strategy.options.strategy, 'auto');
    assert.deepEqual(l.projection, { type: 'network', space: '2d' });
    assert.equal(l.painter, 'auto');
  });
});

describe('a Render sets the space and the painter (layout_concept_layers)', () => {
  // proves: layout_concept_layers
  test("a view's own Render wins key by key over the whole graph's", () => {
    const { style } = styled({
      a: "(r1:Render {space: '3d', painter: 'canvas'})",
      b: "(r2:Render {view: 'plan', space: '2.5d'})",
    });
    assert.deepEqual(renderFor(style), { space: '3d', painter: 'canvas' });
    assert.deepEqual(renderFor(style, 'plan'), { space: '2.5d', painter: 'canvas' });
    assert.deepEqual(renderFor(style, 'other'), { space: '3d', painter: 'canvas' });
  });

  // proves: layout_concept_layers
  test('a space or painter not among theirs, or neither set, is a problem with its fix', () => {
    const { style, problems } = styled({
      a: "(r1:Render {space: '4d'})",
      b: "(r2:Render {painter: 'opengl'})",
      c: '(r3:Render {})',
    });
    assert.deepEqual(style.renders, []);
    assert.deepEqual(
      problems.map((p) => p.message),
      [
        'space must be 2d, 2.5d or 3d',
        'painter must be auto, webgpu, webgl2 or canvas',
        'a Render sets space or painter',
      ],
    );
  });

  // proves: layout_concept_layers
  test('a card opens in its space, and is painted by the painter named or a slower one', () => {
    const { style } = styled({ a: "(r1:Render {view: 'plan', space: '3d', painter: 'webgl2'})" });
    const own = renderFor(style, 'plan');
    assert.equal(spaceMode(own.space), 'balls');
    assert.equal(spaceMode('2.5d'), 'cards');
    assert.equal(spaceMode(renderFor(style, 'other').space), null, 'another view is flat');
    assert.equal(spaceMode(undefined), null);
    const makers = ['webgpu', 'webgl2', 'canvas'];
    assert.deepEqual(paintersFrom(own.painter, makers), ['webgl2', 'canvas']);
    assert.deepEqual(paintersFrom('auto', makers), makers);
    assert.deepEqual(paintersFrom('canvas', makers), ['canvas']);
  });
});
