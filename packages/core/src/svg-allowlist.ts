// The drawing's SVG, cleaned before it is shown (TRUST-7, spec_secrets_and_fences). The engine escapes every label.
// Until now that was the only guard. The SVG went raw into the live page in Obsidian, which has no content policy, and
// into Claude's pane. So one escaping bug would run script with the page's full access. Now every drawing passes
// through an allowlist first:
// - SVG's own drawing elements only. A script, a foreignObject, an iframe or any element not on the list is dropped,
//   with all it holds;
// - no event attribute (onload, onclick…), and no attribute whose name is not a plain name;
// - a link only within the drawing (`#id`). An image may also be a raster held in the file itself (data:image/png…);
// - no url() but to the drawing's own parts, in an attribute or a style sheet, and no @import;
// - no animation that sets a link, no comment, doctype, entity or processing instruction.
// What is left is the drawing the engine made, byte for byte where it was clean.

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** The elements a drawing may hold: SVG's shapes, text, groups, paints, filters and styles. */
export const SVG_ELEMENTS: ReadonlySet<string> = new Set([
  'svg', 'g', 'defs', 'title', 'desc', 'metadata', 'symbol', 'use', 'switch', 'view', 'a', 'style',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textPath', 'image',
  'marker', 'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'stop',
  'filter', 'feBlend', 'feColorMatrix', 'feComposite', 'feDropShadow', 'feFlood', 'feGaussianBlur', 'feMerge',
  'feMergeNode', 'feMorphology', 'feOffset',
  'animate', 'animateTransform', 'animateMotion', 'set',
]); // prettier-ignore

const NAME = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/;
const LINK = /^(?:xlink:)?href$/i;
/** A link within the drawing: `#` and an id. */
const IN_PAGE = /^#[\w.:-]*$/;
/** A raster image held in the file itself. An SVG one is left out, as it could hold markup of its own. */
const RASTER = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]*$/;
/** A url() to anything but the drawing's own parts, or a style sheet brought in from elsewhere. */
const OUTSIDE = /url\s*\(\s*(?!['"]?#)|@import|expression\s*\(|javascript:/i;
const ELEMENT = /[A-Za-z][\w:.-]*/y;
const SPACE = /\s/;

type Attribute = { whole: string; name: string; quoted?: string };
/** A start or end tag as read: its attributes each as written, with the space before it. */
type Tag = { end: number; closing: boolean; element: string; attributes: Attribute[]; selfClosing: boolean };

/**
 * The tag that opens at `at`, or where its reading stopped when it is not one. It is read by hand, each character once.
 * A pattern tried at every `<` could take time growing with the square of the text (CodeQL js/polynomial-redos). A
 * reading stops at a `<` outside a quoted value, so text that is not a tag is never read twice.
 */
function tagAt(svg: string, at: number): Tag | { stop: number } {
  const skip = (i: number) => {
    while (i < svg.length && SPACE.test(svg.charAt(i))) i += 1;
    return i;
  };
  let i = at + 1;
  const closing = svg.charAt(i) === '/';
  if (closing) i += 1;
  ELEMENT.lastIndex = i;
  const element = ELEMENT.exec(svg)?.[0];
  if (!element) return { stop: i };
  i += element.length;
  const attributes: Attribute[] = [];
  for (;;) {
    const j = skip(i);
    if (svg.charAt(j) === '>') return { end: j + 1, closing, element, attributes, selfClosing: false };
    if (svg.startsWith('/>', j)) return { end: j + 2, closing, element, attributes, selfClosing: true };
    if (j === i || j >= svg.length) return { stop: j };
    let k = j;
    while (k < svg.length && !SPACE.test(svg.charAt(k)) && !'=/><'.includes(svg.charAt(k))) k += 1;
    if (k === j) return { stop: k };
    const name = svg.slice(j, k);
    let quoted: string | undefined;
    const eq = skip(k);
    if (svg.charAt(eq) === '=') {
      const open = skip(eq + 1);
      const mark = svg.charAt(open);
      if (mark !== '"' && mark !== "'") return { stop: open };
      const close = svg.indexOf(mark, open + 1);
      if (close < 0) return { stop: svg.length };
      quoted = svg.slice(open, close + 1);
      k = close + 1;
    }
    attributes.push({ whole: svg.slice(i, k), name, quoted });
    i = k;
  }
}

/** The attributes of one start tag that may stay, as they were written; null when the element must go. */
function keptAttributes(element: string, attributes: Attribute[]): string | null {
  const kept: string[] = [];
  for (const { whole, name, quoted } of attributes) {
    const value = quoted === undefined ? '' : quoted.slice(1, -1);
    if (!NAME.test(name) || /^on/i.test(name)) continue;
    if (/^xmlns(:|$)/i.test(name) && value !== SVG_NS && value !== XLINK_NS) continue;
    if (LINK.test(name) && !IN_PAGE.test(value.trim()) && !(element === 'image' && RASTER.test(value.trim()))) continue;
    if (OUTSIDE.test(value)) continue;
    // an animation that sets a link could make one to a script: such an element goes whole
    if (
      /^(animate|animateTransform|animateMotion|set)$/.test(element) &&
      name === 'attributeName' &&
      /href/i.test(value)
    )
      return null;
    kept.push(whole);
  }
  return kept.join('');
}

/** `svg` with everything not on the allowlist taken out (see the head of this file). */
export function cleanSvg(svg: string): string {
  let out = '';
  let at = 0;
  // inside an element that was dropped: how deep, and whether its text is a style sheet that must be checked whole
  let dropped = 0;
  let sheet: { start: number } | null = null;
  const end = (mark: string, from: number) => {
    const i = svg.indexOf(mark, from);
    return i < 0 ? svg.length : i + mark.length;
  };
  while (at < svg.length) {
    const lt = svg.indexOf('<', at);
    const text = svg.slice(at, lt < 0 ? svg.length : lt);
    if (!dropped) out += text;
    if (lt < 0) break;
    at = lt;
    if (svg.startsWith('<!--', at)) at = end('-->', at + 4);
    else if (svg.startsWith('<![CDATA[', at)) {
      const close = end(']]>', at);
      if (!dropped) out += svg.slice(at, close);
      at = close;
    } else if (svg.startsWith('<!', at)) {
      // a doctype, with any entities it declares; the search for `[` stops at the doctype's first `>`
      const gt = end('>', at);
      const bracket = svg.slice(at, gt).indexOf('[');
      at = bracket < 0 ? gt : end('>', end(']', at + bracket));
    } else if (svg.startsWith('<?', at)) at = end('?>', at);
    else {
      const tag = tagAt(svg, at);
      if ('stop' in tag) {
        // not a tag: its text is kept with each `<` escaped, and the scan goes on where the reading stopped
        if (!dropped) out += svg.slice(at, tag.stop).replaceAll('<', '&lt;');
        at = tag.stop;
        continue;
      }
      at = tag.end;
      const { closing, element, attributes, selfClosing } = tag;
      if (dropped) {
        if (closing) dropped -= 1;
        else if (!selfClosing) dropped += 1;
        continue;
      }
      if (closing) {
        if (element === 'style' && sheet) {
          // a style sheet reaching outside the drawing goes, all of it
          if (OUTSIDE.test(out.slice(sheet.start))) out = out.slice(0, sheet.start);
          sheet = null;
        }
        if (SVG_ELEMENTS.has(element)) out += `</${element}>`;
        continue;
      }
      const kept = SVG_ELEMENTS.has(element) ? keptAttributes(element, attributes) : null;
      if (kept === null) {
        if (!selfClosing) dropped = 1;
        continue;
      }
      out += `<${element}${kept}${selfClosing ? '/' : ''}>`;
      if (element === 'style' && !selfClosing) sheet = { start: out.length };
    }
  }
  return out;
}
