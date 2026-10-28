// Orientation cues stay in every view (editor spec §25, orientation_cues; ethos principle 8, never disorient the
// user, rule r_cues). It is one check over each projection.
// - 2D: the mini-map shows the whole drawing and outlines where the view is. The selected thing is marked. Both hold
//   when the drawing is laid out again, as the rest glide there round the selected thing, which stays put.
// - 2.5D: the picked card is marked, holds its whole name and is painted over the rest.
// - 3D: the picked ball is ringed and named, from near and from far.
// The 2D card is the built plugin against the stand-ins for the page; the views in space are their pure frames.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from '../packages/obsidian/test/host/load-plugin.js';
import { fence, labelled } from '../packages/obsidian/test/host/notes.js';
import { show } from '../packages/obsidian/test/host/view-notes.js';
import { tapKey } from '../packages/obsidian/test/host/inspector-steps.js';
import { frameOf } from '../packages/core/src/space-cards.ts';
import { spreadSpace } from '../packages/core/src/space-spread.ts';
import { orbitFit, spaceMatrix } from '../packages/core/src/space-view.ts';

before(() => build());

/** A small team and what each of them uses, wide enough to need a mini-map in a narrow note once zoomed in. */
const TEAM = [
  '// graph: team',
  "(ann:Person {name: 'Ann'}), (bob:Person {name: 'Bob'}), (cy:Person {name: 'Cy'}),",
  "(app:Tool {name: 'The billing app'}), (db:Tool {name: 'The customer database'}), (wiki:Tool {name: 'The wiki'}),",
  '(ann)-[:USES]->(app), (ann)-[:USES]->(db), (bob)-[:USES]->(db), (cy)-[:USES]->(wiki), (bob)-[:ASKS]->(ann)',
].join('\n');
/** How long a lay-out may take on a busy runner. */
const LAID = 20000;

const mapOf = (el) => el.querySelector('.thoughtknot-mini-map');
const thing = (el, key) => el.querySelector(`g.node[data-key="${key}"]`);

/** What tells the person where they are in the flat drawing, as it stands. */
function cues(el) {
  const map = mapOf(el);
  return {
    map: !!map && !map.hidden,
    whole: map?.querySelectorAll('.thoughtknot-mini-box').length === el.querySelectorAll('g.node').length,
    where: !!map?.querySelector('rect.thoughtknot-mini-frame'),
    marked: !!thing(el, 'ann')?.hasClass('is-selected'),
  };
}

describe('orientation_cues: every view keeps the cues to where the person is', () => {
  // proves: orientation_cues
  test('2D: the mini-map shows the whole drawing and where the view is, the selection marked, laid out again too', async () => {
    const env = await load({ width: 300 });
    try {
      const { el } = await show(env, fence(TEAM));
      labelled(el, 'Zoom in').click();
      labelled(el, 'Zoom in').click();
      tapKey(el, 'ann');
      assert.deepEqual(cues(el), { map: true, whole: true, where: true, marked: true }, 'as drawn');
      // laid out again, wider apart, by the View menu's spacing slider
      labelled(el, 'View').click();
      const was = thing(el, 'ann'),
        input = el.querySelectorAll('.thoughtknot-layout-option')[0].querySelector('input');
      input.value = String(Number(input.getAttribute('max') ?? 3));
      input.dispatch('change');
      await until(() => thing(el, 'ann') && thing(el, 'ann') !== was, LAID);
      // the rest glide to their new spots (layout_glide), and Ann, selected, stays where she was on the screen
      const gliding = () => [...el.querySelectorAll('g.node')].filter((g) => g.getAttribute('transform'));
      assert.ok(gliding().length > 0, 'the things glide there');
      assert.equal(thing(el, 'ann').getAttribute('transform'), null, 'Ann kept in place');
      assert.deepEqual(cues(el), { map: true, whole: true, where: true, marked: true }, 'laid out again');
      await until(() => !gliding().length, LAID);
    } finally {
      env.uninstall();
    }
  });

  /** Two things and a link between them, as the 2D drawing marks them, picked `a`. */
  const MARKS = [
    { id: 't:a', kind: 'box', style: 'thing', of: 'a', x: 0, y: 0, width: 130, height: 50 },
    { id: 'l:a', kind: 'label', style: 'thing', of: 'a', x: 65, y: 25, text: 'Ann', size: 14, anchor: 'middle' },
    { id: 't:b', kind: 'box', style: 'thing', of: 'b', x: 300, y: 0, width: 90, height: 40 },
    { id: 'l:b', kind: 'label', style: 'thing', of: 'b', x: 345, y: 20, text: 'Bob', size: 14, anchor: 'middle' },
    { id: 'e:ab', kind: 'link', style: 'link', from: 'a', to: 'b', name: 'ASKS', points: [] },
  ];
  const W = 800,
    H = 600;
  /** The view in space as cards or balls, seen fitted, or from `far` times as far. */
  const seen = (cards, far = 1) => {
    const { space } = spreadSpace(MARKS, undefined, cards);
    const fit = orbitFit(space, W / H),
      orbit = { ...fit, distance: fit.distance * far };
    const picked = space.blocks.find((b) => b.of === 'a');
    return frameOf(space, spaceMatrix(orbit, W / H, orbit.distance * 4), W, H, picked);
  };

  // proves: orientation_cues
  test('2.5D: the picked card is marked, holds its whole name and is painted over the rest', () => {
    for (const far of [1, 6]) {
      const { cards } = seen(true, far);
      const a = cards.find((c) => c.block.of === 'a');
      assert.ok(a?.picked, `picked, ${far}× away`);
      assert.equal(a.rows.join(' '), 'Ann', 'its name shows');
      assert.equal(cards.at(-1), a, 'over the rest');
    }
  });

  // proves: orientation_cues
  test('3D: the picked ball is ringed and named, from near and from far', () => {
    for (const far of [1, 6]) {
      const frame = seen(false, far);
      assert.ok(frame.ring && frame.ring.r > 0, `ringed, ${far}× away`);
      const named = [...frame.faces.map((f) => f.id), ...(frame.labels ?? []).map((l) => l.id)];
      assert.ok(
        named.some((id) => id === 'l:a'),
        `named, ${far}× away`,
      );
    }
  });
});
