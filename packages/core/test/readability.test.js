// How well our own engine's drawings read (editor spec §68: layout_readability_scored, layout_links_routed,
// layout_groups_as_boxes). Its files are layouts/readability.ts, layouts/routed-curve.ts and layouts/grouped.ts. A
// link bends through lanes between boxes. A group is a box round its things. On a real note our drawing scores at
// least as well as Graphviz's.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routedCurve } from '../src/layouts/routed-curve.ts';
import { groupedLayered } from '../src/layouts/grouped.ts';
import { layered } from '../src/layouts/layered.ts';
import { readability } from '../src/layouts/readability.ts';
import { ownMarks, groupsIn } from '../src/layouts/own-draw.ts';
import { directLinks } from '../src/direct-links.ts';
import { fans } from '../src/direct-words.ts';
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

  // proves: layout_links_never_over
  test('a link out of a group, with another of its things in the way, steps past its row to the gutter', () => {
    const blocked = shapeOf(
      ['a', 'b', 'c', 'z'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['a', 'z'],
      ],
    );
    const out = groupedLayered(blocked, sizes, [{ id: 'g', label: 'G', members: ['a', 'b', 'c'] }], 'LR');
    const path = [out.spots.get('a'), ...out.via.get('a\nz'), out.spots.get('z')];
    for (const k of ['b', 'c']) {
      const [x, y] = out.spots.get(k);
      const over = path.slice(1).some(([px, py], i) => {
        const [qx, qy] = path[i];
        const lo = [Math.min(px, qx), Math.min(py, qy)],
          hi = [Math.max(px, qx), Math.max(py, qy)];
        return lo[0] < x + 50 && hi[0] > x - 50 && lo[1] < y + 20 && hi[1] > y - 20;
      });
      assert.ok(!over, `the link a to z runs clear of ${k}`);
    }
  });

  test('a lane keeps straight through its row, and a bend with its straight way blocked takes the nearest free room', () => {
    const laid = groupedLayered(
      shapeOf(
        ['s', 'm', 'n', 't'],
        [
          ['s', 'm'],
          ['m', 'n'],
          ['n', 't'],
          ['s', 't'],
        ],
      ),
      sizes,
      [{ id: 'g', label: 'G', members: ['n'] }],
      'LR',
    );
    const lanes = laid.via.get('s\nt');
    // after the way out of its row, each lane is two bends, one each side of the row it crosses
    for (let i = 1; i + 1 < lanes.length - 1; i += 2) assert.equal(lanes[i][1], lanes[i + 1][1], 'one lane, level');
    const top = Math.min(...[...laid.spots].map(([, [, y]]) => y - 20));
    for (const [, y] of lanes) assert.ok(y > top - 60, 'never far out round the drawing');
  });

  // proves: layout_shared_trunks
  test('links out of one thing share their way until they part, and those between two groups share a lane', () => {
    const tree = layered(
      shapeOf(
        ['a', 'b', 'c', 'd', 'e'],
        [
          ['a', 'b'],
          ['b', 'c'],
          ['c', 'd'],
          ['b', 'e'],
          ['a', 'd'],
          ['a', 'e'],
        ],
      ),
      sizes,
      'LR',
    );
    // a to d and a to e both skip row 1: one way through it
    assert.deepEqual(tree.via.get('a\nd').slice(1, 3), tree.via.get('a\ne').slice(1, 3));
    const out = groupedLayered(
      shapeOf(
        ['a', 'b', 'c', 'z'],
        [
          ['a', 'b'],
          ['b', 'c'],
          ['a', 'z'],
          ['b', 'z'],
        ],
      ),
      sizes,
      [{ id: 'g', label: 'G', members: ['a', 'b', 'c'] }],
      'LR',
    );
    const [p, q] = ['a\nz', 'b\nz'].map((k) => out.via.get(k)[1]);
    assert.equal(p[1], q[1], 'one lane in the gutter for both links to z');
  });

  // proves: layout_screen_shaped
  test('a group of many things in one row folds into bands, and so does the whole, about a screen’s shape', () => {
    for (const way of ['LR', 'TB']) {
      const many = Array.from({ length: 60 }, (_, i) => `t${i}`);
      const star = shapeOf(['hub', ...many, 'lone'], [...many.map((k) => ['hub', k]), ['t0', 'lone']]);
      const big = new Map(['hub', 'lone', ...many].map((k) => [k, [100, 40]]));
      const span = (spots, boxes) => {
        const xs = [...spots.values()].map(([x]) => x),
          ys = [...spots.values()].map(([, y]) => y);
        for (const b of boxes)
          (xs.push(b.x - b.width / 2, b.x + b.width / 2), ys.push(b.y - b.height / 2, b.y + b.height / 2));
        return (Math.max(...xs) - Math.min(...xs) + 100) / (Math.max(...ys) - Math.min(...ys) + 40);
      };
      // the whole: a hub and sixty things, one long row unfolded
      const whole = groupedLayered(star, big, [{ id: 'g', label: 'G', members: ['lone'] }], way);
      // within half and twice a screen's shape, which is 1.6 wide to high
      const shape = span(whole.spots, whole.boxes);
      assert.ok(shape > 0.8 && shape < 3.2, `${way}: the whole is ${shape.toFixed(2)} wide to high`);
      // a group of them, beside a few lone things
      const grouped = groupedLayered(star, big, [{ id: 'g', label: 'G', members: many }], way);
      const b = grouped.boxes[0];
      const boxShape = b.width / b.height;
      assert.ok(boxShape > 0.4 && boxShape < 4, `${way}: the group is ${boxShape.toFixed(2)} wide to high`);
      // no link runs over a box it does not join
      for (const laid of [whole, grouped])
        for (const l of star.links) {
          const path = [laid.spots.get(l.from), ...(laid.via.get(`${l.from}\n${l.to}`) ?? []), laid.spots.get(l.to)];
          for (const [k, [x, y]] of laid.spots) {
            if (k === l.from || k === l.to) continue;
            const over = path.slice(1).some(([px, py], i) => {
              const [qx, qy] = path[i];
              return (
                Math.min(px, qx) < x + 48 &&
                Math.max(px, qx) > x - 48 &&
                Math.min(py, qy) < y + 18 &&
                Math.max(py, qy) > y - 18
              );
            });
            assert.ok(!over, `${way}: ${l.from} to ${l.to} runs clear of ${k}`);
          }
        }
    }
  });

  // proves: layout_links_past_groups
  test('a link past a group runs through the gap inside its border, never round its far side', () => {
    const past = shapeOf(
      ['s', 'm1', 'm2', 'm3', 'm4', 't', 'u', 'v'],
      [
        ['s', 'm1'],
        ['m1', 'm2'],
        ['s', 'm3'],
        ['m3', 'm4'],
        ['m2', 't'],
        ['m4', 't'],
        ['s', 't'],
        ['s', 'u'],
        ['u', 'v'],
        ['v', 't'],
      ],
    );
    const ms = ['m1', 'm2', 'm3', 'm4'];
    const out = groupedLayered(past, sizes, [{ id: 'g', label: 'G', members: ms }], 'LR');
    const b = out.boxes[0];
    const by = out.via.get('s\nt').filter(([x]) => Math.abs(x - b.x) <= b.width / 2);
    assert.ok(by.length, 'the link passes the group');
    for (const [x, y] of by) {
      assert.ok(Math.abs(y - b.y) < b.height / 2, `${x},${y} is inside the border`);
      for (const k of ms) assert.ok(Math.abs(y - out.spots.get(k)[1]) > 20, `${x},${y} is clear of ${k}`);
    }
  });
});

describe('a fan of links', () => {
  const link = (of, from, to) => ({ kind: 'link', id: of, of, from, to, points: [], curve: false });
  const words = (of, text) => ({ kind: 'label', id: `l:${of}`, of, text, x: 0, y: 0, size: 10 });

  // proves: layout_one_label_per_fan
  test('of one type into one thing is labelled once, near that thing; so is one out of one thing', () => {
    const { gone, near } = fans([
      ...[
        ['ab', 'a', 'b'],
        ['cb', 'c', 'b'],
        ['db', 'd', 'b'],
        ['ex', 'e', 'x'],
        ['ey', 'e', 'y'],
        ['fb', 'f', 'b'],
      ].map(([of, from, to]) => link(of, from, to)),
      words('ab', 'meets'),
      words('cb', 'meets'),
      words('db', 'meets'),
      words('ex', 'needs'),
      words('ey', 'needs'),
      words('fb', 'fails'),
    ]);
    assert.deepEqual([...gone].sort(), ['l:cb', 'l:db', 'l:ey']);
    assert.deepEqual(Object.fromEntries(near), { ab: 'to', ex: 'from' });
  });

  test('our own engine draws a fan’s words once, on a real note', async () => {
    const engine = await loadEngine();
    const text = readFileSync(new URL('../../../requirements/graph-spec.gql', import.meta.url), 'utf8');
    const note = readNote([text]);
    const style = readStyle([text], 'requirements', note);
    const drawing = {
      ...styledDrawing(note.graphs.get('requirements'), style.style, note.world.requirements),
      diagram: undefined,
    };
    const state = new ViewState({ ...startingSwitches(DEFAULT_SETTINGS, style.style), engine: true });
    const d = directions({ ...state.folded(drawing), straightFirst: true })[0];
    const laid = ownMarks(engine.placed(d.dot), d.rankdir, groupsIn(d.dot));
    const into = new Map(laid.marks.filter((m) => m.kind === 'link').map((m) => [m.of, m.to]));
    const seen = new Set();
    for (const m of laid.marks)
      if (m.kind === 'label' && into.has(m.of) && m.id.startsWith('l:')) {
        const k = `${into.get(m.of)} ${m.text}`;
        assert.ok(!seen.has(k), `“${m.text}” into ${into.get(m.of)} is drawn once`);
        seen.add(k);
      }
    assert.ok(seen.size > 0, 'some links are labelled');
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
    // a bundle's ends stay in the rows our engine routes them through, never moved over boxes. So its legs run a
    // little longer than Graphviz's, and near may fall short by a little more
    const slack = { clean: 0.02, clear: 0.02, flow: 0.02, near: 0.06 };
    for (const [k, by] of Object.entries(slack))
      assert.ok(own[k] >= gv[k] - by, `${k}: ours ${own[k].toFixed(2)}, Graphviz ${gv[k].toFixed(2)}`);
    assert.ok(own.clear >= 0.995, `no link of ours passes over a box: ${own.clear.toFixed(3)}`);
  });
});
