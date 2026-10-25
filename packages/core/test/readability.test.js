// How well our own engine's drawings read (editor spec §68: layout_readability_scored, layout_links_routed,
// layout_groups_as_boxes). Its files are layouts/readability.ts, layouts/routed-curve.ts and layouts/grouped.ts. A
// link bends through lanes between boxes. A group is a box round its things. On a real note our drawing scores at
// least as well as Graphviz's.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routedCurve } from '../src/layouts/routed-curve.ts';
import { groupedLayered } from '../src/layouts/grouped.ts';
import { readability } from '../src/layouts/readability.ts';
import { ownMarks, groupsIn } from '../src/layouts/own-draw.ts';
import { directLinks } from '../src/direct-links.ts';
import { readNote } from '../src/drawing.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';
import { ViewState, startingSwitches } from '../src/view-switches.ts';
import { DEFAULT_SETTINGS } from '../src/settings.ts';
import { directions } from '../src/render.ts';
import { loadEngine } from '../src/engine.ts';

/** A shape of things by key and links `[from, to]`. */
const shapeOf = (keys, links = []) => ({
  things: keys.map((key) => ({ key, text: key.toUpperCase(), kinds: ['Thing'] })),
  links: links.map(([from, to]) => ({ from, type: 'LINKS', to })),
});

const box = (key, x, y) => ({ key, x, y, hw: 50, hh: 20 });

describe('a routed link', () => {
  // proves: layout_links_routed
  test('leaves each box on the side facing its bends and runs through every bend', () => {
    const via = [
      [100, 0],
      [100, 200],
      [300, 200],
    ];
    const c = routedCurve(box('a', 0, 0), box('b', 400, 200), via, 0);
    assert.deepEqual(c.ends, [
      [50, 0],
      [350, 200],
    ]);
    const points = c.cubic(0, 0);
    for (const p of via)
      assert.ok(
        points.some((q) => q[0] === p[0] && q[1] === p[1]),
        `through ${p}`,
      );
    assert.equal(c.tipAt(false)[1], 0, 'the arrowhead points the drawing’s way');
  });
});

describe('groups as boxes', () => {
  const shape = shapeOf(
    ['a', 'b', 'c', 'd', 'e'],
    [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['a', 'e'],
    ],
  );
  const sizes = new Map(shape.things.map((t) => [t.key, [100, 40]]));
  const groups = [
    { id: 'g', label: 'G', members: ['b', 'c'] },
    { id: 'h', label: 'H', members: ['d', 'e'] },
  ];
  const laid = groupedLayered(shape, sizes, groups, 'LR');
  const inside = (b, [x, y]) => Math.abs(x - b.x) + 50 <= b.width / 2 && Math.abs(y - b.y) + 20 <= b.height / 2;

  // proves: layout_groups_as_boxes
  test('keeps each group’s things inside its box, and no two boxes on each other', () => {
    assert.equal(laid.boxes.length, 2);
    for (const g of groups) {
      const b = laid.boxes.find((x) => x.id === g.id);
      for (const k of g.members) assert.ok(inside(b, laid.spots.get(k)), `${k} is inside ${g.id}`);
    }
    const [p, q] = laid.boxes;
    const apart = Math.abs(p.x - q.x) >= (p.width + q.width) / 2 || Math.abs(p.y - q.y) >= (p.height + q.height) / 2;
    assert.ok(apart, 'the two groups do not overlap');
  });

  test('a link into a group bends at the group’s edge', () => {
    const b = laid.boxes.find((x) => x.id === 'g');
    const bends = laid.via.get('a\nb');
    assert.ok(
      bends.some(([x]) => Math.abs(x - (b.x - b.width / 2)) < 1),
      'a bend sits on the left edge of the group',
    );
  });
});

describe('the readability scores', () => {
  const link = (id, from, to, points) => ({ kind: 'link', id, of: id, from, to, points, curve: false });
  const thing = (k, x, y) => ({ kind: 'box', role: 'thing', id: k, of: k, x, y, width: 20, height: 20 });

  // proves: layout_readability_scored
  test('count links that cross, that pass over a box, and that run back', () => {
    const marks = [
      thing('a', 0, 0),
      thing('b', 200, 200),
      thing('c', 0, 200),
      thing('d', 200, 0),
      thing('m', 100, 100),
      link('ab', 'a', 'b', [
        [10, 10],
        [210, 210],
      ]),
      link('dc', 'd', 'c', [
        [210, 10],
        [10, 210],
      ]),
    ];
    const s = readability({ marks, space: { width: 220, height: 220 } }, 'LR');
    assert.equal(s.clean, 0, 'the two links cross');
    assert.equal(s.clear, 0, 'both pass over m');
    assert.equal(s.flow, 0.5, 'one runs back');
  });

  test('a real note drawn by our engine reads at least as well as by Graphviz', async () => {
    const engine = await loadEngine();
    const text = readFileSync(new URL('../../../requirements/graph-spec.gql', import.meta.url), 'utf8');
    const note = readNote([text]);
    const style = readStyle([text], 'requirements', note);
    const drawing = {
      ...styledDrawing(note.graphs.get('requirements'), style.style, note.world.requirements),
      diagram: undefined,
    };
    const kindOf = new Map(drawing.boxes.map((b) => [b.key, b.kind]));
    const scored = (own) => {
      const state = new ViewState({ ...startingSwitches(DEFAULT_SETTINGS, style.style), engine: own });
      const d = directions({ ...state.folded(drawing), straightFirst: true })[0];
      const laid = own ? ownMarks(engine.placed(d.dot), d.rankdir, groupsIn(d.dot)) : directLinks(engine.marks(d.dot));
      return readability(laid, d.rankdir === 'TB' ? 'TB' : 'LR', kindOf);
    };
    const gv = scored(false),
      own = scored(true);
    for (const k of ['clean', 'clear', 'flow', 'near'])
      assert.ok(own[k] >= gv[k] - 0.02, `${k}: ours ${own[k].toFixed(2)}, Graphviz ${gv[k].toFixed(2)}`);
  });
});
