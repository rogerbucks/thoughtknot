// The View menu's spacing in a drawing Graphviz lays out (editor spec §53, layout_options; §68, view_options_everywhere).
// Roger, 2 Nov 2026: options must work the same in every view. Spacing and link length moved only a network our own
// engine lays out. A tree, flow, lanes, radial or timeline ignored them. Graphviz reads its own room between things:
// `nodesep` across a rank and `ranksep` between ranks. So the View menu scales those two. Spacing scales both; link
// length scales the room between ranks, which the links cross. Host-free and pure.
import type { LayoutOptions } from './layouts/layout-options.ts';

/** Rounds to two places, as Graphviz's source is written. */
const two = (v: number) => String(Math.round(v * 100) / 100);

/**
 * `dot` with the room between things scaled as `options` say, in its graph line. With spacing and link length as they
 * were laid out by default, it is the source as given, byte for byte.
 */
export function spacedSource(dot: string, options?: Partial<LayoutOptions>): string {
  const across = options?.spacing ?? 1,
    along = across * (options?.linkLength ?? 1);
  if (across === 1 && along === 1) return dot;
  const times: Record<string, number> = { nodesep: across, ranksep: along };
  return dot.replace(/^( {2}graph \[[^\n]*)$/m, (line) =>
    line.replace(
      /\b(nodesep|ranksep)=([0-9.]+)/g,
      (_, k: string, v: string) => `${k}=${two(Number(v) * (times[k] ?? 1))}`,
    ),
  );
}
