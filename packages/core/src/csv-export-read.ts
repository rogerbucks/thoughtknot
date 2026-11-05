// ThoughtKnot's own CSV export read back (editor spec §67 format_loss_stated, §16 export_lossless). A table whose header
// starts kind, id, labels, from, type, to, then property columns such as `size:number`, is one export-data-csv.ts
// wrote. It needs no mapping: it says itself what each row is. It reads back into the very things and links exported:
// - an empty cell is a missing property, and `""` an empty text;
// - a text guarded against a spreadsheet's formula by an apostrophe has that one apostrophe taken off;
// - a number, a truth value, a day and an instant read back as the same value.
// What CSV could not keep is said: the `///` notes, and which rows were a view's faded context.
import gs from '@thoughtknot/graph-spec';
import type { Value } from '@thoughtknot/graph-spec';
import type { CsvTable } from './csv-read.ts';
import type { DataLink, DataThing, ExportedData, ValueKind } from './export-data-model.ts';

const FIXED = ['kind', 'id', 'labels', 'from', 'type', 'to'];
const KINDS: readonly ValueKind[] = ['text', 'number', 'boolean', 'date', 'datetime'];
// the apostrophe a writer puts before a text a spreadsheet would run, or one starting with an apostrophe already
const GUARDED = /^'[=+\-@\t\r']/;

/** A property column's key and the kind of its values: `size:number` gives size and number. */
function columnOf(header: string): { key: string; kind: ValueKind } | null {
  const at = header.lastIndexOf(':');
  const kind = header.slice(at + 1) as ValueKind;
  return at > 0 && KINDS.includes(kind) ? { key: header.slice(0, at), kind } : null;
}

/** Whether a table is one ThoughtKnot's CSV export wrote: its six fixed columns, then typed property columns. */
export const isExportTable = (t: Pick<CsvTable, 'header'>): boolean =>
  FIXED.every((h, i) => t.header[i] === h) && t.header.slice(FIXED.length).every((h) => columnOf(h) !== null);

/** A text cell as the text written, its formula guard taken off. */
const textOf = (cell: string): string => (GUARDED.test(cell) ? cell.slice(1) : cell);

/** A cell as the value it was written from, or undefined for an empty cell, a missing property. */
function valueOf(cell: string, kind: ValueKind, quotedEmpty: boolean): Value | undefined {
  if (cell === '') return kind === 'text' && quotedEmpty ? '' : undefined;
  if (kind === 'text') return textOf(cell);
  if (kind === 'number') return cell === '-0' ? -0 : Number(cell);
  if (kind === 'boolean') return cell === 'true';
  return new gs.GTime(kind, kind === 'datetime' ? cell.replace(/Z$/, '') : cell);
}

/** What an export read back holds, the row each thing and link was on (0-based), and what CSV could not keep. */
export interface ExportRead {
  data: Pick<ExportedData, 'things' | 'links'>;
  thingRows: number[];
  linkRows: number[];
  /** Rows that were a view's faded context: read as things and links, the fading itself not kept. */
  faded: number;
}

/** The things and links an export table holds, as they were exported. */
export function exportRead(table: CsvTable): ExportRead {
  const columns = table.header.slice(FIXED.length).map((h) => columnOf(h));
  const out: ExportRead = { data: { things: [], links: [] }, thingRows: [], linkRows: [], faded: 0 };
  table.rows.forEach((cells, r) => {
    const [kind = '', id = '', labels = '', from = '', type = '', to = ''] = cells;
    const props: Record<string, Value> = {};
    columns.forEach((c, i) => {
      const at = FIXED.length + i;
      const v = c && valueOf(cells[at] ?? '', c.kind, table.quotedEmpty.has(`${r}:${at}`));
      if (c && v !== undefined) props[c.key] = v;
    });
    const text = (cell: string) => textOf(cell);
    if (kind.startsWith('faded ')) out.faded++;
    if (kind.endsWith('thing')) {
      const thing: DataThing = [text(id), labels ? labels.split(';') : [], { ...props, id: text(id) }];
      out.data.things.push(thing);
      out.thingRows.push(r);
    } else if (kind.endsWith('link')) {
      const link: DataLink = [text(from), type, text(to), props];
      out.data.links.push(link);
      out.linkRows.push(r);
    }
  });
  return out;
}
