// The calculated values of a table (editor spec §57, table_view). A schema's calculated values are worked out for the
// things drawn, and each is a column of the table after the properties. Host-free.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';
import { formatCount } from './locale-formats.ts';
import type { GraphDrawing } from './note-reading.ts';

/** What a calculated value says in its cell: the number with its unit, or nothing where it could not be worked out. */
export function calcText(v: { value: number | null; unit?: string } | undefined): string {
  if (!v || v.value === null) return '';
  return `${formatCount(v.value)}${v.unit ? ` ${v.unit}` : ''}`;
}

/** The calculated values the schema declares for the things drawn, by thing, and their names (not a property's). */
export function calculatedOf(drawing: Pick<GraphDrawing, 'boxes'>, g: Graph | undefined, taken: string[]) {
  const none = {
    names: [] as string[],
    units: [] as string[],
    values: new Map<string, Record<string, { value: number | null; unit?: string }>>(),
  };
  if (!g) return none;
  const found = gs.calculate(
    g,
    drawing.boxes.map((b) => b.key),
  ).values;
  for (const b of drawing.boxes) {
    const mine = Object.hasOwn(found, b.key) ? found[b.key] : undefined;
    if (!mine) continue;
    none.values.set(b.key, mine);
    for (const [name, v] of Object.entries(mine)) {
      if (taken.includes(name)) continue;
      let at = none.names.indexOf(name);
      if (at < 0) at = none.names.push(name) - 1;
      if (!none.units[at] && v.unit) none.units[at] = v.unit;
    }
  }
  return none;
}

/** The number a property holds, or null where it holds none. */
export const numberOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
