// The drawing itself (spec §3, §11): the SVG the engine drew, put in the viewport. Each box and each link, written or
// estimated, is made reachable from the keyboard and named for screen readers. The drawing is told as sentences. A
// drawing folded by the View menu (§25) has a stub for each busy hub and a box for each group folded. Each is a button
// that opens it. A link merged into a trunk is tapped and named as itself by either of its lines. Words holding a link
// to a note, a file or an address are drawn as a link. A thing's attachments are counted (§18, links/link-marks.ts).
// Laid out again, the drawing is put in the same SVG element (`swapSvg`), so everything that holds it holds the new
// drawing.
import { cleanSvg, edgesOf, textVersion, trunksOf, withoutColorMix, word } from '@thoughtknot/core';
import type { Drawn, Folding, GraphDrawing } from '@thoughtknot/core';
import { boxLabel } from './suggested-name';
import { markCertainty } from './certainty';
import { markParked } from './parked';
import { markCallouts } from './note-callouts';
import { markLinks } from '../links/link-marks';
import { noInlineStyle } from '../host';
import type { ViewOptions } from './view-options';

let described = 0;

/**
 * The SVG text parsed into an element of the page, its blends plain where the browser cannot mix colours. It passes the
 * allowlist first, so no script, event or outside link reaches the live page whatever the labels held (TRUST-7).
 */
export function parsedSvg(drawn: Drawn): SVGSVGElement {
  // CSS color-mix arrived in iOS 16.2, and Obsidian runs on iOS 15: without it a blend would draw black, so use the plain hue
  const mixes = typeof CSS === 'undefined' || CSS.supports('color', 'color-mix(in srgb, red 50%, blue)');
  const clean = cleanSvg(drawn.svg);
  const text = mixes ? clean : withoutColorMix(clean);
  // where inline styles are forbidden (host.ts), no style attribute may be parsed from markup. That holds even in a
  // parser's own document, which keeps the page's policy. Each is renamed in the text, and its declarations set through
  // the CSSOM
  const inert = noInlineStyle();
  const svg = new DOMParser().parseFromString(inert ? liftStyles(text) : text, 'image/svg+xml').documentElement;
  const imported = activeDocument.importNode(svg, true) as unknown as SVGSVGElement;
  if (inert) setLifted(imported);
  return imported;
}

/** Where a style attribute waits between the parse and the CSSOM, where inline styles are forbidden. */
const LIFTED = 'data-gn-style';

/** `svg` with each style attribute of its tags renamed, so no style is parsed from the markup (text is never touched). */
const liftStyles = (svg: string): string =>
  svg.replace(/<[a-zA-Z][^<>]*>/g, (tag) => tag.replace(/\sstyle="/g, ` ${LIFTED}="`));

/** Sets the declarations each lifted attribute held through the CSSOM, and takes the attribute away. */
function setLifted(root: SVGSVGElement): void {
  const lifted = [root, ...Array.from(root.querySelectorAll<SVGElement>(`[${LIFTED}]`))];
  for (const el of lifted) {
    const style = el.getAttribute(LIFTED);
    if (style === null) continue;
    el.removeAttribute(LIFTED);
    for (const declaration of style.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon > 0) el.style.setProperty(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
    }
  }
}

/**
 * The drawing, parsed from its SVG text into the viewport, each box and link made reachable from the keyboard and
 * named. Given the card's options, its links are shown as links and its attachments counted (§18).
 */
export function insertSvg(
  viewport: HTMLElement,
  drawn: Drawn,
  d: GraphDrawing | undefined,
  plan?: Folding,
  o?: ViewOptions,
): SVGSVGElement {
  const svg = viewport.appendChild(parsedSvg(drawn));
  svg.removeAttribute('style');
  svg.classList.add('thoughtknot-svg');
  decorate(svg, drawn, d, plan, o);
  return svg;
}

/** The drawing laid out again (§25): its new SVG put in place of the old, inside the same element, and marked as before. */
export function swapSvg(
  svg: SVGSVGElement,
  drawn: Drawn,
  d: GraphDrawing | undefined,
  plan?: Folding,
  o?: ViewOptions,
): void {
  const fresh = parsedSvg(drawn);
  svg.replaceChildren(...Array.from(fresh.children));
  const box = fresh.getAttribute('viewBox');
  if (box) svg.setAttribute('viewBox', box);
  decorate(svg, drawn, d, plan, o);
}

/** Each box and link of a drawing made reachable from the keyboard and named, its folds made buttons and its links shown. */
function decorate(
  svg: SVGSVGElement,
  drawn: Drawn,
  d: GraphDrawing | undefined,
  plan?: Folding,
  o?: ViewOptions,
): void {
  svg.classList.toggle('thoughtknot-down', drawn.rankdir === 'TB'); // labels sit beside their lines, so they are given a gap
  svg.classList.toggle('thoughtknot-mirrored', !!drawn.mirrored); // read right to left (§42)
  const boxes = d?.boxes ?? [];
  for (const g of Array.from(svg.querySelectorAll('g.node'))) {
    const box = boxes[Number(/^node(\d+)$/.exec(g.getAttribute('id') ?? '')?.[1]) - 1];
    if (!box) continue;
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', boxLabel(box));
    g.setAttribute('data-key', box.key);
    g.setAttribute('aria-pressed', 'false');
  }
  // links: each written link in order, then the estimated ones added to the drawing (spec §3)
  const written = d?.links.length ?? 0,
    named = (d?.estimates ?? []).filter((e) => e.kind === 'name');
  const textOf = (k: string) => boxes.find((b) => b.key === k)?.text ?? k;
  for (const g of Array.from(svg.querySelectorAll('g.edge'))) {
    const [, number, tail] = /^edge(\d+)(_tail)?$/.exec(g.getAttribute('id') ?? '') ?? [];
    const n = Number(number) - 1;
    const e = n < written ? d?.estimates.find((x) => x.kind === 'type' && x.index === n) : named[n - written];
    const l = n < written ? d?.links[n] : undefined;
    if (!e && l) {
      // a written link: tap it, or press Enter on it, for its details; merged into a trunk, either of its lines (§25)
      g.setAttribute('data-link', String(n));
      g.setAttribute('aria-label', `Link: ${textOf(l.from)} ${l.reading} ${textOf(l.to)}`);
      if (tail) continue;
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-pressed', 'false');
      continue;
    }
    if (!e || !d) continue;
    g.setAttribute('data-estimate', String(d.estimates.indexOf(e)));
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-pressed', 'false'); // selected as a written link is, when tapped
    g.setAttribute(
      'aria-label',
      word('estimate.label', { from: textOf(e.from), reading: e.reading, to: textOf(e.to) }),
    );
  }
  markFolds(svg, plan, textOf, d);
  if (o?.switches?.state.switches.groups) markOpened(svg, plan); // a group opened from its box folds back (§25)
  markParked(svg, boxes); // things parked for later: dashed, with a later mark (spec §5)
  markCertainty(svg, boxes); // how sure each thing is: line weight, dash and a mark, never colour alone (§36)
  if (o?.links) markLinks(svg, o.reading, o.graph, o.links); // links shown as links, attachments counted (§18)
  if (o?.callouts && d) markCallouts(svg, drawn, d); // the notes, as callouts, over the finished layout (§24)
}

/** Each busy hub's stub, folded group's box and bundle (§25): a button that opens it, named with its count. */
function markFolds(
  svg: SVGSVGElement,
  plan: Folding | undefined,
  textOf: (k: string) => string,
  d?: GraphDrawing,
): void {
  if (!plan) return;
  // each trunk, named by its bundle as the layout source numbers them: tapped, its links are drawn apart again
  const links = d ? edgesOf(d).map((e, n) => ({ n, from: e.from, to: e.to })) : [];
  const trunks = trunksOf(plan, links).map(({ bundle, links: ls }, t): [string, string, string] => {
    const [from = '', to = ''] = bundle.split('\n');
    return [`trunk_${t + 1}`, `bundle:${bundle}`, word('fold.bundle', { count: ls.length, from, to })];
  });
  const folds: [string, string, string][] = [
    ...trunks,
    ...plan.hubs.map(([key, count], j): [string, string, string] => [
      `fold_hub_${j + 1}`,
      `hub:${key}`,
      word('fold.links', { label: textOf(key), count }),
    ]),
    ...plan.groups.flatMap(([label, things, folded], i): [string, string, string][] =>
      folded ? [[`fold_group_${i + 1}`, `group:${label}`, word('fold.things', { label, count: things.length })]] : [],
    ),
  ];
  for (const [id, fold, label] of folds) {
    const g = svg.querySelector(`#${id}`);
    if (!g) continue;
    g.setAttribute('data-fold', fold);
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', label);
    svg.querySelector(`#${id}_link`)?.setAttribute('data-fold', fold);
  }
  // a folded group's box stands for its things: one of them selected, the box is marked selected (details-panel.ts)
  plan.groups.forEach(([, things, folded], i) => {
    const g = folded ? svg.querySelector(`#fold_group_${i + 1}`) : null;
    g?.setAttribute('data-keys', things.join(' '));
    g?.setAttribute('aria-pressed', 'false');
  });
}

/** The SVG namespace, for the button each opened group gets. */
const SVG_NS = 'http://www.w3.org/2000/svg';
/** The fold-back button's side, and its room from the group's top right corner, in the drawing's units. */
const BACK_SIDE = 14,
  BACK_ROOM = 4;

/** The first child of `e` that is one of `tags`. */
const childOf = (e: Element, tags: readonly string[]) => Array.from(e.children).find((c) => tags.includes(c.localName));

/** Sets each of `attrs` on `e`. */
const setAll = (e: Element, attrs: Record<string, string | number>) => {
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
};

/**
 * Each group opened from its box (cluster_fold_back): a button at its top right folds it back, and its name zooms to
 * it. Both are folds the card opens as it opens a box: `group:` folds it back, `zoom:` zooms to it.
 */
function markOpened(svg: SVGSVGElement, plan: Folding | undefined): void {
  const clusters = Array.from(svg.querySelectorAll('g.cluster'));
  for (const [label, , folded] of plan?.groups ?? []) {
    const g = folded ? undefined : clusters.find((c) => childOf(c, ['text'])?.textContent?.trim() === label),
      name = g && childOf(g, ['text']),
      shape = g && childOf(g, ['polygon', 'path']);
    // its corners, from the outline's points as written, so it needs no layout of the page
    const at = (shape?.getAttribute('points') ?? shape?.getAttribute('d') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number);
    if (!g || !name || !at?.length) continue;
    g.setAttribute('data-refold', `group:${label}`);
    setAll(name, {
      'data-fold': `zoom:${label}`,
      role: 'button',
      tabindex: 0,
      'aria-label': word('fold.zoom', { label }),
    });
    const make = (tag: string) => svg.ownerDocument.createElementNS(SVG_NS, tag);
    const back = make('g'),
      box = make('rect'),
      minus = make('path');
    setAll(back, { class: 'thoughtknot-fold-back', 'data-fold': `group:${label}`, role: 'button', tabindex: 0 });
    back.setAttribute('aria-label', word('fold.back', { label }));
    const x = Math.max(...at.filter((_, i) => i % 2 === 0)) - BACK_SIDE - BACK_ROOM,
      y = Math.min(...at.filter((_, i) => i % 2 === 1)) + BACK_ROOM;
    setAll(box, { x, y, width: BACK_SIDE, height: BACK_SIDE, rx: 3 });
    minus.setAttribute('d', `M${x + 3},${y + BACK_SIDE / 2}h${BACK_SIDE - 6}`);
    back.append(box, minus);
    g.append(back);
  }
}

/** The drawing as sentences, for screen readers (spec §11), named as the viewport's description. */
export function describeDrawing(root: HTMLElement, viewport: HTMLElement, d: GraphDrawing): void {
  const sr = root.createDiv({
    cls: ['thoughtknot-sr', 'thoughtknot-outline'],
    attr: { id: `thoughtknot-sr-${++described}`, 'aria-label': word('outline.of', { graph: d.graph }) },
  });
  const ul = sr.createEl('ul');
  for (const line of textVersion(d)) ul.createEl('li', { text: line });
  viewport.setAttribute('aria-describedby', sr.getAttribute('id') ?? '');
}

/** The class that shows the drawing's sentences as an outline beside it, for every reader, not only a screen reader. */
export const OUTLINE_SHOWN = 'is-shown';

/**
 * Shows or hides the outline of the card `root`: the drawing's sentences, beside it (§69, view_reading_support). It is
 * one key away, O, in every view, as the same sentences say what 2D, 2.5D and 3D draw. Says whether it is shown now,
 * or null for a card with no outline, such as a table.
 */
export function toggleOutline(root: HTMLElement): boolean | null {
  const outline = Array.from(root.children).find((c) => c.classList.contains('thoughtknot-outline')) as
    HTMLElement | undefined;
  if (!outline) return null;
  outline.toggleClass(OUTLINE_SHOWN, !outline.hasClass(OUTLINE_SHOWN));
  return outline.hasClass(OUTLINE_SHOWN);
}
