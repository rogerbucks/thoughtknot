// Exporting the boards of a note as whiteboard files (editor spec ES§45, board_exchange). Each board of the note in
// front is written beside the note, as a JSON Canvas file or an Excalidraw drawing. The core's own writers make it.
// - The note is never written, so this works in reading view too.
// - A file is never replaced: a name already taken gets a number after it.
// - What the format cannot hold is left out, and the notice says so in a sentence.
// - As pictures: an SVG or a PNG for each board, in the colours of the theme in use.
// - As a PDF: one file with a page for each board, in light colours as paper is. The core's own writer makes it.
import { MarkdownView, Notice } from 'obsidian';
import {
  BOARD_PICTURE_FORMATS,
  boardFilesOf,
  boardPicturesOf,
  pictureSize,
  picturesPdf,
  word,
} from '@thoughtknot/core';
import type { BoardFormat, BoardPictureFormat, PdfPage, PluginCommand } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { PNG_PIXEL_LIMIT, rasterise } from './png';
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

/** Writes the boards of the note in front as pictures of `format` beside the note; or says why nothing was written. */
async function exportPictures(plugin: ThoughtKnotPlugin, format: BoardPictureFormat): Promise<void> {
  const { vault, workspace } = plugin.app;
  const note = workspace.getActiveViewOfType(MarkdownView)?.file;
  if (!note) return void new Notice(word('host.boards.no-note'));
  const dark = format !== 'pdf' && activeDocument.body.classList.contains('theme-dark');
  const pictures = boardPicturesOf(await vault.cachedRead(note), dark ? 'dark' : 'light');
  if (!pictures.length) return void new Notice(word('host.boards.none'));
  const folder = note.path.split('/').slice(0, -1).join('/');
  const pathOf = (name: string) => freePath(plugin, `${folder ? `${folder}/` : ''}${note.basename}${name}.${format}`);
  const wrote = (path: string) => new Notice(word('host.boards.done', { file: path }));
  try {
    const pages: PdfPage[] = [];
    for (const p of pictures) {
      const path = pathOf(` ${p.name}`);
      const pixels = pictureSize(p.width, p.height, PNG_PIXEL_LIMIT);
      if (format === 'svg') await vault.create(path, p.svg);
      else if (format === 'png') await vault.createBinary(path, (await rasterise(p.svg, pixels)).slice().buffer);
      else pages.push({ jpeg: await rasterise(p.svg, pixels, 'image/jpeg'), pixels, width: p.width, height: p.height });
      if (format !== 'pdf') wrote(path);
    }
    if (format !== 'pdf') return;
    const path = pathOf(' boards');
    await vault.createBinary(path, picturesPdf(pages, note.basename).slice().buffer);
    wrote(path);
  } catch (e) {
    new Notice(word('host.boards.failed', { why: e instanceof Error ? e.message : String(e) }));
  }
}

/** The commands that export the boards of the note in front: one for each whiteboard format and picture format. */
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
    ...BOARD_PICTURE_FORMATS.map((format) => ({
      id: `export-boards-${format}`,
      title: word(`host.command.boards-${format}`),
      run: () => void exportPictures(plugin, format),
    })),
  ];
}
