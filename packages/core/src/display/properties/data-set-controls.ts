// Keeping a data set linked or as a snapshot, from its details while its block is edited (editor spec §52,
// data_set_linked_or_kept). A linked data set offers to keep a snapshot: the host copies its file beside the note,
// and the thing is pointed at the copy. A snapshot says what it is a copy of, and offers to link again. The block is
// replaced through the editor, so the editor's own undo takes the change back. A refusal is said beside the button.
import {
  dataSetsOf,
  keptOf,
  keptWords,
  linkEdit,
  parseValue,
  setProperty,
  snapshotEdit,
  snapshotPlace,
  word,
} from '@thoughtknot/core';
import type { KeptEdit, NoteReading } from '@thoughtknot/core';

/** What a card's host does for its data sets (ES§52, data_set_linked_or_kept): none, no snapshot is offered. */
export interface DataSetHost {
  /** The note the card is in, beside which a snapshot is kept. */
  note: string;
  /**
   * Copies the file at `from`, found from the note, to `to`, or the first free name like it: an existing file is never
   * replaced. Resolves to where the copy is and its version (its digest), or null when it could not be copied.
   */
  copy: (from: string, to: string) => Promise<{ place: string; version: string } | null>;
}

/** What the controls need of the card and the editor open on it. */
export interface DataSetEditing {
  reading: NoteReading;
  graph: string;
  host: DataSetHost | undefined;
  /** The block as typed. */
  text: () => string;
  /** Replaces the block being edited with `text`. */
  replace: (text: string) => void;
}

/** `text` with the thing `id`'s properties set as `edit` says, or why not. */
export function keptText(text: string, graph: string, id: string, edit: KeptEdit): { text: string } | { why: string } {
  let now = text;
  for (const [key, value] of Object.entries(edit)) {
    const gql = value === null ? null : parseValue('text', value);
    if (gql && !gql.ok) return { why: gql.error };
    const r = setProperty(now, graph, { thing: id }, key, gql ? gql.gql : null);
    if (!r.ok) return { why: r.reason };
    now = r.text;
  }
  return { text: now };
}

/** The controls for the data set `id`, if it is one: how it is kept, and the button that changes it. */
export function dataSetControls(el: HTMLElement, id: string, e: DataSetEditing): void {
  const g = e.reading.world[e.graph];
  const ref = g ? dataSetsOf(g).find((r) => r.id === id) : undefined;
  const props = g?.nodes.get(id)?.[1];
  if (!e.host || !ref || !props) return;
  const host = e.host;
  const set = keptOf(ref, props);
  const box = el.createDiv({ cls: 'thoughtknot-data-set-kept' });
  box.createDiv({ text: keptWords(set) ?? word('details.data-set.linked', { place: set.place }) });
  const said = box.createDiv({ cls: 'thoughtknot-data-set-said', attr: { role: 'alert' } });
  const write = (edit: KeptEdit | null): void => {
    const r = edit ? keptText(e.text(), e.graph, id, edit) : null;
    if (r && 'why' in r) said.setText(r.why);
    else if (r) e.replace(r.text);
  };
  const press = async (): Promise<void> => {
    if (set.kept === 'snapshot') return write(linkEdit(set));
    const copied = await host.copy(set.place, snapshotPlace(host.note, set.id, set.place));
    if (copied === null) said.setText(word('details.data-set.copy-failed', { place: set.place }));
    else write({ ...snapshotEdit(set, host.note, copied.version), place: copied.place });
  };
  const label = word(set.kept === 'snapshot' ? 'details.data-set.link' : 'details.data-set.snapshot');
  box.createEl('button', { text: label, attr: { type: 'button' } }).addEventListener('click', () => void press());
}
