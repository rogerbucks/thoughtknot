// A big graph on the globe, placed by its levels (editor spec §68, globe_levels): layouts/globe-levels.ts. Each subject
// has its own region of the globe, the biggest facing the camera, its things together inside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelWays } from '../src/layouts/globe-levels.ts';
import { GLOBE_FACING, globeSpots } from '../src/layouts/globe.ts';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mean = (ps) => {
  const s = ps.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  const l = Math.hypot(...s) || 1;
  return s.map((v) => v / l);
};

/** Levels of three subjects, of 40, 30 and 20 things, each of two areas. */
function levels() {
  const subject = (name, n) => ({ key: `0:${name}`, name, things: [...Array(n).keys()].map((i) => `${name}${i}`) });
  const subjects = [subject('a', 40), subject('b', 30), subject('c', 20)];
  const areas = subjects.flatMap((s) => {
    const half = Math.ceil(s.things.length / 2);
    return [
      { key: `1:${s.name}1`, name: `${s.name}1`, things: s.things.slice(0, half), parent: s.key },
      { key: `1:${s.name}2`, name: `${s.name}2`, things: s.things.slice(half), parent: s.key },
    ];
  });
  return [
    { name: 'Subjects', groups: subjects },
    { name: 'Areas', groups: areas },
    { name: 'Every item', groups: [] },
  ];
}

// proves: globe_levels
test('each subject has its own region of the globe: next to each thing are things of its own subject', () => {
  const ways = levelWays(levels(), GLOBE_FACING);
  assert.equal(ways.size, 90);
  for (const w of ways.values()) assert.ok(Math.abs(Math.hypot(...w) - 1) < 1e-9, 'on the sphere');
  const all = [...ways];
  let own = 0;
  for (const [k, w] of all) {
    const [nearest] = all.filter(([o]) => o !== k).sort((x, y) => dot(w, y[1]) - dot(w, x[1]))[0];
    if (nearest[0] === k[0]) own++;
  }
  assert.ok(own / all.length > 0.95, `the nearest thing is of the same subject: ${own} of ${all.length}`);
  const a = mean(all.filter(([k]) => k[0] === 'a').map(([, w]) => w));
  assert.ok(dot(a, GLOBE_FACING) > 0.9, 'the biggest subject faces the camera');
});

test('the same levels give the same globe, and one subject gives none', () => {
  assert.deepEqual([...levelWays(levels(), GLOBE_FACING)], [...levelWays(levels(), GLOBE_FACING)]);
  const one = levels();
  one[0].groups = one[0].groups.slice(0, 1);
  assert.equal(levelWays(one, GLOBE_FACING), null);
});

test('a big graph on the globe is laid out by its levels: things in one clump sit together', () => {
  // twelve clumps of twenty, each a ring, the clumps linked in a chain
  const things = [],
    links = [];
  for (let c = 0; c < 12; c++)
    for (let i = 0; i < 20; i++) {
      things.push({ key: `c${c}t${i}` });
      links.push({ from: `c${c}t${i}`, to: `c${c}t${(i + 1) % 20}` });
      if (i === 0 && c) links.push({ from: `c${c}t0`, to: `c${c - 1}t0` });
    }
  const { spots } = globeSpots({ things, links });
  const unit = (p) => p.map((v) => v / Math.hypot(...p));
  let together = 0;
  for (let c = 0; c < 12; c++) {
    const own = things.filter((t) => t.key.startsWith(`c${c}t`)).map((t) => unit(spots.get(t.key)));
    const m = mean(own);
    together += own.filter((w) => dot(w, m) > 0.8).length / own.length;
  }
  assert.ok(together / 12 > 0.9, `each clump in one patch: ${together / 12}`);
});
