// Word, PDF and PowerPoint files brought into the note on the browser editor's page (editor spec ES§45, board_exchange;
// ES§67, format_untrusted_files). It is the page VS Code's tab, the desktop app and the phone app run, so each gets
// the import from this one place. Obsidian has its own picker over the vault (databases/import.ts), on the same readers.
// - The file is read in a worker under a time limit, by the core's own readers. No library and no WebAssembly.
// - A deck becomes one board with a frame to each slide. Its pictures are kept beside the note where the host keeps
//   pictures. Where it cannot, they are left out and a sentence says so.
// - A Word file or a PDF becomes its text, in a fenced block under a heading. A fence is used so nothing in the file
//   can pass for a graph block of the note. The text is never read as fact.
// - The file picked is never written.
import {
  DocumentReader,
  deckBlock,
  deckBoard,
  isDocumentPlace,
  isPresentationPlace,
  withImport,
  word,
} from '@thoughtknot/core';
import type { DocumentPort } from '@thoughtknot/core';
import { notice } from '@thoughtknot/core/display/host';
import type { Pictures } from '@thoughtknot/core/display/board/board-images';
import type { BoardNote } from './board-section.ts';

type Win = Window & typeof globalThis;

/** Where the worker's file is: the host's own, by a path from its root. */
export const DOCUMENT_WORKER_PATH = '/document-worker.js';

/** Whether a file is one this import reads, by its ending. */
export const isImportable = (name: string): boolean => isDocumentPlace(name) || isPresentationPlace(name);

/** A port to the worker file, shaped as the core's reader takes it. */
function workerPort(win: Win): DocumentPort {
  const worker = new win.Worker(DOCUMENT_WORKER_PATH);
  const port: DocumentPort = {
    onmessage: null,
    onerror: null,
    postMessage: (request) => worker.postMessage(request),
    terminate: () => worker.terminate(),
  };
  worker.onmessage = (e) => port.onmessage?.(e);
  worker.onerror = (e) => port.onerror?.(e.message || e);
  return port;
}

const readers = new WeakMap<Win, DocumentReader>();

/** The window's reader: one worker, reused. Where the window has no worker, the core reads on the page. */
export function readerOf(win: Win): DocumentReader {
  let reader = readers.get(win);
  if (!reader) {
    reader = new DocumentReader({
      ...(typeof win.Worker === 'function' ? { worker: () => workerPort(win) } : {}),
      clock: {
        setTimeout: (run, ms) => win.setTimeout(run, ms),
        clearTimeout: (t) => win.clearTimeout(t as number),
      },
    });
    readers.set(win, reader);
  }
  return reader;
}

/** A graph name made from a file's name, and not one the note already holds: a taken name gets a number after it. */
export function graphNameFor(file: string, note: string): string {
  const stem = file
    .replace(/\.[^.]*$/, '')
    .replace(/\W+/g, '_')
    .replace(/^(\d)/, '_$1');
  const taken = new Set(Array.from(note.matchAll(/^\/\/ graph: (\w+)/gm), (m) => m[1]));
  let name = stem || 'document';
  for (let n = 2; taken.has(name); n++) name = `${stem || 'document'}_${n}`;
  return name;
}

/** `text` in a fence longer than any run of backticks inside it, so nothing inside can close it. */
export function fenced(text: string): string {
  const longest = Math.max(2, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
}

/** The section a document's text makes in the note: a heading named after the file, then its text. */
export function documentSection(file: string, text: string): string {
  const title =
    file
      .replace(/\.[^.]*$/, '')
      .replace(/[#\s]+/g, ' ')
      .trim() || file;
  return `## ${title}\n\n${word('page.import-document.copied', { file })}\n\n${fenced(text)}`;
}

/**
 * Brings the file into the note: a deck as a board, a Word file or a PDF as its text. It gives the reason nothing was
 * written, or nothing once it is written. What was done is then said in a notice, which stays.
 */
export async function importDocument(win: Win, note: BoardNote, file: File, pictures?: Pictures): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = `${file.size}:${file.lastModified}`;
  const reader = readerOf(win);
  if (isPresentationPlace(file.name)) {
    const read = await reader.readDeck(bytes, file.name, key);
    if ('refused' in read) return read.refused;
    const graph = graphNameFor(file.name, note.text);
    const made = deckBoard(read.deck, graph, file.name);
    if ('refused' in made) return made.refused;
    const done = await deckBlock(made, async (picture) => {
      const kept = await pictures?.keep?.(new win.File([picture.bytes.slice()], picture.name));
      return kept && 'src' in kept ? kept.src : null;
    });
    const wrote = await note.writeWhole(withImport(note.text, done.block));
    if (!wrote.ok) return wrote.why;
    notice([word('page.import-deck.done', { graph, file: file.name }), ...done.notes].join(' '));
    return '';
  }
  const read = await reader.read(bytes, file.name, key);
  if ('refused' in read) return read.refused;
  const wrote = await note.writeWhole(withImport(note.text, documentSection(file.name, read.text)));
  if (!wrote.ok) return wrote.why;
  notice(word('page.import-document.done', { file: file.name }));
  return '';
}
