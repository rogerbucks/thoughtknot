// The rows of a note read in parts, kept between sessions (editor spec §53, scale_parts_kept). A huge note takes
// seconds to read into the store. Where a host has a lasting place for them, its rows are kept there by the digest of
// the text they were read from. Opened again with the same text, the note is not read again.
//
// The kept rows are only a copy, which can be thrown away at any time (text_is_the_store). Rows from other text, or
// rows that are broken, are never used: the note is read again and its rows kept afresh.
import { sha256 } from './ai-digest.ts';
import type { NoteRows } from './mesh-index-rows.ts';

/** A host's lasting place for kept rows: text by name. A read of a name not kept gives null. Each may fail. */
export interface KeptPlace {
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
}

/** The version of what is kept, part of every name. Raise it with any change to the rows, so old ones are never read. */
export const KEPT_VERSION = 1;

/** The name a note's rows are kept under: a digest of the note's path, so a path never names a file. */
export const keptName = (note: string): string => `rows-${KEPT_VERSION}-${sha256(note).slice(0, 32)}.json`;

const isText = (v: unknown): v is string => typeof v === 'string';
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isSpan = (v: unknown): boolean =>
  v === null ||
  (typeof v === 'object' && isCount((v as { line?: unknown }).line) && isCount((v as { end?: unknown }).end));
const rowsOk = (v: unknown, fields: Record<string, (x: unknown) => boolean>): boolean =>
  Array.isArray(v) &&
  v.every(
    (r) =>
      typeof r === 'object' &&
      r !== null &&
      Object.entries(fields).every(([k, ok]) => ok((r as Record<string, unknown>)[k])),
  );

/** `text` read back as the rows of `note` read from text with digest `version`; null when they are not, or are broken. */
export function keptRows(text: string, note: string, version: string): NoteRows | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (r['note'] !== note || r['version'] !== version) return null;
  const ok =
    rowsOk(r['things'], {
      note: isText,
      graph: isText,
      key: isText,
      kind: isText,
      text: isText,
      group: isText,
      props: isText,
      span: isSpan,
    }) &&
    rowsOk(r['links'], {
      note: isText,
      graph: isText,
      n: isCount,
      from: isText,
      type: isText,
      reading: isText,
      to: isText,
      fromGroup: isText,
      toGroup: isText,
      span: isSpan,
    }) &&
    rowsOk(r['groups'], {
      note: isText,
      graph: isText,
      id: isText,
      label: isText,
      by: isText,
      things: isCount,
      links: isCount,
    }) &&
    rowsOk(r['between'], { note: isText, graph: isText, from: isText, to: isText, links: isCount });
  return ok ? (v as NoteRows) : null;
}

/**
 * The rows of `note` with text `text`: the kept ones when `place` holds them for this text, else read by `read` and
 * then kept. A place that fails costs only a reading: the note is read, and nothing is kept.
 */
export async function rowsKeptOrRead(
  place: KeptPlace | undefined,
  note: string,
  text: string,
  read: () => Promise<NoteRows>,
): Promise<NoteRows> {
  const version = sha256(text);
  const name = keptName(note);
  if (place) {
    const kept = await place.read(name).catch(() => null);
    const rows = kept === null ? null : keptRows(kept, note, version);
    if (rows) return rows;
  }
  const rows = await read();
  if (place && rows.version === version) await place.write(name, JSON.stringify(rows)).catch(() => undefined);
  return rows;
}
