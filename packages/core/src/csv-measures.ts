// A table's measures, read by the same code as a graph's (editor spec §57, calc_measures_shared; §63). A column the
// mapping calls a measure is a number for each row, or nothing where the cell is empty or not a number. It is the
// same `Measure` that calculated values and number properties give (measures.ts). So facet-totals.ts adds a table's
// column up with the code that adds up a graph's. A missing cell is never counted as zero (calc_gaps_said).
// Host-free and pure.
import { isNumber, nameOf } from './csv-mapping.ts';
import type { TableMapping } from './csv-mapping.ts';
import type { CsvTable } from './csv-read.ts';
import type { Measure } from './facet-totals.ts';

/** The measures of `table`, one for each column its `mapping` calls a measure, in the header's order. */
export function tableMeasures(table: CsvTable, mapping: TableMapping): Measure[] {
  const out: Measure[] = [];
  for (const map of mapping.columns) {
    if (map.as !== 'measure') continue;
    const at = table.header.indexOf(map.column);
    if (at < 0) continue;
    out.push({
      name: nameOf(map.column),
      unit: map.unit ?? '',
      values: table.rows.map((row) => {
        const cell = (row[at] ?? '').trim();
        return isNumber(cell) ? Number(cell) : null;
      }),
    });
  }
  return out;
}
