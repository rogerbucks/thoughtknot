// Exporting the boards of a note as whiteboard files (editor spec ES§45, board_exchange). Each board of the note in
// front is written beside the note, as a JSON Canvas file or an Excalidraw drawing. The core's own writers make it.
// - The note is never written, so this works in reading view too.
// - A file is never replaced: a name already taken gets a number after it.
// - What the format cannot hold is left out, and the notice says so in a sentence.
import { MarkdownView, Notice } from 'obsidian';
import { boardFilesOf, word } from '@thoughtknot/core';
import type { BoardFormat, PluginCommand } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { freePath } from './vault-write';

/** Writes each board of the note in front as a file of `format` beside the note; or says why nothing was written. */
async function exportBoards(plugin: ThoughtKnotPlugin, format: BoardFormat): Promise<void> {
  const { vault, workspace } = plugin.app;
  const note = workspace.getActiveViewOfType(MarkdownView)?.file;
  if (!note) return void new Notice(word('host.boards.no-note'));
  const files = boardFilesOf(await vault.cachedRead(note), format);
  if (!files.length) return void new Notice(word('host.boards.none'));
  const folder = note.path.split('/').slice(0, -1).join('/');
  for (const file of files) {
    const path = freePath(plugin, `${folder ? `${folder}/` : ''}${note.basename} ${file.name}`);
    await vault.create(path, file.text);
    new Notice([word('host.boards.done', { file: path }), ...file.notes].join(' '));
  }
}

/** The commands that export the boards of the note in front: one for each whiteboard format. */
export function boardExportCommands(plugin: ThoughtKnotPlugin): PluginCommand[] {
  return [
    {
      id: 'export-boards-canvas',
      title: word('host.command.boards-canvas'),
      run: () => void exportBoards(plugin, 'canvas'),
    },
    {
      id: 'export-boards-excalidraw',
      title: word('host.command.boards-excalidraw'),
      run: () => void exportBoards(plugin, 'excalidraw'),
    },
  ];
}
