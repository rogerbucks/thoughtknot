// Exporting the boards of a note as whiteboard files (editor spec ES§45, board_exchange). Each board of the note in
// front is written beside the note, as a JSON Canvas file or an Excalidraw drawing. The core's own writers make it.
// - The note is never written, so this works in reading view too.
// - A file is never replaced: a name already taken gets a number after it.
// - What the format cannot hold is left out, and the notice says so in a sentence.
// - As pictures: an SVG or a PNG for each board, in the colours of the theme in use.
// - As a PDF: one file with a page for each board, in light colours as paper is. The core's own writer makes it.
// - Slides as a PDF (board_slides): one file with a page for each slide, in the order the show plays them.
import { MarkdownView, Notice } from 'obsidian';
import {
  BOARD_PICTURE_FORMATS,
  THEME_COLOURS,
  boardFilesOf,
  boardPicturesOf,
  pictureSize,
  picturesPdf,
  slidePicturesOf,
  word,
} from '@thoughtknot/core';
import type { BoardFormat, BoardPicture, BoardPictureFormat, PdfPage, PluginCommand } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { noteText } from '../storage/plugin-notes';
import { PNG_PIXEL_LIMIT, rasterise } from './png';
import { freePath, vaultOps } from './vault-write';

/** Writes each board of the note in front as a file of `format` beside the note; or says why nothing was written. */
async function exportBoards(plugin: ThoughtKnotPlugin, format: BoardFormat): Promise<void> {
  const { workspace } = plugin.app;
  const note = workspace.getActiveViewOfType(MarkdownView)?.file;
  if (!note) return void new Notice(word('host.boards.no-note'));
  const files = boardFilesOf((await noteText(plugin.app, note.path)) ?? '', format);
  if (!files.length) return void new Notice(word('host.boards.none'));
  const folder = note.path.split('/').slice(0, -1).join('/');
  for (const file of files) {
    const path = freePath(plugin, `${folder ? `${folder}/` : ''}${note.basename} ${file.name}`);
    await vaultOps(plugin).write(path, file.text);
    new Notice([word('host.boards.done', { file: path }), ...file.notes].join(' '));
  }
}

/** A picture as a page of a PDF: drawn on the light page, since a JPEG holds no clear pixels. */
async function pdfPage(p: BoardPicture): Promise<PdfPage> {
  const pixels = pictureSize(p.width, p.height, PNG_PIXEL_LIMIT);
  const jpeg = await rasterise(p.svg, pixels, THEME_COLOURS.light.page);
  return { jpeg, pixels, width: p.width, height: p.height };
}

/**
 * Writes the boards of the note in front as pictures of `format` beside the note; or says why nothing was written.
 * With `slides`, the pictures are the slides of its boards, as one PDF.
 */
async function exportPictures(plugin: ThoughtKnotPlugin, format: BoardPictureFormat, slides = false): Promise<void> {
  const { workspace } = plugin.app;
  const note = workspace.getActiveViewOfType(MarkdownView)?.file;
  if (!note) return void new Notice(word('host.boards.no-note'));
  const dark = format !== 'pdf' && activeDocument.body.classList.contains('theme-dark');
  const text = (await noteText(plugin.app, note.path)) ?? '';
  const pictures = slides ? slidePicturesOf(text, 'light') : boardPicturesOf(text, dark ? 'dark' : 'light');
  if (!pictures.length) return void new Notice(word(slides ? 'host.slides.none' : 'host.boards.none'));
  const folder = note.path.split('/').slice(0, -1).join('/');
  const pathOf = (name: string) => freePath(plugin, `${folder ? `${folder}/` : ''}${note.basename}${name}.${format}`);
  const wrote = (path: string) => new Notice(word('host.boards.done', { file: path }));
  try {
    const pages: PdfPage[] = [];
    for (const p of pictures) {
      const path = pathOf(` ${p.name}`);
      if (format === 'svg') await vaultOps(plugin).write(path, p.svg);
      else if (format === 'png')
        await vaultOps(plugin).write(path, await rasterise(p.svg, pictureSize(p.width, p.height, PNG_PIXEL_LIMIT)));
      else pages.push(await pdfPage(p));
      if (format !== 'pdf') wrote(path);
    }
    if (format !== 'pdf') return;
    const path = pathOf(slides ? ' slides' : ' boards');
    await vaultOps(plugin).write(path, picturesPdf(pages, note.basename));
    wrote(path);
  } catch (e) {
    new Notice(word('host.boards.failed', { why: e instanceof Error ? e.message : String(e) }));
  }
}

/** The commands that export the boards of the note in front: one for each whiteboard and picture format, and its slides. */
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
    {
      id: 'export-slides-pdf',
      title: word('host.command.slides-pdf'),
      run: () => void exportPictures(plugin, 'pdf', true),
    },
  ];
}
