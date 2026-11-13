// Taking a saved rule out of the note, and putting it back with one Undo (editor spec §56, rule_look_remove). A rule
// is moved up the same way, so it wins a clash (rule_look_order). The note is changed as a rule is saved: through its
// editor when open, so Cmd+Z works too, else in the vault. The note as it was, and as it was left, are kept. Undo puts
// the first back only while the note is still the second, so an edit made since is never lost.
import { Notice, TFile } from 'obsidian';
import { ruleMovedUp, ruleRemoved, word } from '@thoughtknot/core';
import type { RuleRemove } from '@thoughtknot/core';
import type ThoughtKnotPlugin from './main';
import { changeVaultNote } from './storage/plugin-notes';
import { replaceInEditor } from './block-editor/note-writing';

/** A rule just taken out: its meaning, and the note before and after. */
export interface Removal {
  means: string;
  before: string;
  after: string;
}

type Edit = (note: string) => { note: string } | { refused: string };

/** Changes the note at `path` by `edit`; gives the note before and after, or why it was not changed. */
export async function changeNote(
  plugin: ThoughtKnotPlugin,
  path: string,
  edit: Edit,
): Promise<{ before: string; after: string } | { refused: string }> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return { refused: word('blocks.view-note-gone') };
  let out: { before: string; after: string } | { refused: string } = { refused: '' };
  const run = (note: string) => {
    const r = edit(note);
    out = 'note' in r ? { before: note, after: r.note } : r;
    return 'note' in r ? r.note : note;
  };
  const cm = plugin.editorFor(file.path);
  if (cm) {
    const now = cm.state.doc.toString(),
      next = run(now);
    if (next !== now) replaceInEditor(cm, next);
  } else await changeVaultNote(plugin.app, file.path, run);
  return out;
}

/** Takes the rule `r` of `graph` out of the note at `path`. Says what was done; gives what Undo needs, or null. */
export async function removeRule(
  plugin: ThoughtKnotPlugin,
  path: string,
  graph: string,
  r: RuleRemove,
): Promise<Removal | null> {
  const done = await changeNote(plugin, path, (note) => ruleRemoved(note, graph, r));
  if ('refused' in done) {
    new Notice(word('blocks.style-failed', { why: done.refused }));
    return null;
  }
  new Notice(word('rules.removed', { means: r.means }));
  return { means: r.means, ...done };
}

/** Puts back the rule taken out, if the note is still as the removal left it. */
export async function putBack(plugin: ThoughtKnotPlugin, path: string, removal: Removal): Promise<void> {
  const done = await changeNote(plugin, path, (note) =>
    note === removal.after ? { note: removal.before } : { refused: word('rules.undo-changed') },
  );
  const said = 'refused' in done ? done.refused : word('rules.put-back', { means: removal.means });
  new Notice(said);
}

/** Moves the rule `r` of `graph` up in the note at `path`, before the rule above it, and says so. */
export async function moveRuleUp(plugin: ThoughtKnotPlugin, path: string, graph: string, r: RuleRemove): Promise<void> {
  const done = await changeNote(plugin, path, (note) => ruleMovedUp(note, graph, r));
  const said = 'refused' in done ? done.refused : word('rules.moved', { means: r.means });
  new Notice(said);
}
