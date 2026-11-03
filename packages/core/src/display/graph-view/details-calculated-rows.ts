// The calculated values of the selected thing, in its details (editor spec §57, calc_details_shown). Each row is
// marked as worked out and shows its expression. It has no field to change it: a calculated value is never typed.
import { word } from '@thoughtknot/core';
import type { Graph } from '@thoughtknot/graph-spec';
import { calculatedDetails } from '../../calculated-details.ts';

/** The calculated values of thing `key` at the end of `parent`; nothing is added when there are none. */
export function renderCalculated(parent: HTMLElement, graph: Graph | undefined, key: string): void {
  const rows = graph ? calculatedDetails(graph, key) : [];
  if (!rows.length) return;
  const box = parent.createDiv({ cls: 'thoughtknot-calculated' });
  box.createDiv({ cls: 'thoughtknot-calculated-title', text: word('details.calculated') });
  for (const r of rows) {
    const row = box.createDiv({ cls: 'thoughtknot-calculated-row' });
    row.createSpan({ cls: 'thoughtknot-calculated-name', text: r.name });
    row.createSpan({ cls: 'thoughtknot-calculated-value', text: r.note ? `${r.shown} (${r.note})` : r.shown });
    row.createDiv({
      cls: 'thoughtknot-calculated-from',
      text: word('details.calculated-from', { expression: r.expression }),
    });
  }
}
