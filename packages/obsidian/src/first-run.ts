// A first graph from an example, then a short tour (editor spec §44, first_run_help). A graph with nothing in it yet
// offers Edit and Start from an example. The example is written into the note, after the block's own lines. The
// drawing that follows opens the tour. The command Show the tour opens it again on the drawing last used.
import { Notice, TFile } from 'obsidian';
import { exampleBlock, replaceBlock, withExample, word } from '@thoughtknot/core';
import { GUIDE_URL } from '@thoughtknot/core/display/editor/pane-empty';
import { cardInUse } from '@thoughtknot/core/display/graph-view/card-in-use';
import { whenPlaced } from '@thoughtknot/core/display/graph-view/placement';
import type ThoughtKnotPlugin from './main';
import type { HostCommand } from './host-commands';
import type { EditTarget } from './main';
import { noteToRewrite } from './reading-view';
import { changeVaultNote } from './storage/plugin-notes';

/** Whether the next drawing opens the tour: set when an example was written, and taken by the drawing that follows. */
let tourNext = false;

/** Whether this drawing opens the tour, which only the first drawing after an example does. */
export function takeTour(): boolean {
  const now = tourNext;
  tourNext = false;
  return now;
}

/** Writes the example into the block at `target`, while it is still `source`; says so when it has changed. */
async function writeExample(plugin: ThoughtKnotPlugin, target: EditTarget, source: string): Promise<void> {
  const file = plugin.app.vault.getAbstractFileByPath(target.path);
  let written = false;
  if (file instanceof TFile)
    await changeVaultNote(plugin.app, file.path, (note) => {
      const r = replaceBlock(note, { line: target.line, text: source }, withExample(source));
      written = r.ok;
      return r.ok ? r.note : note;
    });
  if (written) tourNext = true;
  else new Notice(word('first-run.not-written'));
}

/**
 * Shows a graph with nothing in it yet in `root`: what to write, then Edit and Start from an example. Where the card is
 * read-only, as in reading view, neither button is offered.
 */
export function renderEmpty(
  plugin: ThoughtKnotPlugin,
  root: HTMLElement,
  target: EditTarget,
  source: string,
  readOnly: (card: HTMLElement) => boolean,
): void {
  const empty = root.createDiv({ cls: 'thoughtknot-empty' });
  empty.createEl('p', { text: word('editor.empty-graph', { graph: target.graph }) });
  const edit = empty.createEl('button', {
    text: word('editor.edit'),
    attr: { 'aria-label': word('editor.edit'), type: 'button' },
  });
  edit.addEventListener('click', () => void plugin.openEditor(target));
  const example = empty.createEl('button', {
    text: word('first-run.example'),
    attr: { 'aria-label': word('first-run.example'), type: 'button' },
  });
  example.addEventListener('click', () => void writeExample(plugin, target, source));
  empty.createEl('a', { text: word('pane.guide'), attr: { href: GUIDE_URL, rel: 'noopener noreferrer' } });
  whenPlaced(root, () => {
    if (!readOnly(root)) return;
    edit.remove(); // reading view is read-only (spec §3)
    example.remove();
  });
}

/** The command Show the tour, offered while a drawing has been used. */
export function tourCommand(): HostCommand {
  return { id: 'tour', title: word('tour.command'), available: () => !!cardInUse(), run: () => cardInUse()?.tour() };
}

/** The command Insert an example graph: adds a block with the example at the end of the note in front, drawn at once (NEURO-8). */
export function exampleCommand(plugin: ThoughtKnotPlugin): HostCommand {
  return {
    id: 'insert-example',
    title: word('first-run.insert'),
    run: async () => {
      const target = noteToRewrite(plugin.app.workspace, word('first-run.insert-to'));
      if (!target) return;
      const outcome = await changeVaultNote(plugin.app, target.file.path, (note) => {
        const gap = note === '' || note.endsWith('\n\n') ? '' : note.endsWith('\n') ? '\n' : '\n\n';
        return `${note}${gap}${exampleBlock()}\n`;
      });
      tourNext = outcome.ok;
      new Notice(word(outcome.ok ? 'first-run.inserted' : 'first-run.insert-failed'));
    },
  };
}
