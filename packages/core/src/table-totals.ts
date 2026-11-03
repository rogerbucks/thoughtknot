// The totals under a table's number columns (editor spec §57, table_view, calc_measures_shared). A column of numbers,
// a property's or a calculated value's, is added up over the rows kept. A row with no number is counted as having none
// and never as zero. It is the same running total a filter uses (facet-totals.ts). Host-free and pure.
import { Running } from './facet-totals.ts';
import type { Total } from './facet-totals.ts';
import { formatCount } from './locale-formats.ts';
import type { DiagramTable } from './types-table.ts';
import { word } from './words.ts';

/** The total of each column of `table` over the rows `keep` accepts (all, if none is given); null for a column of text. Only the kinds that carry a number in
 * the column count: a thing of another kind is not said to have none. */
export function tableTotals(
  table: DiagramTable,
  keep?: (row: DiagramTable['rows'][number]) => boolean,
): (Total | null)[] {
  const runs = table.numeric.map((n) => (n ? new Running() : null));
  // a kind of thing that has no number in a column anywhere does not carry it, so it is not said to have none
  const carrying = table.numeric.map((n, c) =>
    n ? new Set(table.rows.filter((r) => r.numbers[c] !== null).map((r) => r.cells[1])) : null,
  );
  for (const row of table.rows) {
    if (keep && !keep(row)) continue;
    runs.forEach((run, c) => {
      if (run && carrying[c]?.has(row.cells[1])) run.add(row.numbers[c]);
    });
  }
  return runs.map((run) => run?.result() ?? null);
}

/** A total as words: the sum with its unit, or that there were no numbers, and how many things had none. */
export function totalSaid(t: Total, unit: string): string {
  const sum = t.total === null ? word('massive.total-none') : `${formatCount(t.total)}${unit ? ` ${unit}` : ''}`;
  return t.missing ? `${sum}, ${word('massive.total-missing', { count: t.missing })}` : sum;
}

/**
 * Whether a cell passes what was typed in its column's filter. Words match anywhere in the cell, in any case. In a
 * number column, `>5`, `<5`, `>=5`, `<=5` and `=5` compare the number. A cell with no number passes none of those.
 */
export function cellPasses(typed: string, cell: string, number: number | null): boolean {
  const want = typed.trim().toLowerCase();
  if (!want) return true;
  const op = /^(>=|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)$/.exec(want);
  if (!op) return cell.toLowerCase().includes(want);
  if (number === null) return false;
  const n = Number(op[2]);
  return op[1] === '>'
    ? number > n
    : op[1] === '<'
      ? number < n
      : op[1] === '>='
        ? number >= n
        : op[1] === '<='
          ? number <= n
          : number === n;
}
