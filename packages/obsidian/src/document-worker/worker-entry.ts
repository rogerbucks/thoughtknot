// What runs inside the document worker (ES§67 format_untrusted_files): the core's reader of Word files and PDFs. The
// build bundles this file on its own and puts it in main.js once, as the body of the function `documentWorker` (see
// document-reads.ts). A worker is started from that function's text. The page does not call it: where no worker can
// run, the page reads with the core's own reader.
import { serveDocuments } from '@thoughtknot/core/hosts/document-serve';
import type { DocumentScope } from '@thoughtknot/core';

/** The worker's own scope, handed in by the function wrapped round this bundle: `self`. */
declare const scope: DocumentScope;

serveDocuments(scope);
