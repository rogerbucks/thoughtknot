// What a part of a graph looks like, read before it is laid out (editor spec §68: layout_kinds_read). The pick, said in
// plain words (layout_pick_said). Its file is layouts/fingerprint.ts; own-draw.ts carries the pick on the SVG.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PICK_ATTRIBUTE, kindsOf, pickSaid, pickShownOf } from '../src/layouts/fingerprint.ts';
import { readNote } from '../src/drawing.ts';
import { draw } from '../src/render.ts';
import { loadEngine } from '../src/engine.ts';

/** A shape of things by key and kind, and links `[from, to]`. */
const shapeOf = (things, links) => ({
  things: Object.entries(things).map(([key, kind]) => ({ key, text: key, kinds: [kind] })),
  links: links.map(([from, to]) => ({ from, type: 'LINKS', to })),
});

describe('how the kinds of a part link', () => {
  // proves: layout_kinds_read
  test('in order, two-sided, clustered or plain, read from the links', () => {
    const ordered = shapeOf({ r1: 'Requirement', r2: 'Requirement', t1: 'Test', t2: 'Test', c1: 'Code', c2: 'Code' }, [
      ['r1', 't1'],
      ['r2', 't2'],
      ['t1', 'c1'],
      ['t2', 'c2'],
      ['r1', 'c2'],
    ]);
    assert.deepEqual(kindsOf(ordered), { pattern: 'ordered', order: ['Requirement', 'Test', 'Code'] });
    const sides = shapeOf({ ann: 'Person', bob: 'Person', x: 'Project', y: 'Project' }, [
      ['ann', 'x'],
      ['bob', 'x'],
      ['bob', 'y'],
    ]);
    assert.deepEqual(kindsOf(sides), { pattern: 'two-sided', order: ['Person', 'Project'] });
    const clustered = shapeOf({ a: 'A', b: 'A', c: 'A', d: 'B', e: 'B', f: 'B', g: 'C', h: 'C' }, [
      ['a', 'b'],
      ['b', 'c'],
      ['d', 'e'],
      ['e', 'f'],
      ['g', 'h'],
      ['c', 'd'],
    ]);
    assert.equal(kindsOf(clustered).pattern, 'clustered');
    const one = shapeOf({ a: 'Note', b: 'Note' }, [['a', 'b']]);
    assert.equal(kindsOf(one).pattern, 'plain');
    // a kind the drawing gives wins over the thing's own
    assert.equal(kindsOf(one, new Map([['a', 'Idea']])).pattern, 'two-sided');
  });
});

describe('the pick, said', () => {
  // proves: layout_pick_said
  test('says how, why, the parts, the loose things and the kinds, in plain words', () => {
    assert.equal(
      pickSaid({ why: 'flow', kinds: 'ordered', order: ['Requirement', 'Test'], parts: 3, loose: 1 }),
      'Laid out in rows as a flow: its links mostly run one way. 3 parts, packed to the screen. ' +
        '1 thing with no link sits in the tray. Its kinds link in order: Requirement → Test.',
    );
    assert.equal(
      pickSaid({ why: 'network', kinds: 'plain', order: [], parts: 1, loose: 0 }),
      'Spread out as a network: its links run every way.',
    );
    assert.equal(pickShownOf('%7B%22why%22%3A%22nonsense%22%7D'), undefined, 'a reason it does not know is never said');
    assert.equal(pickShownOf('not json'), undefined);
    assert.equal(pickShownOf('%E0%A4%A'), undefined, 'nor a broken encoding');
  });

  // proves: layout_pick_said
  test('rides on the drawing our engine makes, read back as it was picked', async () => {
    const g = readNote([
      [
        '// graph: g',
        "(r1:Requirement {name: 'R1'}), (r2:Requirement {name: 'R2'}), (t1:Test {name: 'T1'}), (t2:Test {name: 'T2'}),",
        "(c1:Code {name: 'C1'}), (c2:Code {name: 'C2'}), (note:Note {name: 'Loose'}),",
        '(r1)-[:PROVED_BY]->(t1), (r2)-[:PROVED_BY]->(t2), (t1)-[:TESTS]->(c1), (t2)-[:TESTS]->(c2), (r1)-[:BUILT_IN]->(c2)',
      ].join('\n'),
    ]).graphs.get('g');
    const { svg } = draw({ ...g, engine: 'own' }, await loadEngine());
    const attribute = new RegExp(`<svg[^>]*\\b${PICK_ATTRIBUTE}="([^"]*)"`).exec(svg)?.[1];
    assert.ok(attribute, 'the SVG carries the pick');
    const shown = pickShownOf(
      attribute
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&'),
    );
    assert.equal(shown.kinds, 'ordered');
    assert.deepEqual(shown.order, ['Requirement', 'Test', 'Code']);
    assert.equal(shown.loose, 1);
    assert.equal(shown.parts, 1);
  });
});
