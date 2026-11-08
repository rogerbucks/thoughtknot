// The rendering scoreboard (editor spec §73, render_scoreboard). Tested here: the fixed scenes it draws, the counts it
// takes of each picture, and the sheet that puts each picture beside its mockup. The browser part is run by hand, in minutes, so it
// is not run here. Everything it counts is worked out from plain boxes (scripts/render-measure.mjs), and that is
// tested here. Pure: nothing is drawn, and no file is written.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, mockupScene, seeded } from '../scripts/render-scenes.mjs';
import {
  MIN_LABEL_PX,
  countsOf,
  covered,
  cut,
  moved,
  overlaps,
  passes,
  shared,
  tiny,
} from '../scripts/render-measure.mjs';
import { DEVICES, SPACES, ZOOMS, sheetOf } from '../scripts/render-scoreboard.mjs';

const label = (x, y, w, h, text, px = 13) => ({ x, y, w, h, text, px });
const frame = { x: 0, y: 0, w: 400, h: 300 };

describe('the scenes', () => {
  test('the mockup sample has six subjects, 26 areas and about 430 items, each named by subject, area and topic', () => {
    const note = mockupScene();
    const things = note.match(/^\(i\d+:Item \{[^}]*\}\)/gm);
    assert.ok(things.length > 380 && things.length < 480, `${things.length} items`);
    for (const t of things) assert.match(t, /subject: '[^']+', area: '[^']+', topic: '[^']+'/);
    assert.equal(new Set(things.map((t) => /subject: '([^']+)'/.exec(t)[1])).size, 6);
    assert.equal(new Set(things.map((t) => /area: '([^']+)'/.exec(t)[1])).size, 26);
  });

  test('each scene is made the same way every time', () => {
    for (const [name, scene] of Object.entries(SCENES)) assert.equal(scene.note(), scene.note(), name);
    const a = seeded(4),
      b = seeded(4);
    assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  });

  test('each scene is one gql block whose links name only things it holds', () => {
    for (const [name, scene] of Object.entries(SCENES)) {
      const note = scene.note();
      assert.equal(note.match(/```gql/g).length, 1, name);
      const ids = new Set([...note.matchAll(/^\((\w+):\w+ \{/gm)].map((m) => m[1]));
      for (const [, a, b] of note.matchAll(/^\((\w+)\)-\[:\w+\]->\((\w+)\)/gm))
        assert.ok(ids.has(a) && ids.has(b), name);
    }
  });

  test('draws every space at four zoom steps, on a laptop and a phone', () => {
    assert.deepEqual(SPACES, ['2d', '2.5d', '3d', 'globe']);
    assert.equal(ZOOMS.length, 4);
    assert.deepEqual(Object.keys(DEVICES), ['laptop', 'phone']);
  });
});

describe('the counts', () => {
  test('two boxes share the area where they cross, and none when they only touch', () => {
    assert.equal(shared({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), 25);
    assert.equal(shared({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), 0);
  });

  test('labels overlap when they share more than a tenth of the smaller one', () => {
    const labels = [
      label(0, 0, 100, 20, 'a'),
      label(50, 5, 100, 20, 'b'),
      label(300, 0, 50, 20, 'c'),
      label(148, 0, 40, 20, 'd'),
    ];
    assert.deepEqual(overlaps(labels), [['a', 'b']]);
  });

  test('a label is cut when it is partly out of the drawing, and tiny when under the least size', () => {
    const labels = [
      label(390, 10, 30, 14, 'edge'),
      label(10, 10, 30, 14, 'in'),
      label(10, 40, 30, 8, 'small', MIN_LABEL_PX - 1),
      label(900, 0, 30, 8, 'away', 4),
    ];
    assert.deepEqual(
      cut(labels, frame).map((l) => l.text),
      ['edge'],
    );
    assert.deepEqual(
      tiny(labels, frame).map((l) => l.text),
      ['small'],
    );
  });

  test('controls cover the part of the drawing under them, and the marks there', () => {
    const marks = [
      { x: 0, y: 0, w: 100, h: 100, text: 'under' },
      { x: 300, y: 200, w: 50, h: 50, text: 'clear' },
      { x: -100, y: 0, w: 50, h: 50, text: 'off' },
    ];
    const controls = [{ x: -100, y: 0, w: 150, h: 50 }];
    assert.deepEqual(covered(marks, controls, frame), { marks: 1, pixels: 2500 });
    assert.deepEqual(covered(marks, [], frame), { marks: 0, pixels: 0 });
  });

  // proves: render_chrome_slots
  test('on the new rendering’s canvas, the cover is the painted pixels under a control, not the frame under it', () => {
    const marks = [{ x: 300, y: 200, w: 50, h: 50, text: 'clear' }];
    const controls = [{ x: 0, y: 0, w: 150, h: 50 }];
    const reading = { frame, labels: [], marks, controls, iconWords: 0 };
    assert.deepEqual(countsOf(reading).covered, { marks: 0, pixels: 7500 }, 'today: the frame under the control');
    assert.deepEqual(countsOf({ ...reading, paintedUnder: 0 }).covered, { marks: 0, pixels: 0 }, 'a canvas: clear');
    assert.deepEqual(countsOf({ ...reading, paintedUnder: 12 }).covered, { marks: 0, pixels: 12 });
  });

  test('a thing moved when its spot in the drawing shifts by more than a pixel; one that came or went did not', () => {
    const before = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 10, y: 10 }],
      ['gone', { x: 1, y: 1 }],
    ]);
    const after = new Map([
      ['a', { x: 0.5, y: 0 }],
      ['b', { x: 14, y: 10 }],
      ['new', { x: 5, y: 5 }],
    ]);
    assert.deepEqual(moved(before, after), ['b']);
  });

  test('a picture passes only when every count is zero, and a drawing that could not be measured passes no one', () => {
    const clean = { frame, labels: [label(10, 10, 30, 14, 'a')], marks: [], controls: [], iconWords: 0 };
    assert.equal(passes(countsOf(clean), []), true);
    assert.equal(passes(countsOf(clean), ['a']), false);
    assert.equal(passes(countsOf({ ...clean, iconWords: 2 }), []), false);
    assert.equal(passes(countsOf({ frame: null }), []), false);
    assert.equal(passes(countsOf({ ...clean, labels: null }), []), false);
  });
});

describe('the sheet', () => {
  test('names each picture, says whether it passes and shows its counts', () => {
    const counts = countsOf({ frame, labels: [], marks: [], controls: [], iconWords: 0 });
    const html = sheetOf(
      [{ name: 'small-laptop-light-2d-0', scene: 'small', space: '2d', zoom: 0, counts, moved: 0, pass: true }],
      '/out',
    );
    assert.match(html, /1 of 1 pictures pass/);
    assert.match(html, /small-laptop-light-2d-0 PASS/);
    assert.match(html, /<img src="small-laptop-light-2d-0\.png">/);
  });
});
