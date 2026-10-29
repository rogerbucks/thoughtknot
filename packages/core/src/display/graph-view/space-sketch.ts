// The drawings over a graph (editor spec §70), in the view in space. They are placed on the marks read from the flat
// drawing's SVG, and lifted onto the blocks they are pinned to. Each is painted in the colour it is drawn in flat.
import { sketchInSpace, sketchMarks } from '../../sketch-marks.ts';
import type { DrawMark } from '../../drawing-marks.ts';
import type { MarkPoint } from '../../plugin-diagrams.ts';
import type { SpaceMarks } from '../../space-view.ts';
import type { Sketch } from '../../sketch.ts';
import type { Paint, Paints } from './mark-painter.ts';
import { marksOfSvg } from './svg-marks.ts';

export type { Sketch };

/**
 * The space with the drawings over its graph laid in it, as `sketch` gives them now. The space as it was when there are
 * none, and for an overview (`from` holds its own marks), which has no drawings.
 */
export function sketchedSpace(
  space: SpaceMarks,
  from: SVGSVGElement | { marks: DrawMark[] },
  sketch: (() => Sketch | null) | undefined,
  marks: readonly DrawMark[],
): SpaceMarks {
  const shown = 'marks' in from ? null : sketch?.();
  if ('marks' in from || !shown?.items.length) return space;
  const svg = from;
  // placed on the marks as read, which sit inside the drawing's transform
  const { pieces } = sketchMarks(shown, marks, insideOf(svg));
  const lifted = sketchInSpace(pieces, space);
  return {
    ...space,
    lines: [...space.lines, ...lifted.lines],
    labels: [...space.labels, ...lifted.labels],
    arrows: [...space.arrows, ...lifted.arrows],
  };
}

/**
 * How a point of the drawing, in its viewBox units, is placed among the marks read from its SVG. Those are read inside
 * the transform Graphviz puts on its graph, as `translate(4 196)`, so a drawing with no pin is moved back by it.
 */
function insideOf(svg: SVGSVGElement): (p: MarkPoint) => MarkPoint {
  const t =
    Array.from(svg.children)
      .find((c) => c.matches('g.graph'))
      ?.getAttribute('transform') ?? '';
  const nums = (s: string) => (s.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const [sx = 1, sy = sx] = nums(/scale\(([^()]*)\)/.exec(t)?.[1] ?? '1');
  const [tx = 0, ty = 0] = nums(/translate\(([^()]*)\)/.exec(t)?.[1] ?? '0 0');
  return ([x, y]) => [x / (sx || 1) - tx, y / (sy || 1) - ty];
}

/**
 * The marks and paints read from the flat drawing (marksOfSvg), with the drawings' own paints (§70). Each style is in the
 * colour its part of the flat drawing is drawn in.
 */
export function sketchPainted(svg: SVGSVGElement): { marks: DrawMark[]; paints: Paints } {
  const { marks, paints } = marksOfSvg(svg);
  const view = svg.ownerDocument.defaultView;
  const known = new Map<string, Paint>();
  const painted = (style: string): Paint => {
    if (style !== 'sketch' && !style.startsWith('sketch.')) return paints(style);
    let paint = known.get(style);
    if (!paint) {
      const part = Array.from(svg.querySelectorAll('g.tk-sketch [data-style]'))
        .find((g) => g.getAttribute('data-style') === style)
        ?.querySelector('[stroke], [fill]');
      const look = part && view ? view.getComputedStyle(part) : null;
      const drawn = look && look.stroke && look.stroke !== 'none' ? look.stroke : look?.fill;
      const colour = (drawn && drawn !== 'none' ? drawn : null) ?? part?.getAttribute('stroke');
      paint = colour ? { line: colour, text: colour, fill: colour } : paints(style);
      known.set(style, paint);
    }
    return paint;
  };
  return { marks, paints: painted };
}
