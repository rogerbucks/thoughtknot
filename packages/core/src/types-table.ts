// The table, a diagram type the host draws as a plain table rather than Graphviz (editor spec §15, diagram_type_set).
// Each thing is a row, with its kind and properties, and each link a row, in the order drawn. It also holds the way in
// to a graph too large for one drawing: the table, or a view (large_way_in). And it holds the types that, wide on a
// phone, scroll one way only (wide_types_phone). Host-free.
import type { Graph } from '@thoughtknot/graph-spec';
import gs from '@thoughtknot/graph-spec';
import { valueText } from './inline-properties.ts';
import { formatCount } from './locale-formats.ts';
import type { GraphDrawing } from './note-reading.ts';
import type { DiagramType } from './style-graph.ts';
import { LARGE_GRAPH } from './types.ts';
import { word } from './words.ts';

/** A graph as a table: its things' columns and rows, and its links' rows, each row known by its thing or link. */
export interface DiagramTable {
  /** Thing, Kind, then each property the things carry, in the order first written. */
  columns: string[];
  /** For each column, whether it holds numbers to total: a number property, or a calculated value (§57). */
  numeric: boolean[];
  /** The calculated values among the columns, by name. They come last, and are worked out, never typed. */
  calculated: string[];
  /** The unit of each column's numbers, or empty text. */
  units: string[];
  /** Each row's cells, and the number behind each: null where the cell is not a number or has none. */
  rows: { key: string; cells: string[]; numbers: (number | null)[] }[];
  /** Each link: from, its reading, to, and its properties as `name: value`, by name. */
  links: { index: number; cells: [string, string, string]; properties: string }[];
}

/** The drawing as a table: each thing with its kind and properties (from `g`, the graph as read), and each link. */
export function tableOf(drawing: Pick<GraphDrawing, 'boxes' | 'links'>, g?: Graph): DiagramTable {
  const own = drawing.boxes.map((b) => {
    const p = g?.nodes.has(b.key) ? g.p(b.key) : {};
    // the property that gives a thing its text is its Thing cell, not a column of its own; cut text keeps its column
    const textKey = Object.keys(p).find((k) => k !== 'id' && p[k] === b.text);
    return new Map(Object.entries(p).filter(([k]) => k !== 'id' && k !== textKey));
  });
  const columns = [...new Set(own.flatMap((p) => [...p.keys()]))];
  const worked = calculatedOf(drawing, g, columns);
  const textOf = new Map(drawing.boxes.map((b) => [b.key, b.text]));
  const drawn = new Set(drawing.boxes.map((b) => b.key));
  // a link that says which written link it is (a view's) has that link's properties; otherwise, by its place
  const edges = g?.edges.filter(([s, , t]) => drawn.has(s) && drawn.has(t)) ?? [];
  const heads = [word('table.thing'), word('table.kind'), ...columns, ...worked.names];
  const rows = drawing.boxes.map((b, i) => {
    const props = columns.map((c) => (own[i]?.has(c) ? own[i]?.get(c) : undefined));
    const calc = worked.names.map((n) => worked.values.get(b.key)?.[n]);
    return {
      key: b.key,
      cells: [b.text, b.kind, ...props.map((v) => (v === undefined ? '' : valueText(v))), ...calc.map(calcText)],
      numbers: [
        null,
        null,
        ...props.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)),
        ...calc.map((v) => v?.value ?? null),
      ],
    };
  });
  const numeric = heads.map((_, c) => rows.some((r) => r.numbers[c] !== null));
  return {
    columns: heads,
    numeric,
    calculated: worked.names,
    units: heads.map((_, c) =>
      c < heads.length - worked.names.length ? '' : (worked.units[c - (heads.length - worked.names.length)] ?? ''),
    ),
    rows,
    links: drawing.links.map((l, index) => {
      const props = (l.edge !== undefined ? g?.edges[l.edge] : edges[index])?.[3] ?? {};
      return {
        index,
        cells: [textOf.get(l.from) ?? l.from, l.reading, textOf.get(l.to) ?? l.to],
        properties: Object.entries(props)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, v]) => `${k}: ${valueText(v)}`)
          .join(', '),
      };
    }),
  };
}

/**
 * The way in to a graph of more than `LARGE_GRAPH` things (§15, large_way_in). One drawing of them all would be
 * crowded, so the table and a view are offered, in words. Null for a smaller graph.
 */
export function wayIn(things: number): { count: number; say: string } | null {
  if (things <= LARGE_GRAPH) return null;
  return {
    count: things,
    say: word('diagram.way-in', { count: things }),
  };
}

/** The types that grow long one way, and on a phone, when wide, scroll in that one direction only (wide_types_phone). */
export const ONE_WAY_TYPES: readonly DiagramType[] = ['tree', 'flow', 'timeline'];

/**
 * Whether a drawing of `type`, `width` wide at natural size, scrolls one way only in a card `room` wide (§15,
 * wide_types_phone). That is on a phone, for a tree, a flow or a timeline wider than its card. It is fitted to its
 * height and scrolled across (zoom.ts, `Zoom`'s `across`), rather than shrunk to the card's width until it cannot be
 * read.
 */
export function scrollsOneWay(type: DiagramType, phone: boolean, width: number, room: number): boolean {
  return phone && ONE_WAY_TYPES.includes(type) && width > room;
}

/** What a calculated value says in its cell: the number with its unit, or nothing where it could not be worked out. */
function calcText(v: { value: number | null; unit?: string } | undefined): string {
  if (!v || v.value === null) return '';
  return `${formatCount(v.value)}${v.unit ? ` ${v.unit}` : ''}`;
}

/** The calculated values the schema declares for the things drawn, by thing, and their names (not a property's). */
function calculatedOf(drawing: Pick<GraphDrawing, 'boxes'>, g: Graph | undefined, taken: string[]) {
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
