// A data set kept linked or kept as a snapshot (editor spec §52, data_set_linked_or_kept). Way C of
// wiki/Data-tables-design.md, which Roger picked on 6 Nov 2026.
// - Linked is the default. A linked data set is fetched again only when the person asks, else its cached copy is shown.
// - A snapshot is a frozen copy saved as a file beside the note. The DataSet thing then names the copy, and the place it
//   came from, so it can be linked again. A snapshot is never fetched: it changes only when the person takes a new one.
// Host-free and pure: the host writes the file and the thing's properties.
import type { DataSetRef } from './data-set-reference.ts';
import { word } from './words.ts';

/** How a data set is kept: linked to its place, or as a snapshot beside the note. */
export type KeptAs = 'linked' | 'snapshot';

/** A data set as the graph keeps it: its reference, how it is kept, and where a snapshot came from. */
export interface KeptSet extends DataSetRef {
  kept: KeptAs;
  from?: string;
}

/** The DataSet thing's properties a change writes. A null removes the property. */
export type KeptEdit = Record<'place' | 'kept' | 'from' | 'version', string | null>;

/** How the data set `ref`, of a thing with properties `props`, is kept. */
export function keptOf(ref: DataSetRef, props: Record<string, unknown>): KeptSet {
  const from = props['from'];
  if (props['kept'] === 'snapshot' && typeof from === 'string') return { ...ref, kept: 'snapshot', from };
  return { ...ref, kept: 'linked' };
}

/** The place of the snapshot of data set `id`, beside the note at `note`: `Reports/Q3.md` gives `Reports/Q3.sales.csv`. */
export function snapshotPlace(note: string, id: string, place: string): string {
  const dot = place.lastIndexOf('.');
  const ext = dot > place.lastIndexOf('/') ? place.slice(dot) : '';
  const stem = note.replace(/\.md$/i, '');
  return `${stem}.${id}${ext}`;
}

/** The thing's properties once a snapshot of `set` is saved for the note at `note`, with the copy's `version`. */
export function snapshotEdit(set: KeptSet, note: string, version: string): KeptEdit {
  const from = set.kept === 'snapshot' && set.from ? set.from : set.place;
  return { place: snapshotPlace(note, set.id, from), kept: 'snapshot', from, version };
}

/** The thing's properties once `set` is linked to its place again. A linked set is linked already: no change. */
export function linkEdit(set: KeptSet): KeptEdit | null {
  if (set.kept !== 'snapshot' || !set.from) return null;
  return { place: set.from, kept: null, from: null, version: null };
}

/** Whether `set` is fetched now: a linked one when asked, or when no copy is kept yet; a snapshot never. */
export function fetchWanted(set: KeptSet, has: { cached: boolean; asked: boolean }): boolean {
  return set.kept === 'linked' && (has.asked || !has.cached);
}

/** The words a snapshot shows: where it is kept and what it is a copy of. A linked set shows none. */
export function keptWords(set: KeptSet): string | null {
  return set.kept === 'snapshot' ? word('reading.table.snapshot', { place: set.place, from: set.from ?? '' }) : null;
}
