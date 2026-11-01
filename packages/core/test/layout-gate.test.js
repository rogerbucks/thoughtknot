// What an optimised layout is, checked on the repository's own real notes (editor spec §68: layout_checks_gated,
// layout_pick_tried). Roger chose five checks on 28 Oct 2026: readable, meaningful, fast, calm and the same everywhere.
// Each drawing of each note must score what it did then, less a margin. So a change that makes one read worse fails
// before it merges. Fast is counted by work, not time (layout_work_counted). The top two layouts tried on one part
// are in layouts/pick.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readability } from '../src/layouts/readability.ts';
import { ownLaid, groupsIn, kindsIn } from '../src/layouts/own-draw.ts';
import { ownSpots } from '../src/layouts/own-engine.ts';
import { pickLayout, tidiness } from '../src/layouts/pick.ts';
import { SCREEN } from '../src/layouts/folded-rows.ts';
import { readNote } from '../src/drawing.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';
import { ViewState, startingSwitches } from '../src/view-switches.ts';
import { DEFAULT_SETTINGS } from '../src/settings.ts';
import { directions } from '../src/render.ts';
import { loadEngine } from '../src/engine.ts';

const NOTES = [
  ['ethos.gql', 'project_ethos'],
  ['graph-spec.gql', 'requirements'],
  ['architecture.gql', 'project_architecture'],
];

// the least each drawing may score: its scores on 28 Oct 2026, less about 0.1, so the notes may grow a little. Raise a
// row when a change makes it read better; never lower one to let a change in
const FLOORS = {
  'ethos.gql overview LR': { clean: 0.9, clear: 0.98, flow: 0.9, near: 0.9, kinds: 0.9, hubs: 0.9 },
  'ethos.gql overview TB': { clean: 0.9, clear: 0.98, flow: 0.9, near: 0.9, kinds: 0.9, hubs: 0.9 },
  'ethos.gql all LR': { clean: 0.9, clear: 0.98, flow: 0.85, near: 0.5, kinds: 0.35, hubs: 0.4 },
  'ethos.gql all TB': { clean: 0.9, clear: 0.98, flow: 0.65, near: 0.6, kinds: 0.35, hubs: 0.45 },
  'graph-spec.gql overview LR': { clean: 0.6, clear: 0.98, flow: 0.35, near: 0.35, kinds: 0.4, hubs: 0.45 },
  'graph-spec.gql all LR': { clean: 0.1, clear: 0.98, flow: 0.85, near: 0.65, kinds: 0.4, hubs: 0.35 },
  'architecture.gql overview LR': { clean: 0.9, clear: 0.98, flow: 0.1, near: 0.2, kinds: 0.4, hubs: 0.6 },
  'architecture.gql overview TB': { clean: 0.9, clear: 0.98, flow: 0.9, near: 0.2, kinds: 0.4, hubs: 0.6 },
  'architecture.gql all LR': { clean: 0.75, clear: 0.98, flow: 0.75, near: 0.5, kinds: 0.55, hubs: 0.3 },
  'architecture.gql all TB': { clean: 0.75, clear: 0.98, flow: 0.75, near: 0.5, kinds: 0.45, hubs: 0.3 },
};
/** The most a drawing's things may move, on average, when one leaf is taken away, as a share of its diagonal. */
const CALM_MEAN_MOST = 0.08;
/** The most they may move after any one leaf is taken away. */
const CALM_MOST = 0.3;

const engine = await loadEngine();

/** Each drawing our engine makes of `file`'s graph `graph`, folded and in full, each way its rows may run. */
function drawingsOf(file, graph) {
  const text = readFileSync(new URL(`../../../requirements/${file}`, import.meta.url), 'utf8');
  const note = readNote([text]);
  const style = readStyle([text], graph, note);
  const drawing = { ...styledDrawing(note.graphs.get(graph), style.style, note.world[graph]), diagram: undefined };
  const kindOf = new Map(drawing.boxes.map((b) => [b.key, b.kind]));
  return ['overview', 'all'].flatMap((level) => {
    const state = new ViewState({ ...startingSwitches(DEFAULT_SETTINGS, style.style), engine: true });
    state.toDetail(level);
    return directions(state.folded(drawing)).map((d) => ({ level, d, kindOf }));
  });
}

/** How far the things of `a` moved in `b`, on average, once both are lined up by middle and spread: a share of `a`'s diagonal. */
function moved(a, b) {
  const keys = [...a.keys()].filter((k) => b.has(k));
  const mid = (m) => keys.reduce(([x, y], k) => [x + m.get(k)[0] / keys.length, y + m.get(k)[1] / keys.length], [0, 0]);
  const [ma, mb] = [mid(a), mid(b)];
  const spread = (m, [cx, cy]) =>
    Math.sqrt(keys.reduce((t, k) => t + (m.get(k)[0] - cx) ** 2 + (m.get(k)[1] - cy) ** 2, 0) / keys.length);
  const s = spread(a, ma) / spread(b, mb);
  const xs = keys.map((k) => a.get(k)[0]),
    ys = keys.map((k) => a.get(k)[1]);
  const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const off = (k, i) => a.get(k)[i] - ma[i] - (b.get(k)[i] - mb[i]) * s;
  return keys.reduce((t, k) => t + Math.hypot(off(k, 0), off(k, 1)), 0) / keys.length / diagonal;
}

describe('an optimised layout, on the real notes', () => {
  // proves: layout_checks_gated
  test('reads, means and fits a screen at least as well as it did', () => {
    for (const [file, graph] of NOTES)
      for (const { level, d, kindOf } of drawingsOf(file, graph)) {
        const name = `${file} ${level} ${d.rankdir}`;
        const floor = FLOORS[name];
        assert.ok(floor, `${name} has a row of floors`);
        const { marks } = ownLaid(engine.placed(d.dot), d.rankdir, groupsIn(d.dot), {}, kindsIn(d.dot));
        const scores = readability(marks, d.rankdir === 'TB' ? 'TB' : 'LR', kindOf);
        for (const [check, least] of Object.entries(floor))
          assert.ok(scores[check] >= least, `${name}: ${check} ${scores[check].toFixed(2)}, under ${least}`);
        const shape = marks.space.width / marks.space.height;
        assert.ok(
          shape > SCREEN / 2 && shape < SCREEN * 2,
          `${name} is within 1:2 of a screen, not ${shape.toFixed(2)}`,
        );
      }
  });

  // proves: layout_checks_gated
  test('is calm: taking a leaf away moves the rest only a little', () => {
    for (const [file, graph] of [NOTES[0], NOTES[2]]) {
      const { d } = drawingsOf(file, graph).find((x) => x.level === 'all');
      const laid = engine.placed(d.dot);
      const groups = groupsIn(d.dot);
      const before = ownSpots(laid, d.rankdir, undefined, groups).spots;
      const links = new Map();
      for (const m of laid.marks)
        if (m.kind === 'link') for (const e of [m.from, m.to]) links.set(e, (links.get(e) ?? 0) + 1);
      const leaves = [...links]
        .filter(([, n]) => n === 1)
        .map(([k]) => k)
        .slice(0, 5);
      assert.ok(leaves.length, `${file} has a leaf`);
      const moves = leaves.map((leaf) => {
        const marks = laid.marks.filter((m) => m.of !== leaf && m.from !== leaf && m.to !== leaf);
        const left = groups.map((g) => ({ ...g, members: g.members.filter((k) => k !== leaf) }));
        return moved(before, ownSpots({ ...laid, marks }, d.rankdir, undefined, left).spots);
      });
      const mean = moves.reduce((t, m) => t + m, 0) / moves.length;
      assert.ok(mean <= CALM_MEAN_MOST, `${file}: things moved ${mean.toFixed(3)} on average`);
      assert.ok(Math.max(...moves) <= CALM_MOST, `${file}: things moved ${Math.max(...moves).toFixed(3)} at most`);
    }
  });
});

describe('the top two layouts', () => {
  const box = (of) => ({ kind: 'box', id: of, style: 'thing', role: 'thing', of, x: 0, y: 0, width: 120, height: 40 });
  const link = ([from, to]) => ({ kind: 'link', id: `${from} ${to}`, style: 'link', from, to, points: [] });
  // a flow with three links back against it: by the rule, a network
  const LOOPY = [
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'd'],
    ['d', 'e'],
    ['e', 'f'],
    ['f', 'g'],
    ['b', 'e'],
    ['c', 'f'],
    ['d', 'b'],
    ['g', 'c'],
    ['a', 'g'],
  ];
  const keys = [...new Set(LOOPY.flat())];
  const shape = {
    things: keys.map((key) => ({ key, text: key, kinds: [] })),
    links: LOOPY.map(([from, to]) => ({ from, type: '', to })),
  };
  const sizes = new Map(keys.map((k) => [k, [120, 40]]));

  // proves: layout_pick_tried
  test('are both tried near the rule’s line, and the one with fewer crossings kept, saying so', () => {
    assert.deepEqual(pickLayout(shape), { layout: 'stress', why: 'network' });
    const laid = { marks: [...keys.map(box), ...LOOPY.map(link)], space: { width: 0, height: 0 } };
    const drawn = ownSpots(laid, 'LR');
    assert.deepEqual(drawn.pick, { layout: 'layered', why: 'tried' });
    assert.equal(tidiness(shape, sizes, drawn), 2, 'no link crosses another or passes over a box');
    assert.deepEqual(ownSpots(laid, 'LR').spots, drawn.spots, 'the same graph is laid out the same way each time');
  });
});
