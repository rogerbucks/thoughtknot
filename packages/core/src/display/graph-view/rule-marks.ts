// Rules and looks on a card's drawing (editor spec §56). Each thing or link a style rule finds is marked with its look.
// That is the rule's style token on its group (`data-style`), its line and format, and its hue on the outline only. Its
// badge sits beside its name. A screen reader hears what each rule means. So a look is never told by colour alone.
// The 2.5D and 3D views read these marks from the drawing (svg-marks.ts), so every view shows the same looks. The
// legend beside the drawing lists each rule's badge, line and colour with what it means.
import { BADGE_GLYPHS, hueColour, word } from '@thoughtknot/core';
import type { RuleLegendEntry, RuleMark, RulesShown } from '@thoughtknot/core';
import type { ViewOptions } from './view-options.ts';
import { markFlow } from './flow-marks.ts';
import { markView, putTag, say } from './view-strip.ts';

/** The class a rule's badge is drawn with, which the 3D view reads too. */
export const RULE_BADGE = 'thoughtknot-rule-badge';

/** Marks one box or link group with what the rules give it. */
function markOne(g: SVGElement, mark: RuleMark | undefined, edge: boolean) {
  if (!mark) return;
  g.setAttribute('data-style', mark.tokens.join(' '));
  g.classList.add('thoughtknot-look', 'thoughtknot-rule');
  if (mark.line) g.classList.add(`thoughtknot-line-${mark.line}`);
  if (mark.format) g.classList.add(`thoughtknot-format-${mark.format}`);
  if (mark.hue) g.setCssProps({ '--thoughtknot-look-line': hueColour(mark.hue, 'line') });
  // its badge, or the numbered tag of the step a bands rule puts it in
  const glyph = mark.badge ? BADGE_GLYPHS[mark.badge] : mark.tag;
  if (glyph && !g.querySelector(`.${RULE_BADGE}`)) {
    g.setAttribute('data-badge', glyph);
    putTag(g, glyph, edge, RULE_BADGE);
  }
  say(g, mark.means.filter(Boolean).join(', '));
}

/** Marks the drawing as its rules say: each thing and link they find, with its look (rule_look_not_colour_alone). */
export function markRules(svg: SVGSVGElement, rules: RulesShown): void {
  for (const g of Array.from(svg.querySelectorAll<SVGGElement>('g.node[data-key]')))
    markOne(g, rules.things.get(g.getAttribute('data-key') ?? ''), false);
  for (const g of Array.from(svg.querySelectorAll<SVGGElement>('g.edge[data-link]')))
    markOne(g, rules.links.get(Number(g.getAttribute('data-link'))), true);
}

/** Marks a card's drawing: the links its style moves, its view's looks if it is a view, and its rules' looks. */
export function markLooks(svg: SVGSVGElement, o: Pick<ViewOptions, 'motion' | 'view' | 'rules'>): void {
  if (o.motion) markFlow(svg, o.motion.flow);
  if (o.view) markView(svg, o.view);
  if (o.rules) markRules(svg, o.rules);
}

/** One row of the rules' legend: the badge, a sample of the line in the rule's colour, and what it means. */
function legendRow(list: HTMLElement, e: RuleLegendEntry) {
  const li = list.createEl('li', { attr: { 'data-style': e.token } });
  const glyph = e.badge ? BADGE_GLYPHS[e.badge] : e.tag;
  if (glyph) li.createSpan({ cls: 'thoughtknot-rule-glyph', text: glyph, attr: { 'aria-hidden': 'true' } });
  const sample = li.createSpan({
    cls: `thoughtknot-rule-line is-${e.line ?? 'solid'}`,
    attr: { 'aria-hidden': 'true' },
  });
  if (e.hue) sample.setCssProps({ '--thoughtknot-swatch': hueColour(e.hue, 'line') });
  li.appendText(e.means);
}

/** The rules' legend (rule_look_legend), in `slot`: each rule that gave something drawn a look, with what it means. */
export function renderRuleLegend(slot: HTMLElement, rules: RulesShown | undefined): void {
  if (!rules?.legend.length) return;
  const list = slot.createEl('ul', {
    cls: 'thoughtknot-legend thoughtknot-rule-legend',
    attr: { 'aria-label': word('strip.legend') },
  });
  for (const e of rules.legend) legendRow(list, e);
}
