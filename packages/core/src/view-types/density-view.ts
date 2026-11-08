// The density view (editor spec §36, view_types_offered). The things are laid out as the force-directed view lays them
// out. Then the space is cut into squares, and each square with things in it is shaded by how many. A density view shows
// where a big graph is crowded, when its things are too many to draw one by one. A key at the top says what the shades
// mean. It is drawn as marks (drawing-marks.ts), so every painter draws it the same way.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import { word } from '../words.ts';
import { LETTER } from './fit-text.ts';
import { fitted, forceLayout, type Places } from './force-view.ts';
import { nameSize } from './type-scale.ts';

/** How many squares across the longer side of the space. */
const SQUARES = 24;
/** How many shades there are, from fewest things to most: styles `density.0` to `density.4`. */
export const SHADES = 5;

/** The marks of `shape` drawn as a density view in `space`, starting from `previous` places where it has them. */
export function densityMarks({ shape, space }: DiagramGiven, previous?: Places): DrawMark[] {
  if (!shape.things.length) return [];
  const key = densityKey(space);
  const top = key.height,
    room = space.height - top;
  const at = fitted(forceLayout(shape, previous), space.width, room);
  const side = Math.max(space.width, room) / SQUARES;
  const across = Math.max(1, Math.ceil(space.width / side)),
    down = Math.max(1, Math.ceil(room / side));
  const count = new Map<number, number>();
  for (const [x, y] of at.values()) {
    const c = Math.min(Math.floor(y / side), down - 1) * across + Math.min(Math.floor(x / side), across - 1);
    count.set(c, (count.get(c) ?? 0) + 1);
  }
  const most = Math.max(...count.values());
  const squares = [...count.entries()]
    .sort(([a], [b]) => a - b)
    .map(([c, n]): DrawMark => {
      const col = c % across,
        row = Math.floor(c / across);
      const x = col * side,
        y = top + row * side;
      // shades rise with the count on a log scale, so a few crowded squares do not wash the rest out
      const shade = most === 1 ? SHADES - 1 : Math.round((Math.log(n) / Math.log(most)) * (SHADES - 1));
      return {
        kind: 'box',
        id: `square\n${col}\n${row}`,
        style: `density.${shade}`,
        x,
        y,
        width: Math.min(side, space.width - x),
        height: Math.min(side, space.height - y),
        role: 'group',
        name: word('summary.things', { count: n }),
      };
    });
  return [...squares, ...key.marks];
}

/**
 * Where each thing of `shape` sits in a density view of `space`, by key: the places its squares count. The new stage
 * draws each thing there, over its square (render_every_type).
 */
export function densityPlaces({ shape, space }: DiagramGiven): Map<string, [number, number]> {
  const top = densityKey(space).height;
  const at = fitted(forceLayout(shape), space.width, space.height - top);
  return new Map([...at].map(([k, [x, y]]) => [k, [x, y + top]] as const));
}

/**
 * The key to the shades, at the top end of `space`: "fewer things", a swatch of each shade, then "more". Gives back its
 * marks and the height of the strip it takes, which the squares leave clear.
 */
function densityKey(space: DiagramGiven['space']): { marks: DrawMark[]; height: number } {
  const size = nameSize(space.height * 0.03);
  const middle = size * 1.25,
    gap = size / 2;
  const more = word('view.density.more');
  const end = space.width - size - [...more].length * size * LETTER - gap;
  const start = end - SHADES * size;
  const label = (id: string, text: string, x: number): DrawMark => ({
    kind: 'label',
    id: `key\n${id}`,
    style: 'text',
    x,
    y: middle + size / 3,
    text,
    size,
    anchor: id === 'more' ? 'start' : 'end',
  });
  const swatches = Array.from({ length: SHADES }, (_, i): DrawMark => ({
    kind: 'box',
    id: `key\n${i}`,
    style: `density.${i}`,
    x: start + i * size,
    y: middle - size / 2,
    width: size,
    height: size,
  }));
  const marks = [label('fewer', word('view.density.fewer'), start - gap), ...swatches, label('more', more, end + gap)];
  return { marks, height: size * 2.5 };
}
