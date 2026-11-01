// Why a graph is shown as text instead of drawn (spec §9, layout_contained). A banner says in plain words which limit
// the graph is over and the numbers, or how long its layout was given. An icon sits beside the words, never colour
// alone. The words are the core's (refusal-words.ts), shared with the browser editor's page.
import { refusalWords } from '../hosts/refusal-words.ts';
import { formatCount, formatSize, word } from '@thoughtknot/core';
import type { Refusal } from '@thoughtknot/core';
import { button } from './button.ts';
import { setIcon } from './host.ts';

/**
 * Puts the banner saying why the graph is not drawn at the end of `parent`. A layout that ran out of time or was stopped
 * offers Try again, when `again` is given (risk UX-4).
 */
export function refusalBanner(parent: HTMLElement, r: Refusal, again?: () => void): HTMLElement {
  const banner = parent.createDiv({ cls: 'thoughtknot-banner thoughtknot-refusal', attr: { role: 'alert' } });
  const icon = banner.createSpan({ cls: 'thoughtknot-refusal-icon' });
  setIcon(icon, r.reason === 'too-large' ? 'alert-triangle' : 'clock');
  banner.createSpan({ text: refusalWords(r, { word, formatCount, formatSize }) });
  if (again && r.reason !== 'too-large')
    button(banner, word('refusal.try-again'), 'refresh-cw', again, word('refusal.try-again'));
  return banner;
}
