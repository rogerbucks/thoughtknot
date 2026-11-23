// The legend of a highlight (editor spec ES§75, ai_query_merge). Each part of a merged query has its own mark. The
// legend names each one: its badge, in its colour, beside what the part is called. The badge and colour come from the
// one mark rule (query-marks.ts), so the legend matches what the painters draw. A query not merged has one line.
// Built with the plain DOM, so it draws the same in a card and in a real browser test. Nothing here is ever sent.
import { word } from '../../words.ts';
import type { WordKey } from '../../words.ts';
import type { QueryLegendEntry, QueryMark } from '../../filter.ts';
import { PALETTES } from '../../palette.ts';
import { drawnOf, queryLabel, queryLine } from '../../query-marks.ts';

/** The class of the legend list. */
export const QUERY_LEGEND = 'thoughtknot-query-legend';
/** The class of each badge in the legend, and beside each part of a merged query. */
export const QUERY_LEGEND_BADGE = 'thoughtknot-query-legend-badge';

/** The mark `mark` in words, such as "Star mark, Orange", so it is never told by its look alone. */
export const markSaid = (mark: QueryMark): string =>
  word('filter.query.mark', {
    badge: word(`rules.badge.${mark.badge}` as WordKey),
    colour: word(`rules.colour.${mark.colour}` as WordKey),
  });

/** A badge for `mark` at the end of `el`: its glyph, painted in its colour as the drawing's ring and badge are. */
export function legendBadge(el: Element, mark: QueryMark): HTMLElement {
  const d = drawnOf([mark]);
  const badge = el.ownerDocument.createElement('span');
  badge.setAttribute('class', QUERY_LEGEND_BADGE);
  badge.textContent = d?.glyph ?? '';
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', markSaid(mark));
  badge.setAttribute('data-query-badge', d?.glyph ?? '');
  // the colours as custom properties, as the drawing's marks set them (focus-marks.ts), for the stylesheet to paint
  const style = (badge as HTMLElement & { style?: CSSStyleDeclaration }).style;
  if (d) style?.setProperty('--thoughtknot-query-line', queryLine(d.hue, PALETTES.obsidian));
  if (d) style?.setProperty('--thoughtknot-query-label', queryLabel(d.hue, PALETTES.obsidian));
  el.appendChild(badge);
  return badge;
}

/** The legend of `entries` at the end of `el`, a line for each; nothing for none. */
export function queryLegendIn(el: Element, entries: readonly QueryLegendEntry[]): HTMLElement | null {
  if (!entries.length) return null;
  const doc = el.ownerDocument;
  const list = doc.createElement('ul');
  list.setAttribute('class', QUERY_LEGEND);
  list.setAttribute('aria-label', word('filter.query.legend'));
  for (const e of entries) {
    const item = doc.createElement('li');
    item.setAttribute('data-part', e.id);
    legendBadge(item, e.mark);
    const said = doc.createElement('span');
    said.textContent = e.said;
    item.appendChild(said);
    list.appendChild(item);
  }
  el.appendChild(list);
  return list;
}
