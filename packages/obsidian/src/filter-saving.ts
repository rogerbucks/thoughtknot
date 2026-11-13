// A card's filters saved by name (editor spec ES§25, untangle_filter_saved). Roger, 13 Nov 2026: "also allow a save of
// the query tree". The Filter panel picks one again anywhere. Only where the note is edited, never in reading view,
// does it save one or delete one. Saving writes one NamedFilter line in the graph's style block. Deleting takes it out
// and says so with an Undo, which puts the note back only while it is still as the delete left it.
import { namedFilterRemoved, namedFiltersOf, word } from '@thoughtknot/core';
import type { NamedFilterSave, NamedFilters, StyleGraph } from '@thoughtknot/core';
import type { Exploring } from '@thoughtknot/core/display/graph-view/view-options';
import type ThoughtKnotPlugin from './main';
import { changeNote } from './rule-removal';
import { writeStyle } from './style-write';
import { noticeWithUndo } from './undo-notice';
import { exploringFor } from './view-block';

/** What a card's style saved to open again: its exploration (ES§71, explore_saved) and its filters saved by name. */
export function savedFor(
  plugin: ThoughtKnotPlugin,
  path: string,
  graph: string,
  style: StyleGraph,
  readOnly: () => boolean,
): { exploring: Exploring; named: NamedFilters } {
  return {
    exploring: exploringFor(plugin, path, graph, style, readOnly),
    named: namedFor(plugin, path, graph, style, readOnly),
  };
}

/** The filters saved by name in the style of `graph`, and, unless `readOnly`, how to save and delete one. */
export function namedFor(
  plugin: ThoughtKnotPlugin,
  path: string,
  graph: string,
  style: StyleGraph,
  readOnly: () => boolean,
): NamedFilters {
  const saved = namedFiltersOf(style.named);
  if (readOnly()) return { saved };
  const save = (named: NamedFilterSave) =>
    void writeStyle(plugin, path, graph, { named }, word('filter.saved.done', { name: named.name }));
  const remove = (name: string) => void removeNamed(plugin, path, graph, name);
  return { saved, save, remove };
}

/** Deletes the filter named `name` from the note at `path`, and says so with an Undo. */
async function removeNamed(plugin: ThoughtKnotPlugin, path: string, graph: string, name: string): Promise<void> {
  const done = await changeNote(plugin, path, (note) => namedFilterRemoved(note, graph, name));
  if ('refused' in done) return noticeWithUndo(word('blocks.style-failed', { why: done.refused }));
  noticeWithUndo(word('filter.saved.removed', { name }), async () => {
    const back = await changeNote(plugin, path, (note) =>
      note === done.after ? { note: done.before } : { refused: word('filter.saved.changed') },
    );
    return 'refused' in back ? back.refused : word('filter.saved.back', { name });
  });
}
