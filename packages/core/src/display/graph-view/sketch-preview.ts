// The drawing under way on the card (editor spec §70, sketch_drawn). It is a thin line over the rest while the pointer
// is down, gone once it is let go. A pen draws as it goes; a line or an arrow runs end to end. A box or ellipse is
// shown by its box. It sits at the svg's root, in its viewBox units, as the drawings' layer does (sketch-tool.ts).
import type { MarkPoint } from '../../plugin-diagrams.ts';

const SVG = 'http://www.w3.org/2000/svg';

/** How a drawing under way is shown: as drawn, as its box, or end to end. */
export type PreviewShape = 'pen' | 'box' | 'line';

/** Draws the drawing under way as `points` show it, in `ink`; none, takes it away. */
export function sketchPreview(svg: SVGSVGElement, points: MarkPoint[] | null, shape: PreviewShape, ink: string): void {
  let line = (Array.from(svg.children).find((c) => c.matches('polyline.tk-sketch-preview')) ??
    null) as SVGPolylineElement | null;
  if (!points) return line?.remove();
  if (!line) {
    line = svg.appendChild(activeDocument.createElementNS(SVG, 'polyline'));
    line.setAttribute('class', 'tk-sketch-preview');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', ink);
    line.setAttribute('stroke-width', '2');
  }
  const a: MarkPoint = points[0] ?? [0, 0],
    b: MarkPoint = points[points.length - 1] ?? a;
  const shown: MarkPoint[] =
    shape === 'pen' ? points : shape === 'box' ? [a, [b[0], a[1]], b, [a[0], b[1]], a] : [a, b];
  line.setAttribute('points', shown.map((q) => `${q[0]},${q[1]}`).join(' '));
}
