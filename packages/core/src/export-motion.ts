// Movement in an exported SVG (editor spec §7, §16; links_show_flow, motion_reduced_respected). An animated SVG moves
// by CSS inside the file itself. So it needs no encoder and nothing loaded from elsewhere. The links a style graph
// moves run their dashes. Or a dot travels along a copy of each one's line, so the line itself is still drawn. Every
// animation stops under `@media (prefers-reduced-motion: reduce)`. That leaves the still drawing: the dashes, each
// link's icon and the legend's words. So the image never tells anything by movement alone (motion_not_alone). A PNG is
// drawn from a still image, which has none of this.
import type { FlowLink } from './link-flow.ts';
import { TOKEN_DEFAULTS } from './theme-tokens.ts';

/** How long a dash pattern takes to run its length, and a dot to travel a link: the motion tokens' own times. */
const DASH = TOKEN_DEFAULTS['--gn-motion-dash'] ?? '1s',
  DOT = TOKEN_DEFAULTS['--gn-motion-dot'] ?? '2s';

/**
 * The class an exported image carries on its root, which every rule of its style sheet is written under. So a sheet in
 * an SVG put inline in a page reaches nothing of the page's own.
 */
export const IMAGE_CLASS = 'thoughtknot-image';

/** A selector written under the image's own class. */
export const inImage = (selector: string): string => `.${IMAGE_CLASS} ${selector}`;

/** The style sheet that moves the links: dashes running, a dot travelling, backwards along a line laid out backwards. */
const FLOW_CSS = [
  '@keyframes thoughtknot-flow-dashes { to { stroke-dashoffset: -20; } }',
  '@keyframes thoughtknot-flow-dot { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -100; } }',
  `${inImage('.thoughtknot-flow-dashes > path')} { stroke-dasharray: 6 4; ` +
    `animation: thoughtknot-flow-dashes ${DASH} linear infinite; }`,
  `${inImage('.thoughtknot-flow-back.thoughtknot-flow-dashes > path')} { animation-direction: reverse; }`,
  `${inImage('.thoughtknot-flow-runner')} { fill: none; stroke-width: 5; stroke-linecap: round; stroke-dasharray: 0 200; ` +
    `animation: thoughtknot-flow-dot ${DOT} linear infinite; }`,
  `${inImage('.thoughtknot-flow-back > .thoughtknot-flow-runner')} { animation-direction: reverse; }`,
  `@media (prefers-reduced-motion: reduce) { ${inImage('.thoughtknot-flow-dashes > path')}, ` +
    `${inImage('.thoughtknot-flow-runner')} { animation: none; } ${inImage('.thoughtknot-flow-runner')} { display: none; } }`,
].join('\n');

/**
 * An SVG with a style sheet of its own, first inside its root element, where every shape sees it. The root is given the
 * image's class (`IMAGE_CLASS`) the sheet's rules are written under, once.
 */
export function withStyleSheet(svg: string, css: string): string {
  return svg.replace(/(<svg\b[^>]*>)/, (open: string) => {
    const classed = open.includes(`class="${IMAGE_CLASS}"`)
      ? open
      : open.replace(/^<svg\b/, `<svg class="${IMAGE_CLASS}"`);
    return `${classed}\n<style>${css}</style>`;
  });
}

/**
 * A copy of a link's line that a dot travels along. It is the same path, its length counted as 100. So a dash pattern
 * of a dot and a gap of 200 puts a single dot on it, wherever the pattern is moved to.
 */
export const runnerOf = (pathTag: string, cls: string): string =>
  pathTag
    .replace(/\s(?:class|pathLength|stroke-dasharray)="[^"]*"/g, '')
    .replace(/^<path\b/, `<path class="${cls}" pathLength="100"`);

/**
 * The SVG with each group `<g id="<kind><n>" …>…</g>` of one of `kinds` replaced by what `swap` gives. A group ends at
 * the first `</g>` after its opening, as Graphviz writes them. It is found by plain search, so it stays quick
 * on any text (risk SEC-21). A pattern over the body took time with the square of a long group left open.
 */
export function replaceGroups(
  svg: string,
  kinds: readonly string[],
  swap: (all: string, open: string, kind: string, n: string, body: string, close: string) => string,
): string {
  const parts: string[] = [];
  let from = 0;
  for (let at = svg.indexOf('<g id="'); at >= 0; at = svg.indexOf('<g id="', at + 1)) {
    if (at < from) continue;
    const name = at + 7;
    const kind = kinds.find((k) => svg.startsWith(k, name));
    if (kind === undefined) continue;
    let end = name + kind.length;
    while (end < svg.length && '0123456789'.includes(svg.charAt(end))) end++;
    if (end === name + kind.length || svg[end] !== '"') continue;
    const tagEnd = svg.indexOf('>', end);
    if (tagEnd < 0) break;
    const closeAt = svg.indexOf('</g>', tagEnd + 1);
    if (closeAt < 0) break;
    const open = svg.slice(at, tagEnd + 1),
      body = svg.slice(tagEnd + 1, closeAt);
    parts.push(
      svg.slice(from, at),
      swap(svg.slice(at, closeAt + 4), open, kind, svg.slice(name + kind.length, end), body, '</g>'),
    );
    from = closeAt + 4;
  }
  return parts.join('') + svg.slice(from);
}

/**
 * A drawn SVG (themed, before its frame) with a dot's runner on each link a dot moves along. The runner is a copy of
 * the link's line after it, in its group (`edge<n>`, Graphviz's numbering). With no dot, the SVG as it was.
 */
export function withRunners(svg: string, flow: readonly FlowLink[]): string {
  const dots = new Set(flow.filter((f) => f.motion === 'dot').map((f) => f.index + 1));
  if (!dots.size) return svg;
  return replaceGroups(svg, ['edge'], (all, open, _kind, n, body, close) => {
    if (!dots.has(Number(n))) return all;
    const line = /<path\b[^>]*\/>/.exec(body)?.[0];
    return line
      ? `${open}${body.replace(line, () => `${line}${runnerOf(line, 'thoughtknot-flow-runner')}`)}${close}`
      : all;
  });
}

/** The framed image with its links moving: the style sheet that moves them, when any link moves; else as it was. */
export function withFlow(svg: string, flow: readonly FlowLink[]): string {
  return flow.length ? withStyleSheet(svg, FLOW_CSS) : svg;
}
