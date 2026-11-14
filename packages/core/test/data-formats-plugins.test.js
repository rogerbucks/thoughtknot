// Format plug-ins (editor spec §67, format_plugin_contracts, format_parallel_views; DF1).
// A sample format, `.mini`, is added as three plug-ins. It draws, lays out and shows where each thing came from.
// The join, the layouts and the cites are not touched. One file gives a graph view and a content view together.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { joinPlaces } from '../src/connectors.ts';
import { formatGraph, formatLayouts, formatViews, pluginFormatOf, registerFormat } from '../src/data-formats-plugins.ts';
import { LAYOUTS, layoutById } from '../src/layouts/layouts.ts';

// the sample format: each line `a > b` is two things and a link between them
const TEXT = 'ann > bob\nbob > cat\n';
const source = { graph: 'team', kind: 'plugin', target: 'Data/team.mini', block: 0 };

const MINI = {
  format: 'Mini',
  extensions: ['mini'],
  source: {
    read: (text) =>
      text.split('\n').flatMap((line, i) => {
        const [from, to] = line.split(' > ');
        return to
          ? [
              { text: `(${from}:Person)`, line: i + 1 },
              { text: `(${to}:Person)`, line: i + 1 },
              { text: `(${from})-[:KNOWS]->(${to})`, line: i + 1 },
            ]
          : [];
      }),
  },
  content: {
    node: (id, name, text) => {
      const lines = text.split('\n').filter(Boolean);
      return {
        width: 120,
        height: 20 * (lines.length + 1),
        marks: [{ kind: 'box', id, of: id, style: 'thing.table', x: 0, y: 0, width: 120, height: 20, shape: 'rect' }],
      };
    },
  },
  // a layout of its own: every thing on a row, in the order given
  layouts: [{ id: 'mini-row', dims: 2, place: (shape) => new Map(shape.things.map((t, i) => [t.key, [i * 100, 0]])) }],
};

/** The shape of the first graph a joined read holds. */
function shapeOfJoined(joined) {
  const g = joined.reading.world.team;
  return {
    things: [...g.nodes.keys()].map((key) => ({ key, text: key, kinds: ['Person'] })),
    links: g.edges.map(([from, type, to]) => ({ from, type, to })),
  };
}

let remove = () => {};
afterEach(() => remove());

describe('format_plugin_contracts', () => {
  test('a sample format added as three plug-ins draws, lays out and shows details, and changes nothing else', () => {
    const layouts = LAYOUTS.length;
    remove = registerFormat(MINI);
    assert.equal(pluginFormatOf('Data/Team.MINI'), MINI);
    assert.equal(LAYOUTS.length, layouts, 'the built-in layouts are as they were');
    const read = formatGraph(source, { found: source.target, text: TEXT });
    assert.ok(!('refused' in read));
    // the join takes it like any place
    const joined = joinPlaces('team', [read]);
    assert.ok(!('refused' in joined));
    assert.deepEqual([...joined.reading.world.team.nodes.keys()].sort(), ['ann', 'bob', 'cat']);
    // details: each thing says which line of the file it came from
    const cites = joined.cites.get('bob');
    assert.equal(cites[0].place, 'Data/team.mini');
    assert.equal(cites[0].line, 1);
    // laid out by a built-in layout and by the layout the format brought
    const shape = shapeOfJoined(joined);
    for (const layout of [layoutById('force', 2), ...formatLayouts()]) {
      const spots = layout.place(shape);
      assert.deepEqual([...spots.keys()].sort(), ['ann', 'bob', 'cat'], layout.id);
    }
    // the content plug-in draws a node with a size
    const { content } = formatViews(source, TEXT);
    assert.equal(content.width, 120);
    assert.ok(content.marks.length > 0);
  });

  test('a file no plug-in reads is refused and says so, and a removed format is gone', () => {
    const none = formatGraph(source, { found: source.target, text: TEXT });
    assert.ok('refused' in none);
    remove = registerFormat(MINI);
    assert.ok(!('refused' in formatGraph(source, { found: source.target, text: TEXT })));
    remove();
    assert.equal(pluginFormatOf('Data/team.mini'), undefined);
    assert.deepEqual(formatLayouts(), []);
  });

  test('a file that is not there is refused as missing', () => {
    remove = registerFormat(MINI);
    const gone = formatGraph(source, { found: source.target, unreadable: 'gone' });
    assert.ok('refused' in gone);
    assert.equal(gone.why, 'missing');
  });
});

describe('format_parallel_views', () => {
  test('one file gives a graph view and a content view, both citing one hash, and one off leaves the other as it was', () => {
    remove = registerFormat(MINI);
    const both = formatViews(source, TEXT);
    assert.ok(both.graph && both.content);
    assert.match(both.version, /^[0-9a-f]{64}$/);
    for (const s of both.graph.statements) assert.equal(s.cite.version, both.version);
    const noGraph = formatViews(source, TEXT, new Set(['graph']));
    const noContent = formatViews(source, TEXT, new Set(['content']));
    assert.equal(noGraph.graph, undefined);
    assert.deepEqual(noGraph.content, both.content);
    assert.equal(noContent.content, undefined);
    assert.deepEqual(noContent.graph, both.graph);
    assert.equal(noGraph.version, both.version);
  });

  test('a change to the file moves the version of every view, and only then', () => {
    remove = registerFormat(MINI);
    const a = formatViews(source, TEXT);
    const same = formatViews(source, TEXT);
    const changed = formatViews(source, `${TEXT}cat > dan\n`);
    assert.equal(same.version, a.version);
    assert.notEqual(changed.version, a.version);
    for (const s of changed.graph.statements) assert.equal(s.cite.version, changed.version);
  });
});

describe('a format with only some plug-ins', () => {
  test('a format with no content plug-in gives no node, and its graph is still read', () => {
    remove = registerFormat({ ...MINI, content: undefined });
    const views = formatViews(source, TEXT);
    assert.equal(views.content, undefined);
    assert.ok(views.graph);
  });
});
