// A card's filters saved by name (editor spec ES§25, untangle_filter_saved). Roger, 13 Nov 2026: "also allow a save of
// the query tree". The Filter panel picks one again anywhere. Only where the note is edited, never in reading view,
// does it save one or delete one. Saving writes one NamedFilter line in the graph's style block. Deleting takes it out
// and says so with an Undo, which puts the note back only while it is still as the delete left it. Queries are saved
// by name the same way (ES§75), with their answers kept in this device's local storage, per vault.
import { Modal, Notice } from 'obsidian';
import type { App } from 'obsidian';
import { namedFilterRemoved, namedFiltersOf, queryCache, savedQueryRemove, savedQueryRenamed } from '@thoughtknot/core';
import { savedQueryWritten, word } from '@thoughtknot/core';
import type { DeviceStore, NamedFilterSave, NamedFilters, SavedQueries, StyleGraph } from '@thoughtknot/core';
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
  const queries = queriesFor(plugin, path, graph, style, readOnly);
  if (readOnly()) return { saved, queries };
  const save = (named: NamedFilterSave) =>
    void writeStyle(plugin, path, graph, { named }, word('filter.saved.done', { name: named.name }));
  const remove = (name: string) => void removeNamed(plugin, path, graph, name);
  return { saved, save, remove, queries };
}

/** Asks the person `said`; resolves true on Go ahead, false on Cancel or closing it. */
class Confirm extends Modal {
  private answer = false;

  constructor(
    app: App,
    private readonly said: string,
    private readonly done: (yes: boolean) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle(word('filter.saved-query.ask-title'));
    this.contentEl.createEl('p', { text: this.said });
    const row = this.contentEl.createDiv({ cls: 'thoughtknot-leave-row' });
    const yes = row.createEl('button', {
      text: word('filter.saved-query.yes'),
      cls: 'mod-cta',
      attr: { type: 'button' },
    });
    yes.addEventListener('click', () => ((this.answer = true), this.close()));
    const no = row.createEl('button', { text: word('filter.saved-query.no'), attr: { type: 'button' } });
    no.addEventListener('click', () => this.close());
  }

  override onClose(): void {
    this.done(this.answer);
  }
}

/** This device's local storage, as the cache of answers reads it; none where the host has none. */
function deviceStore(): DeviceStore | null {
  let local: Storage | undefined;
  try {
    local = (window as { localStorage?: Storage }).localStorage;
  } catch {
    return null; // storage turned off
  }
  if (!local) return null;
  const ls = local;
  return {
    get: (k) => ls.getItem(k),
    set: (k, v) => ls.setItem(k, v),
    remove: (k) => ls.removeItem(k),
    keys: () => Array.from({ length: ls.length }, (_, i) => ls.key(i) ?? ''),
  };
}

/** This vault's own id where Obsidian has one, which two vaults of the same name do not share; else its name. */
const vaultId = (host: App): string => (host as App & { appId?: string }).appId ?? host.vault.getName();

/** The queries saved in the style of `graph`, the answers kept for this vault, and, unless `readOnly`, their edits. */
function queriesFor(
  plugin: ThoughtKnotPlugin,
  path: string,
  graph: string,
  style: StyleGraph,
  readOnly: () => boolean,
): SavedQueries {
  const confirm = (said: string) => new Promise<boolean>((done) => new Confirm(plugin.app, said, done).open());
  const store = deviceStore();
  const kept = {
    saved: style.queries,
    confirm,
    ...(store && { answers: queryCache(store, vaultId(plugin.app)) }),
  };
  if (readOnly()) return kept;
  const told = (done: { refused: string } | object, said: string) =>
    new Notice('refused' in done ? word('blocks.style-failed', { why: done.refused }) : said);
  return {
    ...kept,
    save: (s) =>
      void changeNote(plugin, path, (note) => savedQueryWritten(note, graph, s)).then((d) =>
        told(d, word('filter.saved-query.done', { name: s.name })),
      ),
    rename: (from, to) =>
      void changeNote(plugin, path, (note) => savedQueryRenamed(note, graph, from, to)).then((d) =>
        told(d, word('filter.saved-query.renamed', { name: to })),
      ),
    remove: (name) =>
      void savedQueryRemove(graph, name, {
        ask: confirm,
        change: (edit) =>
          changeNote(plugin, path, edit).then((d) => told(d, word('filter.saved-query.removed', { name }))),
      }),
  };
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
