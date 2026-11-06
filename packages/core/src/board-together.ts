// A board edited with other people (editor spec §45, board_live_together, board_presence). A host that shares a board
// gives the screen a seat. The seat says who else is here and what they point at. It also makes a change in the
// person's name. The screen draws the others over the board and never writes them to the note. Nothing moves on its
// own. Pure and host-free.
import type { Board } from './board.ts';
import type { BoardChange } from './board-edit.ts';
import { marks, others, SHAPES } from './board-presence.ts';
import type { Mark, Peer } from './board-presence.ts';
import { itemBox } from './board-svg.ts';
import { isolated } from './bidi.ts';
import { STYLE } from './layout.ts';
import type { Palette } from './palette.ts';
import { STYLE_HUES } from './style-graph.ts';

/** Where a person is on the board right now, as they tell the others. */
export interface Here {
  pointer?: [number, number];
  selection: string[];
}

/** One person's seat at a shared board, as the host hands it to the screen. */
export interface Together {
  /** The id of this person among the people here. */
  me: string;
  /** The people here now, this person among them. */
  peers(): Peer[];
  /** Tells the others where this person is. It is never written to the note. */
  announce(here: Here): void;
  /**
   * Calls `changed` when someone arrives, moves or leaves, or the board is changed by someone else. `changed` says
   * false once the screen that asked is gone, and then it is not called again.
   */
  watch(changed: () => boolean): void;
  /** The board block as it is now, with what the others wrote. */
  text(): string;
  /** Makes the change as this person: why it was refused, in words, or nothing when it was made. */
  change(change: BoardChange): Promise<string | undefined>;
}

const escaped = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const num = (x: number) => String(Math.round(x * 100) / 100);

/** A shape of the given size centred on a spot, as an SVG path. */
function shapeAt(shape: Mark['shape'], x: number, y: number, r: number): string {
  const p = (pts: [number, number][]) => `M${pts.map(([a, b]) => `${num(x + a * r)} ${num(y + b * r)}`).join('L')}z`;
  switch (shape) {
    case 'circle':
      return `M${num(x - r)} ${num(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
    case 'square':
      return p([
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]);
    case 'triangle':
      return p([
        [0, -1],
        [1, 1],
        [-1, 1],
      ]);
    case 'diamond':
      return p([
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]);
    case 'star':
      return p([
        [0, -1],
        [0.3, -0.3],
        [1, -0.2],
        [0.45, 0.25],
        [0.6, 1],
        [0, 0.55],
        [-0.6, 1],
        [-0.45, 0.25],
        [-1, -0.2],
        [-0.3, -0.3],
      ]);
    case 'cross':
      return p([
        [-0.35, -1],
        [0.35, -1],
        [0.35, -0.35],
        [1, -0.35],
        [1, 0.35],
        [0.35, 0.35],
        [0.35, 1],
        [-0.35, 1],
        [-0.35, 0.35],
        [-1, 0.35],
        [-1, -0.35],
        [-0.35, -0.35],
      ]);
  }
}

/** A person's mark drawn on a spot: its shape in their colour, then their initial. */
function markAt(m: Mark, x: number, y: number, colour: string, palette: Palette): string {
  const r = 7;
  return (
    `<path d="${shapeAt(m.shape, x, y, r)}" fill="${colour}" stroke="${palette.text}" stroke-width="1"/>` +
    `<text x="${num(x)}" y="${num(y)}" font-family="${STYLE.font}" font-size="9" text-anchor="middle" dominant-baseline="central" fill="${palette.page ?? '#fff'}">${isolated(escaped(m.initial))}</text>`
  );
}

/**
 * The others on the board, drawn as one group to lay over the board's picture, in board units. Each person has a
 * mark of their own, a shape and an initial as well as a colour. Their pointer wears the mark, and so does a ring
 * around each item they have selected. People unheard from for too long are left out. The group is for the eye alone.
 */
export function presenceSvg(board: Board, peers: Peer[], me: string, palette: Palette, now: number): string {
  const here = others(peers, me, now);
  const marked = marks(here);
  const boxes = new Map(board.items.map((i) => [i.id, itemBox(i)]));
  const parts = here.flatMap((p, i) => {
    const m = marked.get(p.id);
    if (!m) return [];
    const colour = palette.blend(STYLE_HUES[i % STYLE_HUES.length] ?? 'blue', STYLE.line_mix);
    const rings = p.selection.flatMap((id) => {
      const b = boxes.get(id);
      if (!b) return [];
      return [
        `<rect x="${num(b.x - 3)}" y="${num(b.y - 3)}" width="${num(b.w + 6)}" height="${num(b.h + 6)}" rx="4" fill="none" stroke="${colour}" stroke-width="2" stroke-dasharray="${SHAPES.indexOf(m.shape) % 2 ? '2 3' : '6 3'}"/>`,
        markAt(m, b.x - 3, b.y - 3, colour, palette),
      ];
    });
    const pointer = p.pointer ? [markAt(m, p.pointer[0], p.pointer[1], colour, palette)] : [];
    return [`<g data-peer="${escaped(p.id)}" data-shape="${m.shape}">${[...rings, ...pointer].join('')}</g>`];
  });
  return `<g class="thoughtknot-presence" aria-hidden="true" pointer-events="none">${parts.join('')}</g>`;
}
