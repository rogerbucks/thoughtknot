// Word files and PDFs read off the page's thread (ES§67 format_untrusted_files). One worker, started on the first read
// from a Blob URL of the bundle's own text, as the layout worker is (layout-worker.ts says why). A read that takes too
// long stops the worker and the file is refused in words. Where no worker can run, the core reads on the page.
import { DocumentReader } from '@thoughtknot/core';
import type { DocumentPort, DocumentRead } from '@thoughtknot/core';
import { documentWorker } from 'thoughtknot:document-worker';

/** Whether this host can start a worker from a Blob: every Obsidian can, desktop and phone; a test may not. */
const workersRun = () =>
  typeof Worker === 'function' && typeof Blob === 'function' && typeof URL.createObjectURL === 'function';

/** The plugin's document reads: kept while the plugin runs, closed on unload. */
export class DocumentReads {
  private readonly reader: DocumentReader;
  private url: string | null = null;

  constructor() {
    // the plugin's own window, kept, as the layouts do
    const w = window;
    this.reader = new DocumentReader({
      ...(workersRun() ? { worker: () => this.worker() } : {}),
      clock: {
        setTimeout: (run, ms) => w.setTimeout(run, ms),
        clearTimeout: (t) => w.clearTimeout(t as number),
      },
    });
  }

  /** The text of the document in `bytes`, or why it was refused. `key` is the file's size and time of change. */
  read(bytes: Uint8Array, place: string, key?: string): Promise<DocumentRead> {
    return this.reader.read(bytes, place, key);
  }

  /** Stops the worker and lets its source go. */
  close(): void {
    this.reader.close();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  /** A worker started from main.js's own copy of the bundle. */
  private worker(): DocumentPort {
    this.url ??= URL.createObjectURL(new Blob([`(${documentWorker.toString()})(self);`], { type: 'text/javascript' }));
    const w = new Worker(this.url);
    const port: DocumentPort = {
      onmessage: null,
      onerror: null,
      postMessage: (request) => w.postMessage(request),
      terminate: () => w.terminate(),
    };
    w.onmessage = (e) => port.onmessage?.(e);
    w.onerror = (e) => port.onerror?.(e.message || e);
    return port;
  }
}
