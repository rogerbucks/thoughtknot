// What runs inside the page's document worker (ES§67 format_untrusted_files). It is the core's reader of Word files,
// PDFs and PowerPoint decks, built on its own into `document-worker.js`. The server, the desktop app, the phone app
// and VS Code's tab all serve it from their own files. It takes the core's one module by its own path, so it carries
// the readers and not the whole library.
import { serveDocuments } from '@thoughtknot/core/hosts/document-serve';
import type { DocumentScope } from '@thoughtknot/core';

serveDocuments(self as unknown as DocumentScope);
