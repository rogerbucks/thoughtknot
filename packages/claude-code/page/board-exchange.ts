// Whiteboard files in and out on the browser editor's page (editor spec ES§45, board_exchange). It is the page VS
// Code's tab, the desktop app and the phone app run. A small bar under the boards, closed until it is opened.
// - In: a JSON Canvas file or an Excalidraw drawing is read here and copied into the note as a board. Nothing leaves
//   the page, and the file is never written.
// - Out: the boards of the note are handed over as files to keep: JSON Canvas, Excalidraw, SVG, PNG, or one PDF.
// The readers and writers are the core's own. What a format cannot hold is said in a sentence.
import {
  THEME_COLOURS,
  boardFileBlock,
  boardFilesOf,
  boardPicturesOf,
  pictureSize,
  picturesPdf,
  pngSize,
  withImport,
  word,
} from '@thoughtknot/core';
import type { PdfPage } from '@thoughtknot/core';
import { notice } from '@thoughtknot/core/display/host';
import type { BoardNote } from './board-section.ts';
import { PNG_PIXEL_LIMIT, rasterise } from './png.ts';

type Win = Window & typeof globalThis;

/** The formats the boards are handed over as; the name the person reads is the word `host.boards.as.` and this. */
const FORMATS = ['canvas', 'excalidraw', 'svg', 'png', 'pdf'] as const;

/** A graph name made from a file's name, and not one the note already holds: a taken name gets a number after it. */
export function boardNameFor(file: string, note: string): string {
  const stem = file
    .replace(/\.(canvas|excalidraw(\.md)?)$/i, '')
    .replace(/\W+/g, '_')
    .replace(/^(\d)/, '_$1');
  const taken = new Set(Array.from(note.matchAll(/^\/\/ graph: (\w+)/gm), (m) => m[1]));
  let name = stem || 'board';
  for (let n = 2; taken.has(name); n++) name = `${stem || 'board'}_${n}`;
  return name;
}

/** Hands `data` to the person as the file `name`, to keep. */
function download(win: Win, name: string, data: string | Uint8Array, type: string): void {
  const url = win.URL.createObjectURL(new win.Blob([typeof data === 'string' ? data : data.slice()], { type }));
  const link = win.document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
}

/** Copies the whiteboard file into the note as a board; what it says is the refusal, or nothing once it is written. */
async function bringIn(note: BoardNote, file: string, text: string): Promise<string> {
  const graph = boardNameFor(file, note.text);
  const made = boardFileBlock(graph, file, text);
  if ('refused' in made) return made.refused;
  const wrote = await note.writeWhole(withImport(note.text, made.block));
  if (!wrote.ok) return wrote.why;
  // the page draws the boards again after a write, so what was done is said in a notice, which stays
  notice([word('page.board-exchange.imported', { graph, file }), ...made.notes].join(' '));
  return '';
}

/** Hands the boards of the note over as files of `format`; what it says is how many, with what was left out. */
async function handOver(win: Win, note: string, format: string): Promise<string> {
  const dark = format !== 'pdf' && win.matchMedia('(prefers-color-scheme: dark)').matches;
  const said: string[] = [];
  let count = 0;
  if (format === 'canvas' || format === 'excalidraw') {
    for (const f of boardFilesOf(note, format)) {
      download(win, f.name, f.text, 'application/json');
      said.push(...f.notes);
      count++;
    }
  } else {
    const pages: PdfPage[] = [];
    for (const p of boardPicturesOf(note, dark ? 'dark' : 'light')) {
      const pixels = pictureSize(p.width, p.height, PNG_PIXEL_LIMIT);
      const size = { ...pngSize(p.width, p.height), ...pixels };
      if (format === 'svg') download(win, `${p.name}.svg`, p.svg, 'image/svg+xml');
      else if (format === 'png') download(win, `${p.name}.png`, await rasterise(win, p.svg, size), 'image/png');
      else
        pages.push({
          jpeg: await rasterise(win, p.svg, size, THEME_COLOURS.light.page),
          pixels,
          width: p.width,
          height: p.height,
        });
      count++;
    }
    if (pages.length) download(win, 'boards.pdf', picturesPdf(pages, word('page.boards')), 'application/pdf');
  }
  return count ? [word('page.board-exchange.done', { count }), ...new Set(said)].join(' ') : word('host.boards.none');
}

/** The bar: closed until opened, it takes a whiteboard file in, and hands the note's boards over as files. */
export function exchangeBar(win: Win, note: BoardNote): HTMLElement {
  const doc = win.document;
  const bar = doc.createElement('details');
  bar.setAttribute('class', 'gn-board-exchange');
  bar.appendChild(doc.createElement('summary')).textContent = word('page.board-exchange');
  const status = doc.createElement('p');
  status.setAttribute('role', 'status');
  const say = (text: string) => (status.textContent = text);
  const failed = (e: unknown) => say(word('host.boards.failed', { why: e instanceof Error ? e.message : String(e) }));

  const taking = bar.appendChild(doc.createElement('label'));
  taking.textContent = word('page.board-exchange.import');
  const input = doc.createElement('input');
  input.type = 'file';
  input.accept = '.canvas,.excalidraw,.md';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file)
      void file
        .text()
        .then((text) => bringIn(note, file.name, text))
        .then(say, failed);
    input.value = '';
  });
  taking.append(' ', input);

  const giving = bar.appendChild(doc.createElement('label'));
  giving.textContent = word('page.board-exchange.as');
  const select = doc.createElement('select');
  for (const value of FORMATS) {
    const option = select.appendChild(doc.createElement('option'));
    option.value = value;
    option.textContent = word(`host.boards.as.${value}`);
  }
  giving.append(' ', select);
  const run = bar.appendChild(doc.createElement('button'));
  run.setAttribute('type', 'button');
  run.textContent = word('page.board-exchange.run');
  run.addEventListener('click', () => void handOver(win, note.text, select.value).then(say, failed));
  bar.append(status);
  return bar;
}
