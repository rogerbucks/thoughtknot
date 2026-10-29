// Drawing on the card, written to the note (editor spec §70, sketch_drawn). Each drawing made is a change to the
// graph's drawings block. The first one writes the block after the graph. A drawing added, moved or taken away changes
// only its own text. A stroke is thinned before it is written, and a drawing made over a thing is pinned to it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { drawnItem, drawnOn, pinAt, sketchEdit, sketchInNote, thinned } from '../src/sketch-edit.ts';

const NOTE = `# Trip

\`\`\`gql
// graph: trip
(ann:Person), (bob:Person), (ann)-[:KNOWS]->(bob)
\`\`\`

Some words after.
`;

const MARKS = [
  { id: 'g:team', kind: 'group', style: 'group', x: 0, y: 0, width: 400, height: 200 },
  { id: 'n1', kind: 'box', style: 'thing', of: 'ann', x: 20, y: 20, width: 100, height: 40 },
];

const add = (note, item) => {
  const r = sketchEdit(note, 'trip', { add: item });
  assert.ok('note' in r, r.refused);
  return r;
};

describe('the first drawing', () => {
  test('writes the drawings block after the graph, and keeps every other line', () => {
    const r = add(NOTE, { kind: 'Text', x: 5, y: 6, text: 'Ask Bob' });
    assert.equal(r.id, 'd1');
    assert.match(
      r.note,
      /```\n\n```gql\n\/\/ graph: trip_ink · SKETCH ON trip\n\(d1:Text \{x: 5, y: 6, text: 'Ask Bob'\}\)\n```/,
    );
    assert.ok(r.note.startsWith('# Trip\n\n```gql\n// graph: trip\n'));
    assert.ok(r.note.endsWith('\nSome words after.\n'));
    assert.equal(sketchInNote(r.note, 'trip').sketch.items.length, 1);
  });

  test('takes a name no other block has', () => {
    const taken = NOTE.replace('Some words after.', '```gql\n// graph: trip_ink\n(x:Thing)\n```');
    const r = add(taken, { kind: 'Text', x: 0, y: 0, text: 'hi' });
    assert.match(r.note, /graph: trip_ink2 · SKETCH ON trip/);
  });

  test('is refused, in words, for a graph the note does not hold', () => {
    const r = sketchEdit(NOTE, 'elsewhere', { add: { kind: 'Text', x: 0, y: 0, text: 'hi' } });
    assert.match(r.refused, /elsewhere/);
  });
});

describe('later drawings', () => {
  const once = add(NOTE, { kind: 'Text', x: 5, y: 6, text: 'Ask Bob' }).note;
  const commented = once.replace(
    "(d1:Text {x: 5, y: 6, text: 'Ask Bob'})",
    "/// a note kept\n(d1:Text {x: 5, y: 6, text: 'Ask Bob'})",
  );

  test('each join the block with a fresh id, and a comment in it stays', () => {
    const r = add(commented, { kind: 'Shape', shape: 'ellipse', pin: 'ann', x: 0, y: 0 });
    assert.equal(r.id, 'd2');
    assert.match(
      r.note,
      /\/\/\/ a note kept\n\(d1:Text [^\n]*\),\n\(d2:Shape \{x: 0, y: 0, pin: 'ann', shape: 'ellipse'\}\)/,
    );
  });

  test('moved, change only their own text', () => {
    const two = add(commented, { kind: 'Text', x: 1, y: 1, text: 'two' }).note;
    const r = sketchEdit(two, 'trip', { move: 'd1', x: 50.4, y: 60.6 });
    assert.match(
      r.note,
      /\/\/\/ a note kept\n\(d1:Text \{x: 50, y: 61, text: 'Ask Bob'\}\),\n\(d2:Text \{x: 1, y: 1, text: 'two'\}\)/,
    );
  });

  test('taken away, leave the others and their commas right', () => {
    const three = add(add(once, { kind: 'Text', x: 1, y: 1, text: 'two' }).note, {
      kind: 'Text',
      x: 2,
      y: 2,
      text: 'three',
    }).note;
    const middle = sketchEdit(three, 'trip', { remove: 'd2' }).note;
    assert.deepEqual(
      sketchInNote(middle, 'trip').sketch.items.map((i) => i.text),
      ['Ask Bob', 'three'],
    );
    const last = sketchEdit(three, 'trip', { remove: 'd3' }).note;
    assert.deepEqual(
      sketchInNote(last, 'trip').sketch.items.map((i) => i.text),
      ['Ask Bob', 'two'],
    );
    assert.doesNotMatch(last, /,\n```/);
  });

  test('one that is gone is refused, in words', () => {
    assert.match(sketchEdit(once, 'trip', { remove: 'd9' }).refused, /d9/);
  });
});

describe('a drawing made on the card', () => {
  test('a stroke is thinned to the points that keep its shape, its ends kept', () => {
    const line = Array.from({ length: 50 }, (_, i) => [i * 2, 0]);
    assert.deepEqual(thinned(line), [
      [0, 0],
      [98, 0],
    ]);
    const corner = [...line, ...Array.from({ length: 50 }, (_, i) => [98, i * 2])];
    assert.deepEqual(thinned(corner), [
      [0, 0],
      [98, 0],
      [98, 98],
    ]);
  });

  test('begun over a thing, it is pinned to the thing; over a group alone, to the group; else free', () => {
    assert.equal(pinAt(MARKS, [50, 30]).pin, 'ann');
    assert.deepEqual(pinAt(MARKS, [300, 150]), { pin: 'team', centre: [200, 100] });
    assert.equal(pinAt(MARKS, [900, 900]), null);
  });

  test('its place is written from the centre of what it is pinned to', () => {
    const ink = drawnItem(
      { kind: 'Ink' },
      [
        [70, 40],
        [80, 50],
        [90, 40],
      ],
      MARKS,
    );
    assert.deepEqual(
      [ink.pin, ink.x, ink.y, ink.points],
      [
        'ann',
        0,
        0,
        [
          [0, 0],
          [10, 10],
          [20, 0],
        ],
      ],
    );
    const box = drawnItem(
      { kind: 'Shape', shape: 'box' },
      [
        [600, 500],
        [500, 450],
      ],
      MARKS,
    );
    assert.deepEqual([box.pin, box.x, box.y, box.w, box.h], [undefined, 500, 450, 100, 50]);
    const arrow = drawnItem(
      { kind: 'Shape', shape: 'arrow', free: true },
      [
        [50, 30],
        [55, 31],
        [90, 60],
      ],
      MARKS,
    );
    assert.deepEqual(
      [arrow.pin, arrow.x, arrow.y, arrow.points],
      [
        undefined,
        50,
        30,
        [
          [0, 0],
          [40, 30],
        ],
      ],
    );
  });
});

describe('a drawing made by keyboard on the selected thing', () => {
  // proves: sketch_keyboard
  test('each tool draws on the thing: a shape round it, a note above, an arrow at it, a stroke under it', () => {
    const round = drawnOn({ kind: 'Shape', shape: 'ellipse' }, 'ann', MARKS);
    assert.deepEqual(round, { kind: 'Shape', shape: 'ellipse', pin: 'ann', x: 0, y: 0 }, 'no size: it wraps the thing');
    const note = drawnOn({ kind: 'Text', text: 'Ask first' }, 'ann', MARKS);
    assert.deepEqual([note.pin, note.text, note.x, note.y], ['ann', 'Ask first', -50, -28], 'above, from its left');
    const arrow = drawnOn({ kind: 'Shape', shape: 'arrow' }, 'ann', MARKS);
    assert.deepEqual(
      [arrow.x, arrow.y, arrow.points],
      [
        -90,
        -60,
        [
          [0, 0],
          [40, 40],
        ],
      ],
      'ends at its top left corner',
    );
    const ink = drawnOn({ kind: 'Ink' }, 'ann', MARKS);
    assert.deepEqual(
      [ink.x, ink.y, ink.points],
      [
        -50,
        26,
        [
          [0, 0],
          [100, 0],
        ],
      ],
      'under it, as wide',
    );
  });

  // proves: sketch_keyboard
  test('a thing that is not drawn gets nothing', () => {
    assert.equal(drawnOn({ kind: 'Shape', shape: 'box' }, 'bob', MARKS), null);
  });
});
