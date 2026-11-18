// The worker side of document reading, by its own path (spec ES§67 format_untrusted_files). A host's worker bundle
// takes this module, not the core's entry, so it carries only the readers and not the whole library.
export { serveDocuments } from '../document-reader.ts';
