// The map view (editor spec §68, projection_map). A thing that carries a place, its latitude and longitude as numbers,
// is put on a map where it is. The rest are listed beside it. The map is the place the things cover, with a little room
// round them, drawn with lines of latitude and longitude. No map tiles are fetched: nothing is sent to anyone to draw
// it. Each link is a line between its two things. It is drawn as marks (drawing-marks.ts), so every painter draws it
// the same way.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import type { GraphShape, ShapeThing } from '../types-shape.ts';
import { word } from '../words.ts';

/** The property names a latitude and a longitude go by, as people write them. */
const LATITUDES = ['lat', 'latitude'];
const LONGITUDES = ['lon', 'lng', 'long', 'longitude'];
/** The least span of the map, in degrees, so one place alone is shown with its surroundings. */
const LEAST_SPAN = 1;
/** The share of the span kept clear round the places, so none sits on the map's edge. */
const ROOM_SHARE = 0.15;
/** The share of the space the list of things with no place takes, where there are any. */
const LIST_SHARE = 0.24;
/** The steps, in degrees, the lines of latitude and longitude may be drawn at. */
const STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 45];
/** About this many lines each way. */
const LINES = 5;

/** Where thing `t` is, as latitude and longitude in degrees, or null when it carries no place, or one off the globe. */
export function placeOf(t: ShapeThing): { lat: number; lon: number } | null {
  const first = (names: string[]) =>
    names.map((n) => t.numbers?.get(n)).find((v): v is number => typeof v === 'number');
  const lat = first(LATITUDES),
    lon = first(LONGITUDES);
  if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** The places of `shape`'s things, by key, and the keys of those with none, in the order written. */
export function mapSplit(shape: GraphShape): { placed: Map<string, { lat: number; lon: number }>; rest: string[] } {
  const placed = new Map<string, { lat: number; lon: number }>(),
    rest: string[] = [];
  for (const t of shape.things) {
    const p = placeOf(t);
    if (p) placed.set(t.key, p);
    else rest.push(t.key);
  }
  return { placed, rest };
}

/** The step for lines across `span` degrees: about LINES of them. */
const stepFor = (span: number): number => STEPS.find((s) => span / s <= LINES) ?? 45;

/** The marks of `shape` drawn as a map in `space`: a dot where each thing is, the rest listed, a line per link. */
export function mapMarks({ shape, space }: DiagramGiven): DrawMark[] {
  if (!shape.things.length) return [];
  const { placed, rest } = mapSplit(shape);
  const nameSize = Math.min(12, Math.max(space.height * 0.025, 7));
  const listWidth = rest.length ? space.width * (placed.size ? LIST_SHARE : 1) : 0;
  const mapWidth = space.width - listWidth;
  const marks: DrawMark[] = [];
  const at = new Map<string, [number, number]>();
  const text = new Map(shape.things.map((t) => [t.key, t.text]));
  if (placed.size) {
    const lats = [...placed.values()].map((p) => p.lat),
      lons = [...placed.values()].map((p) => p.lon);
    const mid = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 };
    // a degree of longitude is shorter away from the equator: so it is drawn, and the map keeps its shape
    const squeeze = Math.max(Math.cos((mid.lat * Math.PI) / 180), 0.1);
    const spanLat = Math.max(Math.max(...lats) - Math.min(...lats), LEAST_SPAN) * (1 + 2 * ROOM_SHARE),
      spanLon = Math.max(Math.max(...lons) - Math.min(...lons), LEAST_SPAN) * (1 + 2 * ROOM_SHARE);
    const head = nameSize * 2;
    const per = Math.min(mapWidth / (spanLon * squeeze), (space.height - head) / spanLat);
    const [w, h] = [spanLon * squeeze * per, spanLat * per];
    const [left, top] = [(mapWidth - w) / 2, head + (space.height - head - h) / 2];
    const x = (lon: number) => left + (lon - (mid.lon - spanLon / 2)) * squeeze * per,
      y = (lat: number) => top + (mid.lat + spanLat / 2 - lat) * per;
    marks.push({
      kind: 'group',
      id: 'map',
      style: 'group',
      x: left,
      y: top,
      width: w,
      height: h,
      role: 'group',
      name: word('view.map'),
      z: -2,
    });
    const lines = (from: number, to: number) => {
      const s = stepFor(to - from),
        out: number[] = [];
      for (let v = Math.ceil(from / s) * s; v <= to; v += s) out.push(Number((Math.round(v / s) * s).toFixed(2)));
      return out;
    };
    lines(mid.lat - spanLat / 2, mid.lat + spanLat / 2).forEach((lat, i) => {
      marks.push({
        kind: 'link',
        id: `parallel\n${i}`,
        style: 'group',
        points: [
          [left, y(lat)],
          [left + w, y(lat)],
        ],
        headless: true,
        z: -1,
      });
      marks.push({
        kind: 'label',
        id: `latitude\n${i}`,
        style: 'text',
        x: left + 2,
        y: y(lat) - 2,
        text: `${lat}°`,
        size: nameSize * 0.7,
        anchor: 'start',
        maxWidth: w,
      });
    });
    lines(mid.lon - spanLon / 2, mid.lon + spanLon / 2).forEach((lon, i) => {
      marks.push({
        kind: 'link',
        id: `meridian\n${i}`,
        style: 'group',
        points: [
          [x(lon), top],
          [x(lon), top + h],
        ],
        headless: true,
        z: -1,
      });
      marks.push({
        kind: 'label',
        id: `longitude\n${i}`,
        style: 'text',
        x: x(lon),
        y: top - nameSize / 3,
        text: `${lon}°`,
        size: nameSize * 0.7,
        anchor: 'middle',
        maxWidth: w,
      });
    });
    for (const [k, p] of placed) at.set(k, [x(p.lon), y(p.lat)]);
  }
  if (rest.length) {
    const left = mapWidth + nameSize;
    marks.push({
      kind: 'label',
      id: 'unplaced',
      style: 'text',
      x: left,
      y: nameSize * 1.5,
      text: word('view.map.unplaced', { count: rest.length }),
      size: nameSize,
      anchor: 'start',
      maxWidth: listWidth - 2 * nameSize,
    });
    const row = Math.min(nameSize * 2, (space.height - nameSize * 3) / rest.length);
    rest.forEach((k, i) => at.set(k, [left + row / 2, nameSize * 3 + row * (i + 0.5)]));
  }
  const dot = Math.min(nameSize, Math.max(space.height * 0.012, 3));
  for (const t of shape.things) {
    const [cx, cy] = at.get(t.key) ?? [0, 0];
    marks.push({
      kind: 'box',
      id: t.key,
      of: t.key,
      style: 'thing',
      x: cx - dot / 2,
      y: cy - dot / 2,
      width: dot,
      height: dot,
      shape: 'ellipse',
      role: 'thing',
      name: t.text,
    });
    marks.push({
      kind: 'label',
      id: `${t.key}\nlabel`,
      of: t.key,
      style: 'text',
      x: cx + dot,
      y: cy + nameSize / 3,
      text: t.text,
      size: nameSize * 0.85,
      anchor: 'start',
      maxWidth: placed.has(t.key) ? mapWidth / 4 : listWidth - 3 * nameSize,
    });
  }
  shape.links.forEach((l, i) => {
    const a = at.get(l.from),
      b = at.get(l.to);
    if (!a || !b || l.from === l.to) return;
    marks.push({
      kind: 'link',
      id: `link\n${i}`,
      style: 'link',
      points: [a, b],
      from: l.from,
      to: l.to,
      role: 'link',
      name: `${text.get(l.from)} ${l.type} ${text.get(l.to)}`,
      z: -1,
    });
  });
  return marks;
}
