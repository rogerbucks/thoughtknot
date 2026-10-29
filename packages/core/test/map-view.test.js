// The map view (editor spec §68, projection_map): map-view.ts. A thing with a latitude and longitude sits on a map
// where it is: north up, east right. The rest are listed beside it. The map has lines of latitude and longitude, and
// no tiles are fetched. Each link is a line between its things, and every mark stays inside the space.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapMarks, mapSplit, placeOf } from '../src/view-types/map-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';
import { VIEW_DRAWERS, VIEW_TYPES } from '../src/view-types/view-types.ts';
import { readNote } from '../src/drawing.ts';
import { shapeOf as shapeOfDrawing } from '../src/types-shape.ts';

const SPACE = { width: 600, height: 400 };
/** A shape of things `[key, {property: number}]` and links `[from, to]`. */
const shapeOf = (things, links = []) => ({
  things: things.map(([key, numbers]) => ({
    key,
    text: key.toUpperCase(),
    kinds: ['Place'],
    ...(numbers ? { numbers: new Map(Object.entries(numbers)) } : {}),
  })),
  links: links.map(([from, to]) => ({ from, type: 'NEAR', to })),
});
const CITIES = shapeOf(
  [
    ['london', { lat: 51.5, lon: -0.13 }],
    ['paris', { latitude: 48.86, longitude: 2.35 }],
    ['berlin', { lat: 52.52, lng: 13.4 }],
    ['home', null],
  ],
  [
    ['london', 'paris'],
    ['home', 'berlin'],
  ],
);
const middle = (m) => [m.x + m.width / 2, m.y + m.height / 2];

// proves: projection_map
test('a thing with a latitude and longitude sits where it is, north up and east right, the rest beside the map', () => {
  assert.deepEqual(placeOf(CITIES.things[1]), { lat: 48.86, lon: 2.35 }, 'latitude and longitude by either name');
  assert.equal(
    placeOf({
      key: 'x',
      text: 'X',
      kinds: [],
      numbers: new Map([
        ['lat', 95],
        ['lon', 0],
      ]),
    }),
    null,
  );
  const { placed, rest } = mapSplit(CITIES);
  assert.deepEqual([...placed.keys()], ['london', 'paris', 'berlin']);
  assert.deepEqual(rest, ['home']);
  const marks = mapMarks({ shape: CITIES, space: SPACE });
  const at = (k) => middle(marks.find((m) => m.id === k));
  assert.ok(at('berlin')[0] > at('paris')[0] && at('paris')[0] > at('london')[0], 'east is right');
  assert.ok(at('paris')[1] > at('london')[1] && at('london')[1] > at('berlin')[1], 'north is up');
  const map = marks.find((m) => m.id === 'map');
  assert.ok(at('home')[0] > map.x + map.width, 'a thing with no place is listed beside the map');
  assert.match(marks.find((m) => m.id === 'unplaced').text, /^1 thing with no place$/);
  assert.ok(marks.some((m) => m.id.startsWith('parallel\n')) && marks.some((m) => m.id.startsWith('meridian\n')));
  const links = marks.filter((m) => m.role === 'link');
  assert.equal(links.length, 2, 'a link to a thing with no place is drawn too');
  assert.ok(!marks.some((m) => m.kind === 'image'), 'no map tiles are fetched');
  for (const m of drawMarksOf(marks, SPACE).filter((d) => d.kind === 'box'))
    assert.ok(m.x >= 0 && m.y >= 0 && m.x + m.width <= SPACE.width && m.y + m.height <= SPACE.height, m.id);
  assert.deepEqual(mapMarks({ shape: CITIES, space: SPACE }), marks, 'the same data, the same picture');
});

// proves: projection_map
test('one place alone is shown with its surroundings; no places lists every thing; nothing draws nothing', () => {
  const one = mapMarks({ shape: shapeOf([['a', { lat: 10, lon: 20 }]]), space: SPACE });
  const map = one.find((m) => m.id === 'map');
  assert.ok(map.width > 0 && map.height > 0);
  const none = mapMarks({ shape: shapeOf([['a'], ['b']]), space: SPACE });
  assert.equal(
    none.find((m) => m.id === 'map'),
    undefined,
    'no map with no place',
  );
  assert.match(none.find((m) => m.id === 'unplaced').text, /^2 things with no place$/);
  assert.deepEqual(mapMarks({ shape: shapeOf([]), space: SPACE }), []);
});

// proves: projection_map
test('the map is offered among the views, and reads latitude and longitude from a note', () => {
  assert.ok(VIEW_TYPES.includes('map'));
  const r = readNote([
    "// graph: trip\n(a:Place {name: 'Oslo', lat: 59.91, lon: 10.75}),\n(b:Place {name: 'Bergen', lat: 60.39, lon: 5.32}),\n(a)-[:TO]->(b)",
  ]);
  const shape = shapeOfDrawing(r.graphs.get('trip'), r.world.trip);
  const marks = VIEW_DRAWERS.map({ shape, space: SPACE });
  const box = (k) => marks.find((m) => m.id === k);
  assert.ok(middle(box('a'))[0] > middle(box('b'))[0], 'Oslo is east of Bergen');
});
