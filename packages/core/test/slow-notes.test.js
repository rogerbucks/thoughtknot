// The slowest real notes, kept as fixtures, each with a limit (editor spec §68, layout_real_fixtures). Roger, 25 Oct
// 2026. The graph spec's requirements (329 things then, 334 now) timed out in his vault. The editor's own requirements
// are the slowest note in the repository: 1,757 things when kept. Each is laid out as the plug-in lays it out, folded
// and in full. A test counts work, never time (quality_ratchet). So each limit is the work its link passes may count,
// its figures when kept and a quarter more. A change that makes one slow fails before it merges. So does one that
// would show it as text: every thing is drawn, by our own engine.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readNote } from '../src/drawing.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';
import { ViewState, startingSwitches } from '../src/view-switches.ts';
import { DEFAULT_SETTINGS } from '../src/settings.ts';
import { directions } from '../src/render.ts';
import { loadEngine } from '../src/engine.ts';
import { ownSpots } from '../src/layouts/own-engine.ts';
import { groupsIn, kindsIn } from '../src/layouts/own-draw.ts';
import { directLinks } from '../src/direct-links.ts';
import { WORK_MOST, linkWork } from '../src/layout-work.ts';

/** Each note kept, its graph, and the most work each of its link passes may count, folded and in full. */
const NOTES = [
  {
    file: 'graph-spec-334.gql',
    graph: 'requirements',
    overview: { crowded: 0, settle: 9_000, bends: 260_000, words: 8_000 },
    all: { crowded: 0, settle: 5_000, bends: WORK_MOST.bends, words: 30_000 },
  },
  {
    file: 'editor-requirements-1757.gql',
    graph: 'editor_requirements',
    overview: { crowded: 0, settle: 17_000, bends: 75_000, words: 11_000 },
    all: { crowded: 0, settle: 38_000, bends: WORK_MOST.bends, words: 73_000 },
  },
];

const engine = await loadEngine();

/** The drawing of `file`'s graph `graph` the plug-in lays out at `level`, by our own engine, its rows across. */
function laidOut(file, graph, level) {
  const text = readFileSync(new URL(`fixtures/slow-notes/${file}`, import.meta.url), 'utf8');
  const note = readNote([text]);
  const style = readStyle([text], graph, note);
  const drawing = { ...styledDrawing(note.graphs.get(graph), style.style, note.world[graph]), diagram: undefined };
  const state = new ViewState({ ...startingSwitches(DEFAULT_SETTINGS, style.style), engine: true });
  state.toDetail(level);
  const [d] = directions({ ...state.folded(drawing), engine: 'own', straightFirst: true });
  return { d, things: note.graphs.get(graph).boxes.length };
}

describe('the slowest real notes', () => {
  for (const { file, graph, ...limits } of NOTES)
    for (const level of ['overview', 'all'])
      // proves: layout_real_fixtures, layout_work_counted
      test(`${file}, ${level === 'all' ? 'in full' : 'folded'}: within its limit, every thing drawn by our engine`, () => {
        const { d, things } = laidOut(file, graph, level);
        assert.ok(d.own, 'laid out by our own engine');
        const laid = engine.placed(d.dot);
        const placed = ownSpots(laid, d.rankdir, undefined, groupsIn(d.dot), {}, kindsIn(d.dot));
        const work = linkWork();
        const drawn = directLinks(laid, placed.spots, placed.via, placed.rankdir, false, work);
        for (const [pass, most] of Object.entries(limits[level]))
          assert.ok(work[pass].done <= most, `${pass}: ${work[pass].done} steps, over its limit of ${most}`);
        const boxes = drawn.marks.filter((m) => m.kind === 'box' && m.role === 'thing');
        if (level === 'all') assert.ok(boxes.length >= things, `${boxes.length} of ${things} things drawn`);
        else assert.ok(boxes.length > 0);
        const links = laid.marks.filter((m) => m.kind === 'link').length;
        assert.equal(drawn.marks.filter((m) => m.kind === 'link' && m.curve).length, links, 'every link drawn');
      });
});
