// An Excel workbook (.xlsx) read as tables, in plain JavaScript (ES§63 connector_files_to_gql, ES§67
// format_untrusted_files). No library, no WebAssembly and no network.
// - A workbook is a zip of XML files. So it reads the zip, inflates what it needs and scans the XML.
// - Read-only. It never runs a macro, a formula or a link. A formula's cell gives the value Excel last saved.
// - Untrusted: every size and offset is checked. A part is inflated only to the size it declares.
//   A file with a document type line is refused, and so is one over the limits. Each sheet is a table.
// - Loss stated: dates come back as ISO text, an error cell as nothing, and merged cells and styles are not read.
import type { CsvTable } from './csv-read.ts';
import { word } from './words.ts';
import { tokens } from './xml-scan.ts';
import { Damaged, TooBig, partText as part, zipEntries, u32 } from './zip-read.ts';
import type { ZipEntry } from './zip-read.ts';

/** The text of the part `name` of the zip, or null when there is none. */
const partText = (b: Uint8Array, zip: Map<string, ZipEntry>, name: string, most = WORKBOOK_LIMITS.part) =>
  part(b, zip, name, most);

/** Why a workbook was not read, as a sentence naming what to do. */
export interface WorkbookRefusal {
  why: 'not-xlsx' | 'too-large' | 'too-many-rows' | 'too-many-columns' | 'cell-too-long' | 'damaged' | 'no-sheet';
  refused: string;
}

/**
 * The most a workbook may hold before it is refused. That is its bytes, one inflated part, a small part such as the
 * sheet list, and all its parts together. Also its sheets, its shared strings, a sheet's rows and columns, and a cell.
 */
export const WORKBOOK_LIMITS = {
  bytes: 32 * 1024 * 1024,
  part: 64 * 1024 * 1024,
  meta: 4 * 1024 * 1024,
  total: 256 * 1024 * 1024,
  sheets: 100,
  strings: 1_000_000,
  rows: 20_000,
  columns: 500,
  cell: 10_000,
};

/** Thrown inside the reader when a limit is passed; turned into a refusal at the edge. */
class Over extends Error {
  why: 'too-large' | 'too-many-rows' | 'too-many-columns' | 'cell-too-long';
  constructor(why: 'too-large' | 'too-many-rows' | 'too-many-columns' | 'cell-too-long') {
    super(why);
    this.why = why;
  }
}

// ---- the parts of a workbook ----------------------------------------------------------------------------------

/** The shared strings, in order; a phonetic hint is left out, a rich run's pieces are joined. */
function sharedStrings(xml: string): string[] {
  const out: string[] = [];
  let [cur, inT, hint] = ['', false, 0];
  for (const t of tokens(xml)) {
    if ('open' in t) {
      if (t.open === 'si') cur = '';
      else if (t.open === 'rPh') hint++;
      else if (t.open === 't') inT = true;
    } else if ('close' in t) {
      if (t.close === 'si') {
        if (out.length >= WORKBOOK_LIMITS.strings) throw new Over('too-large');
        out.push(cur);
      } else if (t.close === 'rPh') hint--;
      else if (t.close === 't') inT = false;
    } else if (inT && !hint) cur += t.text;
  }
  return out;
}

/** The sheets of the workbook, in order, each with the id of the relation that names its part; and its date system. */
function sheetList(xml: string): { sheets: { name: string; rid: string }[]; date1904: boolean } {
  const sheets: { name: string; rid: string }[] = [];
  let date1904 = false;
  for (const t of tokens(xml))
    if ('open' in t && t.open === 'sheet' && t.attrs['name'] && t.attrs['id'] && t.attrs['state'] !== 'veryHidden')
      sheets.push({ name: t.attrs['name'], rid: t.attrs['id'] });
    else if ('open' in t && t.open === 'workbookPr') date1904 = ['1', 'true'].includes(t.attrs['date1904'] ?? '');
  return { sheets, date1904 };
}

/** Where each relation of a part points, by its id. */
function relations(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of tokens(xml))
    if ('open' in t && t.open === 'Relationship' && t.attrs['Id'] && t.attrs['Target'])
      out.set(t.attrs['Id'], t.attrs['Target']);
  return out;
}

/** The number formats that make a number a date or a time: the built-in ones, and a custom one that spells one. */
function isDateFormat(id: number, code: string | undefined): boolean {
  if (code === undefined)
    return (id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58);
  const bare = code.replace(/"[^"]*"|\[[^\]]*\]|\\.|_.|\*./g, '');
  return /[ymdhs]/i.test(bare) && !/^general$/i.test(bare);
}

/** Which cell styles (by index) are dates, from styles.xml. */
function dateStyles(xml: string): boolean[] {
  const formats = new Map<number, string>();
  const styles: boolean[] = [];
  let inXfs = false;
  for (const t of tokens(xml)) {
    if ('open' in t) {
      if (t.open === 'numFmt') formats.set(Number(t.attrs['numFmtId']), t.attrs['formatCode'] ?? '');
      else if (t.open === 'cellXfs') inXfs = true;
      else if (t.open === 'xf' && inXfs) {
        const id = Number(t.attrs['numFmtId'] ?? 0);
        styles.push(isDateFormat(id, formats.get(id)));
      }
    } else if ('close' in t && t.close === 'cellXfs') inXfs = false;
  }
  return styles;
}

/** A number as Excel shows it to fifteen digits, so 0.1+0.2 is 0.3 and not 0.30000000000000004. */
const numberText = (v: string): string => {
  const n = Number(v);
  return v.trim() === '' || !Number.isFinite(n) ? v : String(Number(n.toPrecision(15)));
};

/** A date serial as ISO text: the day, with the time when there is one; a serial under one is a time alone. */
function serialText(v: string, date1904: boolean): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 2_958_465) return numberText(v);
  const days = Math.floor(n);
  const secs = Math.round((n - days) * 86400);
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : days < 61 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  const d = new Date(epoch + days * 86_400_000 + secs * 1000);
  const [date, time] = [d.toISOString().slice(0, 10), d.toISOString().slice(11, 19)];
  if (days === 0 && secs > 0) return time;
  return secs === 0 ? date : `${date} ${time}`;
}

/** Excel's column letters as a 0-based number: A is 0, Z 25, AA 26. */
function columnOf(ref: string): number {
  let n = 0;
  for (const c of ref) {
    const k = c.charCodeAt(0) - 64;
    if (k < 1 || k > 26) break;
    n = n * 26 + k;
  }
  return n - 1;
}

interface SheetRow {
  number: number;
  cells: string[];
}

/** The rows of a sheet's XML that hold something, each cell as text; empty rows are left out. */
function sheetRows(xml: string, strings: string[], dates: boolean[], date1904: boolean): SheetRow[] {
  const rows: SheetRow[] = [];
  let row: SheetRow | null = null;
  let cell: { col: number; type: string; style: number; v: string; inline: string } | null = null;
  let [field, nextCol, nextRow] = ['', 0, 0];
  for (const t of tokens(xml)) {
    if ('open' in t) {
      if (t.open === 'row') {
        nextRow = Number(t.attrs['r']) || nextRow + 1;
        [row, nextCol] = [{ number: nextRow, cells: [] }, 0];
      } else if (t.open === 'c' && row) {
        const col = t.attrs['r'] ? columnOf(t.attrs['r']) : nextCol;
        if (col < 0 || col >= WORKBOOK_LIMITS.columns) throw new Over('too-many-columns');
        cell = { col, type: t.attrs['t'] ?? 'n', style: Number(t.attrs['s'] ?? 0), v: '', inline: '' };
        nextCol = col + 1;
      } else if (t.open === 'v' || t.open === 't') field = t.open;
    } else if ('close' in t) {
      if (t.close === 'v' || t.close === 't') field = '';
      else if (t.close === 'c' && row && cell) {
        const text = cellText(cell, strings, dates, date1904);
        if (text.length > WORKBOOK_LIMITS.cell) throw new Over('cell-too-long');
        while (row.cells.length < cell.col) row.cells.push('');
        row.cells[cell.col] = text;
        cell = null;
      } else if (t.close === 'row' && row) {
        if (row.cells.some((c) => c !== '')) {
          if (rows.length >= WORKBOOK_LIMITS.rows + 1) throw new Over('too-many-rows');
          rows.push(row);
        }
        row = null;
      }
    } else if (cell && field === 'v') cell.v += t.text;
    else if (cell && field === 't') cell.inline += t.text;
  }
  return rows;
}

/** One cell's value as text, by the kind of cell it is. */
function cellText(
  c: { type: string; style: number; v: string; inline: string },
  strings: string[],
  dates: boolean[],
  date1904: boolean,
): string {
  switch (c.type) {
    case 's':
      return strings[Number(c.v)] ?? '';
    case 'str':
    case 'd':
      return c.v.trim();
    case 'inlineStr':
      return c.inline;
    case 'b':
      return c.v.trim() === '1' ? 'TRUE' : 'FALSE';
    case 'e':
      return '';
    default:
      return dates[c.style] ? serialText(c.v.trim(), date1904) : numberText(c.v.trim());
  }
}

// ---- the edge -------------------------------------------------------------------------------------------------

/** A workbook opened: its zip, its sheets in order with each one's part, and what every sheet shares. */
interface Opened {
  bytes: Uint8Array;
  zip: Map<string, ZipEntry>;
  sheets: { name: string; part: string }[];
  date1904: boolean;
}

/** A part's path with its `.` and `..` steps taken out. It is only a name to look up in the zip, never a file path. */
function normal(path: string): string {
  const out: string[] = [];
  for (const step of path.split('/')) {
    if (step === '..') out.pop();
    else if (step !== '.' && step !== '') out.push(step);
  }
  return out.join('/');
}

function open(bytes: Uint8Array): Opened | WorkbookRefusal {
  if (bytes.length > WORKBOOK_LIMITS.bytes)
    return { why: 'too-large', refused: word('reading.xlsx.too-large', { most: String(WORKBOOK_LIMITS.bytes) }) };
  if (u32(bytes, 0) !== 0x04034b50) return { why: 'not-xlsx', refused: word('reading.xlsx.not-xlsx') };
  const zip = zipEntries(bytes);
  // every part a sheet list could point at together stays under the most, since Import reads each sheet
  let declared = 0;
  for (const e of zip.values()) declared += e.size;
  if (declared > WORKBOOK_LIMITS.total) throw new Over('too-large');
  const book = partText(bytes, zip, 'xl/workbook.xml', WORKBOOK_LIMITS.meta);
  if (book === null) return { why: 'not-xlsx', refused: word('reading.xlsx.not-xlsx') };
  const { sheets, date1904 } = sheetList(book);
  if (sheets.length > WORKBOOK_LIMITS.sheets) throw new Over('too-large');
  const rels = relations(partText(bytes, zip, 'xl/_rels/workbook.xml.rels', WORKBOOK_LIMITS.meta) ?? '');
  const parts = sheets.flatMap((s) => {
    const target = rels.get(s.rid);
    if (!target) return [];
    const part = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    return [{ name: s.name, part: normal(part) }];
  });
  return { bytes, zip, sheets: parts, date1904 };
}

const MOST = {
  'too-large': WORKBOOK_LIMITS.part,
  'too-many-rows': WORKBOOK_LIMITS.rows,
  'too-many-columns': WORKBOOK_LIMITS.columns,
  'cell-too-long': WORKBOOK_LIMITS.cell,
};

function refusalOf(e: unknown): WorkbookRefusal {
  if (e instanceof TooBig) return refusalOf(new Over('too-large'));
  if (e instanceof Over)
    return {
      why: e.why,
      refused: word(`reading.xlsx.${e.why}`, {
        most: String(MOST[e.why]),
      }),
    };
  if (e instanceof Damaged || e instanceof RangeError) return { why: 'damaged', refused: word('reading.xlsx.damaged') };
  throw e;
}

/** The names of the sheets of a workbook, in order; or why it cannot be read. */
export function workbookSheets(bytes: Uint8Array): string[] | WorkbookRefusal {
  try {
    const o = open(bytes);
    return 'refused' in o ? o : o.sheets.map((s) => s.name);
  } catch (e) {
    return refusalOf(e);
  }
}

/** A name for a header cell that has none, and one for a header that repeats: `Column C`, `Total 2`. */
function headerOf(cells: string[], width: number): string[] {
  const seen = new Map<string, number>();
  return Array.from({ length: width }, (_, i) => {
    const base =
      (cells[i] ?? '').trim() || `Column ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} ${n}`;
  });
}

/**
 * The sheet `name` as a table. Its first row holding anything is the header. Each row after it that holds something
 * is a row, citing the number it has in the sheet. Or why it cannot be read.
 */
export function workbookTable(bytes: Uint8Array, name: string): CsvTable | WorkbookRefusal {
  try {
    const o = open(bytes);
    if ('refused' in o) return o;
    const sheet = o.sheets.find((s) => s.name === name);
    if (!sheet) return { why: 'no-sheet', refused: word('reading.xlsx.no-sheet', { name }) };
    const xml = partText(bytes, o.zip, sheet.part);
    if (xml === null) return { why: 'damaged', refused: word('reading.xlsx.damaged') };
    const strings = sharedStrings(partText(bytes, o.zip, 'xl/sharedStrings.xml') ?? '');
    const dates = dateStyles(partText(bytes, o.zip, 'xl/styles.xml', WORKBOOK_LIMITS.meta) ?? '');
    const [head, ...rest] = sheetRows(xml, strings, dates, o.date1904);
    const width = head ? head.cells.length : 0;
    if (!head || head.cells.every((c) => c === ''))
      return { why: 'no-sheet', refused: word('reading.xlsx.empty', { name }) };
    const table: CsvTable = {
      header: headerOf(head.cells, width),
      rows: rest.map((r) => {
        // a cell past the header that holds nothing is no extra cell
        let last = r.cells.length;
        while (last > 0 && r.cells[last - 1] === '') last--;
        return Array.from({ length: Math.max(width, last) }, (_, i) => r.cells[i] ?? '');
      }),
      lines: rest.map((r) => r.number),
      delimiter: ',',
      quotedEmpty: new Set(),
      uneven: [],
    };
    table.rows.forEach((r, row) => {
      if (r.length > width) table.uneven.push({ row, extra: r.length - width });
    });
    return table;
  } catch (e) {
    return refusalOf(e);
  }
}
