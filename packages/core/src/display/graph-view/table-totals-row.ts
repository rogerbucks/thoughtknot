// The filters and the totals of a graph drawn as a table (spec §57, table_view). A box above the table for each column
// takes what rows to keep. A Total row under the last row says what each number column adds up to. It follows the rows
// kept. A row that does not pass is hidden, never taken out, so sorting, the keys and the focus go on as they were.
import { word } from '@thoughtknot/core';
import type { DiagramTable } from '@thoughtknot/core';
import { cellPasses, tableTotals, totalSaid } from '../../table-totals.ts';

/** The Total row, last in the table, and the filter boxes above it. `refresh` says the totals again over the rows kept. */
export function bindTableTotals(
  wrap: HTMLElement,
  scroll: HTMLElement,
  things: HTMLTableElement,
  t: DiagramTable,
): void {
  const foot = things.createEl('tfoot').createEl('tr', { cls: 'thoughtknot-total-row', attr: { role: 'row' } });
  foot.createEl('th', {
    cls: 'thoughtknot-row-head',
    attr: { role: 'rowheader', scope: 'row' },
    text: word('table.total'),
  });
  const cells = t.columns.map(() => foot.createEl('td', { attr: { role: 'gridcell' } }));
  const typed = t.columns.map(() => '');
  const byKey = new Map(t.rows.map((r) => [r.key, r]));
  const passes = (row: DiagramTable['rows'][number]) =>
    typed.every((want, c) => cellPasses(want, row.cells[c] ?? '', row.numbers[c] ?? null));
  const refresh = () => {
    const kept = new Set<string>();
    for (const tr of Array.from(things.querySelectorAll<HTMLElement>('tbody tr'))) {
      const row = byKey.get(tr.getAttribute('data-key') ?? '');
      const ok = !row || passes(row);
      tr.hidden = !ok;
      if (ok && row) kept.add(row.key);
    }
    tableTotals(t, (r) => kept.has(r.key)).forEach((total, c) =>
      cells[c]?.setText(total ? totalSaid(total, t.units[c] ?? '') : ''),
    );
  };
  const bar = wrap.createDiv({
    cls: 'thoughtknot-table-filters',
    attr: { role: 'group', 'aria-label': word('table.filters') },
  });
  t.columns.forEach((name, c) => {
    const box = bar.createEl('input', {
      type: 'search',
      cls: 'thoughtknot-table-filter',
      attr: { placeholder: name, 'aria-label': word('table.filter-by', { name }) },
    });
    box.addEventListener('input', () => {
      typed[c] = box.value;
      refresh();
    });
  });
  wrap.insertBefore(bar, scroll);
  refresh();
}
