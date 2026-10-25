// Names on the things in 3D (editor spec §53, space_text_on_face): space-faces.ts. Each name lies on the face of its
// thing the camera sees best, wholly inside it, wrapped and shrunk. One that cannot be read there is left out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facesOnScreen, fitWords } from '../src/space-faces.ts';
import { frameOf } from '../src/space-cards.ts';
import { READABLE_LEAST } from '../src/space-labels.ts';
import { orbitFit, projectPoint, spaceMatrix, spaceOf, zoomBy } from '../src/space-view.ts';

/** One box, 200 wide and 100 deep on the page, lifted 60 tall, with its name. */
function oneBox(text = 'A thing') {
  const marks = [
    { id: 'b', kind: 'box', style: 'thing', of: 'a', x: 0, y: 0, width: 200, height: 100 },
    { id: 'n', kind: 'label', style: 'thing.name', of: 'a', x: 100, y: 50, text, size: 14, anchor: 'middle' },
  ];
  return spaceOf(marks, { by: 'size', sizes: new Map([['b', 1]]) });
}

/** A ball of radius `r` at `x` along the floor, named `text`. */
const ball = (key, x, r, text) => ({
  block: { id: key, style: 'thing', of: key, x: x - r, y: -r, width: 2 * r, depth: 2 * r, floor: 0, tall: 2 * r },
  label: { id: `${key}\nname`, style: 'thing.name', at: [x, 0, r + 14], text, size: 14, of: key },
});
function balls(list) {
  const space = {
    blocks: [],
    lines: [],
    labels: [],
    arrows: [],
    round: true,
    least: [-500, -500, 0],
    most: [500, 500, 200],
  };
  for (const b of list) (space.blocks.push(b.block), space.labels.push(b.label));
  return space;
}

/** The corners of the box round a face's words, on the screen, as the painter lays them. */
function wordCorners(f) {
  const half = f.room / 2,
    tall = (f.rows.length * f.size * 1.2) / 2;
  return [
    [-half, -tall],
    [half, -tall],
    [half, tall],
    [-half, tall],
  ].map(([u, v]) => ({ x: f.x + u * f.across[0] + v * f.down[0], y: f.y + u * f.across[1] + v * f.down[1] }));
}

/** Whether point `p` is inside the shape with corners `poly`, either way round. */
function inside(p, poly) {
  const sides = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  });
  return sides.every((s) => s >= -0.5) || sides.every((s) => s <= 0.5);
}

const W = 800,
  H = 600;
const look = (space, orbit) => spaceMatrix(orbit, W / H, 4000);
const project = (m, p) => projectPoint(m, p, W, H);

// proves: space_text_on_face
test('seen from above, a box wears its name on its top, wholly inside it', () => {
  const space = oneBox();
  const orbit = { ...orbitFit(space, W / H), tilt: Math.PI / 2 - 0.01 };
  const m = look(space, orbit);
  const [face] = facesOnScreen(space, m, W, H);
  assert.ok(face, 'its name is on it');
  assert.deepEqual(face.rows, ['A thing']);
  const b = space.blocks[0],
    top = b.floor + b.tall;
  const corners = [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x + b.width, b.y + b.depth],
    [b.x, b.y + b.depth],
  ].map(([x, y]) => project(m, [x, y, top]));
  for (const c of wordCorners(face)) assert.ok(inside(c, corners), `${c.x},${c.y} is on the top`);
  assert.ok(face.across[0] > 0 && Math.abs(face.across[1]) < 0.05 * face.across[0], 'it reads level');
});

// proves: space_text_on_face
test('seen from low down, the box wears its name on the side facing the camera, never mirrored', () => {
  const space = oneBox();
  const orbit = { ...orbitFit(space, W / H), tilt: 0.05 };
  const m = look(space, orbit);
  const [face] = facesOnScreen(space, m, W, H);
  assert.ok(face);
  // the front side, which faces the camera from the page's foot: its middle is at the box's least y
  const b = space.blocks[0];
  const front = [
    [b.x, b.floor],
    [b.x + b.width, b.floor],
    [b.x + b.width, b.floor + b.tall],
    [b.x, b.floor + b.tall],
  ].map(([x, z]) => project(m, [x, b.y, z]));
  for (const c of wordCorners(face)) assert.ok(inside(c, front), `${c.x},${c.y} is on the front`);
  assert.ok(face.across[0] * face.down[1] - face.across[1] * face.down[0] > 0, 'not mirrored');
  assert.ok(face.down[1] > 0, 'its rows go down the screen');
});

// proves: space_text_on_face
test('a long name wraps and shrinks to stay inside; one that cannot be read there is left out', () => {
  const fit = fitWords('A rather long name for one small thing', 100, 60, 20, 6);
  assert.ok(fit && fit.rows.length > 1, 'it wraps');
  assert.ok(fit.size < 20, 'it shrinks');
  for (const r of fit.rows) assert.ok(r.length * fit.size * 0.56 <= fit.room + 1e-9);
  assert.ok(fit.rows.length * fit.size * 1.2 <= 60);
  assert.equal(fitWords('Supercalifragilistic', 30, 30, 20, 11), null, 'too small a face to read it on');

  const space = balls([ball('a', 0, 40, 'A rather long name for one small thing')]);
  const far = zoomBy(orbitFit(space, W / H), 0.1);
  assert.deepEqual(facesOnScreen(space, look(space, far), W, H), [], 'far off, the ball is too small to hold it');
  const near = zoomBy(orbitFit(space, W / H), 8);
  const [face] = facesOnScreen(space, look(space, near), W, H);
  assert.ok(face && face.size >= READABLE_LEAST, 'near, it shows at a readable size');
});

// proves: space_text_on_face
test('a ball wears its name on the disc it shows, inside its circle, and one hidden behind another shows none', () => {
  const space = balls([ball('a', 0, 60, 'Near ball'), ball('b', 600, 60, 'Far ball')]);
  // look along the floor from beyond a, so a hides b
  const orbit = { target: [0, 0, 60], distance: 500, turn: Math.PI, tilt: 0.001 };
  const m = look(space, orbit);
  const faces = facesOnScreen(space, m, W, H);
  assert.deepEqual(
    faces.map((f) => f.rows.join(' ')),
    ['Near ball'],
  );
  const [f] = faces;
  const r = (60 * (H / 2 / Math.tan(Math.PI / 8))) / 500;
  for (const c of wordCorners(f)) assert.ok(Math.hypot(c.x - f.x, c.y - f.y) <= r, 'inside its circle');
});

// proves: space_text_on_face
test("in 3D the frame's names are on the things; a link's words, and a picked name with no room, still float", () => {
  const space = balls([ball('a', 0, 40, 'Thing a'), ball('b', 300, 4, 'A name far too long for this')]);
  [space.least, space.most] = [
    [-50, -50, 0],
    [350, 50, 80],
  ];
  space.labels.push({ id: 'w', style: 'words', at: [150, 0, 40], text: 'joins', size: 11, link: 'l' });
  const m = look(space, orbitFit(space, W / H));
  const frame = frameOf(space, m, W, H, space.blocks[1], undefined);
  assert.deepEqual(
    frame.faces.map((f) => f.id),
    ['a\nname'],
  );
  assert.deepEqual(frame.labels.map((l) => l.id).sort(), ['b\nname', 'w']);
  const plain = frameOf(space, m, W, H, null, undefined);
  assert.deepEqual(
    plain.labels.map((l) => l.id),
    ['w'],
    'a name that fits nowhere floats only when picked',
  );
});
