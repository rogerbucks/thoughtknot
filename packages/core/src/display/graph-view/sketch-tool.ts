// Drawing on the graph (editor spec §70, sketch_drawn, sketch_toggle and sketch_click_rule). The card's tools row holds
// Draw, and Hide drawings once there are some. Draw offers the pen, a box, an ellipse, a line, an arrow and a note.
// - A drag on the drawing draws with the tool chosen. Let go, the drawing is written to the note through the card's host
//   (sketch-edit.ts). One begun on a thing or group is pinned to it, so it moves with it when the layout moves.
// - A note takes its words from the strip, and goes where the drawing is tapped next.
// - Not drawing, a tap on a drawing selects it and says what it is, with Delete. A second tap centres it.
// - Hide drawings hides them all, flat and in space, and Show drawings brings them back.
// The drawings are a layer of the drawing's own SVG, drawn from the shared marks (sketch-marks.ts), in its viewBox units.
import { word } from '@thoughtknot/core';
import type { View, Zoom } from '@thoughtknot/core';
import { drawnMarks, sketchMarks, sketchSvg } from '../../sketch-marks.ts';
import { drawnItem } from '../../sketch-edit.ts';
import type { SketchChange } from '../../sketch-edit.ts';
import type { Sketch, SketchKind, SketchShape } from '../../sketch.ts';
import type { Palette } from '../../palette.ts';
import type { MarkPoint } from '../../plugin-diagrams.ts';
import type { Drawn } from '@thoughtknot/core';
import { MARKED } from './focus-marks';
import { button } from '../button';
import type { Taps } from './taps';
import type { ViewOptions } from './view-options';

/** The drawings over a card's graph, as its host gives them: those in the note now, and how to change them. */
export interface SketchHost {
  sketch: Sketch | null;
  /** The colours the drawings are drawn in, as the host writes the drawing's own. */
  palette: Palette;
  /** Writes one change to the note: resolves to the drawings as the note now holds them, or why not, in words. */
  write: (change: SketchChange) => Promise<{ sketch: Sketch } | { refused: string }>;
}

/** What the drawing tools take of the pointer and keys: each says whether it took the event. */
export interface SketchPointer {
  down: (e: PointerEvent, p: { x: number; y: number }) => boolean;
  move: (e: PointerEvent, p: { x: number; y: number }) => boolean;
  up: (e: PointerEvent, p: { x: number; y: number }) => boolean;
  escape: () => boolean;
}

/** What the tool reads of its card. */
export interface SketchCard {
  sketching: SketchHost;
  svg: () => SVGSVGElement | null;
  drawn: () => Drawn;
  /** The things' keys in the order drawn: node1 is the first. */
  keys: () => string[];
  taps: Taps;
  zoom: () => Zoom;
  readOnly: () => boolean;
}

type Tool = 'pen' | 'box' | 'ellipse' | 'line' | 'arrow' | 'note';
const TOOLS: [Tool, string, { kind: SketchKind; shape?: SketchShape }][] = [
  ['pen', 'pencil', { kind: 'Ink' }],
  ['box', 'square', { kind: 'Shape', shape: 'box' }],
  ['ellipse', 'circle', { kind: 'Shape', shape: 'ellipse' }],
  ['line', 'minus', { kind: 'Shape', shape: 'line' }],
  ['arrow', 'move-up-right', { kind: 'Shape', shape: 'arrow' }],
  ['note', 'sticky-note', { kind: 'Text' }],
];
const SVG = 'http://www.w3.org/2000/svg';
/** How far, in screen pixels, a press may move and still be a tap. */
const SLOP_PX = 10;

/** The part of the layer that draws the drawing `id`. */
const partOf = (root: Element, id: string): Element | null =>
  Array.from(root.querySelectorAll('[data-sketch]')).find((g) => g.getAttribute('data-sketch') === id) ?? null;

/** The svg's own child that `selector` matches: the layer and the preview sit at its root, never inside the drawing. */
const ownChild = (svg: SVGSVGElement, selector: string): Element | null =>
  Array.from(svg.children).find((c) => c.matches(selector)) ?? null;

/** The drawing tools for a card whose host gives it drawings (`ViewOptions.sketching`); none when it gives none. */
export function sketchOn(
  tools: HTMLElement,
  o: ViewOptions,
  card: Omit<SketchCard, 'sketching' | 'keys'>,
): SketchTool | null {
  if (!o.sketching) return null;
  const keys = () => o.reading.graphs.get(o.graph)?.boxes.map((b) => b.key) ?? [];
  return new SketchTool(tools, { ...card, sketching: o.sketching, keys });
}

/** The drawing tools of one card, and the layer they draw on. */
export class SketchTool {
  private readonly el: HTMLElement;
  private sketch: Sketch | null;
  private tool: Tool | null = null;
  private shown = true;
  private selected: string | null = null;
  private stroke: { id: number; points: MarkPoint[]; from: { x: number; y: number } } | null = null;
  private tap: { id: number; x: number; y: number; on: string } | null = null;
  private live: HTMLElement | null = null;
  private note: HTMLInputElement | null = null;

  constructor(
    parent: HTMLElement,
    private readonly card: SketchCard,
  ) {
    this.sketch = card.sketching.sketch;
    this.el = parent.createDiv({
      cls: 'thoughtknot-sketch-tools',
      attr: { role: 'group', 'aria-label': word('sketch.group') },
    });
    this.show();
  }

  /** The drawings as shown now, or none while hidden: the view in space draws these too. */
  shownSketch(): Sketch | null {
    return this.shown ? this.sketch : null;
  }

  /** Whether a tool is chosen, so a drag on the drawing draws rather than pans. */
  get drawing(): boolean {
    return this.tool !== null;
  }

  /** The strip as things stand: Draw and Hide or Show while not drawing; the tools while drawing. */
  show(): void {
    this.el.empty();
    this.live = this.note = null;
    const writes = !this.card.readOnly();
    const some = !!this.sketch?.items.length;
    if (!this.tool) {
      if (writes) button(this.el, word('sketch.start'), 'pencil', () => this.choose('pen'), word('sketch.start'));
      if (some) {
        const label = word(this.shown ? 'sketch.hide' : 'sketch.show');
        const b = button(this.el, label, this.shown ? 'eye-off' : 'eye', () => this.toggle(), label);
        b.setAttribute('aria-pressed', String(!this.shown));
      }
      if (this.selected && writes)
        button(this.el, word('sketch.delete'), 'trash', () => void this.remove(), word('sketch.delete'));
      this.el.hidden = !writes && !some;
      this.live = this.el.createSpan({ cls: 'thoughtknot-walk-said', attr: { 'aria-live': 'polite' } });
      return;
    }
    this.el.hidden = false;
    for (const [tool, icon] of TOOLS) {
      const name = word(`sketch.tool.${tool}`);
      const b = button(this.el, name, icon, () => this.choose(tool), name);
      b.setAttribute('aria-pressed', String(this.tool === tool));
    }
    if (this.tool === 'note')
      this.note = this.el.createEl('input', {
        attr: { type: 'text', 'aria-label': word('sketch.note-text'), placeholder: word('sketch.note-text') },
      });
    button(this.el, word('sketch.stop'), 'check', () => this.choose(null), word('sketch.stop'));
    this.live = this.el.createSpan({ cls: 'thoughtknot-walk-said', attr: { 'aria-live': 'polite' } });
    this.say(word(this.tool === 'note' ? 'sketch.hint.note' : 'sketch.hint.drag'));
  }

  /** Draws the drawings on the card's drawing again: as it is laid out now, after a change, or hidden. */
  layer(): void {
    const svg = this.card.svg();
    if (!svg) return;
    ownChild(svg, 'g.tk-sketch')?.remove();
    if (this.shown && this.sketch?.items.length) {
      const marks = drawnMarks(this.card.drawn().svg, this.card.keys());
      const { pieces } = sketchMarks(this.sketch, marks);
      const text = `<svg xmlns="${SVG}">${sketchSvg(pieces, this.card.sketching.palette)}</svg>`;
      const g = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement.children[0];
      if (g) {
        const layer = svg.appendChild(activeDocument.importNode(g, true));
        if (this.selected) partOf(layer, this.selected)?.classList.add('is-selected');
      }
    }
    svg.dispatchEvent(new CustomEvent(MARKED)); // a view in space open over it draws them again too
  }

  /** A pointer pressed at `p` in the viewport. True when the tool takes it: a drawing begun, or a drawing pressed. */
  down(e: PointerEvent, p: { x: number; y: number }): boolean {
    if (e.button !== 0) return false;
    if (this.tool) {
      const at = this.at(p);
      if (!at) return true;
      this.stroke = { id: e.pointerId, points: [at], from: p };
      return true;
    }
    const on = (e.target as Element | null)?.closest?.('[data-sketch]')?.getAttribute('data-sketch');
    if (!on) return false;
    this.tap = { id: e.pointerId, ...p, on };
    return true;
  }

  /** The pointer moved: a drawing under way follows it. True when the tool takes it. */
  move(e: PointerEvent, p: { x: number; y: number }): boolean {
    const s = this.stroke;
    if (!s || s.id !== e.pointerId) return !!this.tap && this.tap.id === e.pointerId;
    const at = this.at(p);
    if (at) s.points.push(at);
    this.preview(s.points);
    return true;
  }

  /** The pointer let go: a drawing is written, or a drawing tapped is selected, then centred. True when it was the tool's. */
  up(e: PointerEvent, p: { x: number; y: number }): boolean {
    const s = this.stroke,
      t = this.tap;
    if (t && t.id === e.pointerId) {
      this.tap = null;
      if (Math.hypot(p.x - t.x, p.y - t.y) < SLOP_PX) this.pick(t.on);
      return true;
    }
    if (!s || s.id !== e.pointerId) return false;
    this.stroke = null;
    this.preview(null);
    void this.finish(s);
    return true;
  }

  /** Escape: a drawing under way is dropped, else the tools are put away. True when it did either. */
  escape(): boolean {
    if (this.stroke) {
      this.stroke = null;
      this.preview(null);
      return true;
    }
    if (!this.tool && !this.selected) return false;
    this.selected = null;
    this.choose(null);
    return true;
  }

  private choose(tool: Tool | null): void {
    this.tool = tool;
    this.card.svg()?.classList.toggle('is-sketching', !!tool);
    this.show();
  }

  private toggle(): void {
    this.shown = !this.shown;
    this.selected = null;
    this.layer();
    this.show();
  }

  /** A drawing tapped: the first tap selects it and says what it is; a second centres it (second_tap_centres). */
  private pick(id: string): void {
    const svg = this.card.svg();
    const g = svg ? partOf(svg, id) : null;
    if (this.selected === id && svg && g) {
      this.centre(svg, g as SVGGraphicsElement);
      return;
    }
    this.selected = id;
    svg?.querySelectorAll('.is-selected[data-sketch]').forEach((x) => x.classList.remove('is-selected'));
    g?.classList.add('is-selected');
    this.show();
    this.say(word('sketch.selected', { said: g?.querySelector('title')?.textContent ?? id }));
  }

  /** Brings a drawing to the middle of the view, at the same scale. */
  private centre(svg: SVGSVGElement, g: SVGGraphicsElement): void {
    const vb = svg.viewBox?.baseVal;
    const box = typeof g.getBBox === 'function' ? g.getBBox() : null;
    if (!vb?.width || !vb.height || !box) return;
    const zoom = this.card.zoom();
    const to = zoom.aim(
      {
        x: (box.x - vb.x) / vb.width,
        y: (box.y - vb.y) / vb.height,
        width: box.width / vb.width,
        height: box.height / vb.height,
      },
      0,
      true,
    );
    if (to) zoom.restore(to.scale, to.x, to.y);
  }

  private async remove(): Promise<void> {
    const id = this.selected;
    if (!id) return;
    this.selected = null;
    if (await this.write({ remove: id })) this.say(word('sketch.deleted'));
  }

  /** A drawing let go: made from its points, pinned to what it began over, and written. */
  private async finish(s: { points: MarkPoint[]; from: { x: number; y: number } }): Promise<void> {
    const how = TOOLS.find(([t]) => t === this.tool)?.[2];
    if (!how) return;
    let text: string | undefined;
    if (how.kind === 'Text') {
      text = this.note?.value.trim();
      if (!text) return this.say(word('sketch.note-empty'));
    } else if (s.points.length < 2) return; // a tap with a pen draws nothing
    const marks = drawnMarks(this.card.drawn().svg, this.card.keys());
    const item = drawnItem(text === undefined ? how : { ...how, text }, s.points, marks);
    if (!item) return;
    if (await this.write({ add: item })) {
      if (this.note) this.note.value = '';
      // a drawing added goes last in the block, so it is the last one drawn
      const svg = this.card.svg(),
        last = this.sketch?.items.at(-1)?.id;
      const said = svg && last ? partOf(svg, last)?.querySelector('title')?.textContent : null;
      this.say(word('sketch.drawn', { said: said ?? '' }));
    }
  }

  /** Writes a change through the host, and draws the drawings as the note now holds them. */
  private async write(change: SketchChange): Promise<boolean> {
    if (this.card.readOnly()) return false;
    const r = await this.card.sketching.write(change);
    if (!r) return false; // closed: the card became read-only meanwhile
    if ('refused' in r) {
      this.say(word('sketch.refused', { why: r.refused }));
      return false;
    }
    this.sketch = r.sketch;
    this.shown = true;
    this.layer();
    if (!this.tool) this.show();
    return true;
  }

  /** A point in the viewport as a point of the drawing, in its viewBox units. */
  private at(p: { x: number; y: number }): MarkPoint | null {
    const v: View = this.card.zoom().view();
    const d = this.card.taps.toDrawing(p, v);
    return d ? [d.x, d.y] : null;
  }

  /** The drawing under way, drawn as a thin line over the rest; none once it is let go. */
  private preview(points: MarkPoint[] | null): void {
    const svg = this.card.svg();
    if (!svg) return;
    let line = ownChild(svg, 'polyline.tk-sketch-preview') as SVGPolylineElement | null;
    if (!points) return line?.remove();
    if (!line) {
      line = svg.appendChild(activeDocument.createElementNS(SVG, 'polyline'));
      line.setAttribute('class', 'tk-sketch-preview');
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', this.card.sketching.palette.text);
      line.setAttribute('stroke-width', '2');
    }
    const a: MarkPoint = points[0] ?? [0, 0],
      b: MarkPoint = points[points.length - 1] ?? a;
    // a pen draws as it goes; a line or an arrow runs end to end; a box or ellipse is shown by its box
    const shown: MarkPoint[] =
      this.tool === 'pen'
        ? points
        : this.tool === 'box' || this.tool === 'ellipse'
          ? [a, [b[0], a[1]], b, [a[0], b[1]], a]
          : [a, b];
    line.setAttribute('points', shown.map((q) => `${q[0]},${q[1]}`).join(' '));
  }

  private say(text: string): void {
    if (this.live) this.live.textContent = text;
  }
}
