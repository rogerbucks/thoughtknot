// The ring on the box the keyboard has reached (WCAG 2.2 SC 2.4.7 and 2.4.11; risk UX-9). A browser draws no outline on a
// shape in a drawing, and a thicker stroke alone is easy to miss. So the box is ringed apart from its own outline: a
// rectangle in the text colour, 2 pixels wide, standing off the box. It is drawn only while the keyboard's focus is on
// the box, and taken away with it. A click's focus draws none.
const NS = 'http://www.w3.org/2000/svg';
const CLASS = 'thoughtknot-focus-ring';
/** How far the ring stands off the box, in the drawing's own units. */
const GAP = 5;

/** The box a focus event reached, if it is one of the drawing's. */
const boxOf = (e: FocusEvent): Element | null => (e.target instanceof Element ? e.target.closest('g.node') : null);

/** The ring on `g`, if it has one. */
const ringOf = (g: Element): Element | undefined => Array.from(g.children).find((c) => c.classList.contains(CLASS));

/** Rings the box that took the focus, when the keyboard gave it. */
export function ringFocus(e: FocusEvent, byKeyboard: boolean): void {
  const g = boxOf(e);
  if (!g || !byKeyboard || ringOf(g)) return;
  const shape = Array.from(g.children).find((c) => /^(path|polygon|ellipse)$/i.test(c.tagName));
  const b = (shape as SVGGraphicsElement | undefined)?.getBBox?.();
  if (!b) return;
  const ring = g.ownerDocument.createElementNS(NS, 'rect');
  ring.setAttribute('class', CLASS);
  ring.setAttribute('x', String(b.x - GAP));
  ring.setAttribute('y', String(b.y - GAP));
  ring.setAttribute('width', String(b.width + 2 * GAP));
  ring.setAttribute('height', String(b.height + 2 * GAP));
  ring.setAttribute('rx', '6');
  ring.setAttribute('aria-hidden', 'true');
  g.append(ring);
}

/** Takes the ring off the box that lost the focus. */
export function unringFocus(e: FocusEvent): void {
  const g = boxOf(e);
  if (g) ringOf(g)?.remove();
}
