// A Word document or a PDF read off the page's thread (ES§67 format_untrusted_files; ES§9 layout_contained is the model).
// A connector's `connect` is synchronous, so it cannot wait for a worker. The host reads the document here while it
// fetches, then hands the text to `connect` as `document` (sources.ts). The core stays host-free: the host gives it a
// worker's port and its timers.
// - One worker, started on the first read, reused. Reads go one at a time, so a time limit is for one file.
// - A read that overruns the limit stops the worker. The file is refused in words, and a new worker starts next time.
// - Where no worker can run, the same read runs on the page. It cannot be stopped there, so only the size limits hold.
// - The last few texts are kept by a key the host gives (size and time of change), so a redraw does not read again.
import { documentText } from './document-text.ts';
import { word } from './words.ts';

/** What the page asks the worker: the bytes of one file and its place, whose ending says Word or PDF. */
export interface DocumentRequest {
  id: number;
  bytes: Uint8Array;
  place: string;
}

/** What the worker says to one request: the text, why the file was refused, or that the reader failed. */
export type DocumentReply =
  { id: number; text: string } | { id: number; refused: string } | { id: number; error: string };

/** The page's end of a worker, shaped as a browser's Worker is. */
export interface DocumentPort {
  postMessage(request: DocumentRequest): void;
  terminate(): void;
  onmessage: ((event: { data: DocumentReply }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

/** The worker's own end, shaped as a Web Worker's `self` is. */
export interface DocumentScope {
  postMessage(reply: DocumentReply): void;
  onmessage: ((event: { data: DocumentRequest }) => void) | null;
}

/** What a read gives: the text, or the sentence saying why the file was not read. */
export type DocumentRead = { text: string } | { refused: string };

/** The longest a worker may take over one file, in milliseconds. */
export const DOCUMENT_READ_MS = 10_000;

/** How many texts are kept for a redraw. */
const KEPT = 8;

/** The worker's side: answers each request with the text of its file, or why it was refused. */
export function serveDocuments(scope: DocumentScope): void {
  scope.onmessage = ({ data }) => {
    try {
      scope.postMessage({ id: data.id, ...documentText(data.bytes, data.place) });
    } catch (e) {
      scope.postMessage({ id: data.id, error: e instanceof Error ? e.message : String(e) });
    }
  };
}

/** What the host gives the reader. `worker` is left out where no worker can run. */
export interface DocumentReaderOptions {
  worker?: () => DocumentPort;
  clock: { setTimeout(run: () => void, ms: number): unknown; clearTimeout(timer: unknown): void };
  /** The time limit for one file, read for each file so a setting can change it. */
  ms?: () => number;
}

/** Reads documents in a worker under a time limit. */
export class DocumentReader {
  private port: DocumentPort | null = null;
  private next = 1;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly kept = new Map<string, DocumentRead>();
  private closed = false;
  private readonly options: DocumentReaderOptions;

  constructor(options: DocumentReaderOptions) {
    this.options = options;
  }

  /**
   * The text of the document in `bytes`, by the ending of `place`, or why it was refused. `key` names this version of
   * the file (its size and time of change); with it, a file read once is not read again.
   */
  read(bytes: Uint8Array, place: string, key?: string): Promise<DocumentRead> {
    const had = key ? this.kept.get(`${place}\0${key}`) : undefined;
    if (had) return Promise.resolve(had);
    const run = this.tail.then(() => this.one(bytes, place));
    this.tail = run.catch(() => undefined);
    return run.then((got) => {
      // a failure is not kept: the next try may meet a worker that works
      if (key && !('failed' in got)) this.keep(`${place}\0${key}`, got.read);
      return got.read;
    });
  }

  /** Stops the worker. A read still waiting is refused, and none starts after. */
  close(): void {
    this.closed = true;
    this.stop();
  }

  private keep(key: string, read: DocumentRead): void {
    this.kept.delete(key);
    this.kept.set(key, read);
    if (this.kept.size > KEPT) this.kept.delete(this.kept.keys().next().value as string);
  }

  private stop(): void {
    this.port?.terminate();
    this.port = null;
  }

  private async one(bytes: Uint8Array, place: string): Promise<{ read: DocumentRead; failed?: true }> {
    const { worker, clock } = this.options;
    if (this.closed)
      return { read: { refused: word('reading.document.worker-failed', { place, why: 'closed' }) }, failed: true };
    if (!worker) return { read: this.onThePage(bytes, place) };
    const ms = this.options.ms?.() ?? DOCUMENT_READ_MS;
    const id = this.next++;
    return new Promise((resolve) => {
      let port: DocumentPort;
      try {
        port = this.port ??= worker();
      } catch (e) {
        resolve({ read: this.stopped(place, e), failed: true });
        return;
      }
      const done = (out: { read: DocumentRead; failed?: true }) => {
        clock.clearTimeout(timer);
        port.onmessage = port.onerror = null;
        resolve(out);
      };
      const timer = clock.setTimeout(() => {
        this.stop();
        done({
          read: { refused: word('reading.document.too-slow', { place, seconds: String(Math.round(ms / 1000)) }) },
          failed: true,
        });
      }, ms);
      port.onmessage = ({ data }) => {
        if (data.id !== id) return;
        if ('error' in data) done({ read: this.stopped(place, data.error), failed: true });
        else done({ read: 'text' in data ? { text: data.text } : { refused: data.refused } });
      };
      port.onerror = (e) => {
        this.stop();
        done({ read: this.stopped(place, e), failed: true });
      };
      port.postMessage({ id, bytes, place });
    });
  }

  private onThePage(bytes: Uint8Array, place: string): DocumentRead {
    try {
      return documentText(bytes, place);
    } catch (e) {
      return this.stopped(place, e);
    }
  }

  private stopped(place: string, why: unknown): DocumentRead {
    const text = why instanceof Error ? why.message : typeof why === 'string' ? why : 'unknown';
    return { refused: word('reading.document.worker-failed', { place, why: text }) };
  }
}
