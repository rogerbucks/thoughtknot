// The View menu's layout options in a drawing Graphviz lays out (editor spec §53, layout_options; §68,
// view_options_everywhere). Roger, 2 Nov 2026: options must work the same in every view. They moved only a network
// our own engine lays out. A tree, flow, lanes, radial or timeline ignored them. So each is written into the source:
// - spacing scales Graphviz's room across a rank (`nodesep`) and between ranks (`ranksep`); link length the second;
// - rounds scale how long it tries to cross fewer links (`mclimit`);
// - a wider or taller shape stretches the drawing that way (`ratio`);
// - with lanes off, a network's kinds lose the column each stands in (graph_svg.py). So our own engine gives none a
//   lane either (layout_kind_lanes). A diagram type's own shape writes no such column.
// Host-free and pure.
import type { GraphDrawing } from './note-reading.ts';
import type { LayoutOptions } from './layouts/layout-options.ts';

/** Rounds to two places, as Graphviz's source is written. */
const two = (v: number) => String(Math.round(v * 100) / 100);
/** The graph line of a source. */
const GRAPH_LINE = /^( {2}graph \[[^\n]*)\];$/m;
/** A column that holds the things of one kind (graph_svg.py). */
const KIND_COLUMN = /^ {2}\{ rank=same; [^\n]*\n/gm;
/** The height to width the View menu's shape stretches a drawing to: wider, or taller. */
const RATIO = { wide: 0.5, tall: 2 } as const;

/**
 * `dot` with the room between things scaled as `options` say, in its graph line. With spacing and link length as they
 * were laid out by default, it is the source as given, byte for byte.
 */
export function spacedSource(dot: string, options?: Partial<LayoutOptions>): string {
  const across = options?.spacing ?? 1,
    along = across * (options?.linkLength ?? 1);
  const rounds = options?.rounds ?? 1,
    aim = options?.shape ?? 'screen';
  const added = [
    ...(rounds === 1 ? [] : [`mclimit=${two(rounds)}`]),
    ...(aim === 'screen' ? [] : [`ratio=${RATIO[aim]}`]),
  ];
  if (across === 1 && along === 1 && !added.length) return dot;
  const times: Record<string, number> = { nodesep: across, ranksep: along };
  return dot.replace(
    GRAPH_LINE,
    (_, line: string) =>
      [
        line.replace(
          /\b(nodesep|ranksep)=([0-9.]+)/g,
          (_all, k: string, v: string) => `${k}=${two(Number(v) * (times[k] ?? 1))}`,
        ),
        ...added,
      ].join(', ') + '];',
  );
}

/**
 * `dot` with the kinds in lanes as the View menu's switch says: on, as given; off, with no kind in a column of its own.
 */
export const lanedSource = (dot: string, drawing: Pick<GraphDrawing, 'kindLanes'>): string =>
  drawing.kindLanes === false ? dot.replace(KIND_COLUMN, '') : dot;
