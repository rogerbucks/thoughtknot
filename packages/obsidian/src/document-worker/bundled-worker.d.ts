// The document worker's bundle, as main.js holds it (ES§67 format_untrusted_files). It is made at build time by
// esbuild.config.mjs from worker-entry.ts, never written as a file.
declare module 'thoughtknot:document-worker' {
  import type { DocumentScope } from '@thoughtknot/core';

  /** Runs the document worker's bundle on a scope (`self`, in a worker). Its text, from toString(), is the whole worker. */
  export function documentWorker(scope: DocumentScope): void;
}
