// Makes real .docx files for the Word reader tests: a zip of the XML parts Word writes. Not a test itself.
import { zip } from './xlsx-fixture.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/** A run of text; `{ del }` is deleted text kept by a tracked change, `{ tab }` and `{ br }` are a tab and a break. */
const run = (r) => {
  if (typeof r === 'string') return `<w:r><w:t xml:space="preserve">${esc(r)}</w:t></w:r>`;
  if ('del' in r) return `<w:del><w:r><w:delText>${esc(r.del)}</w:delText></w:r></w:del>`;
  if ('tab' in r) return '<w:r><w:tab/></w:r>';
  return '<w:r><w:br/></w:r>';
};

/** A paragraph: `{ style, list, runs }`; a bare string is a plain paragraph. */
const para = (p) => {
  const o = typeof p === 'string' ? { runs: [p] } : p;
  const pr = `${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.list ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}`;
  return `<w:p>${pr ? `<w:pPr>${pr}</w:pPr>` : ''}${o.runs.map(run).join('')}</w:p>`;
};

/** A table: `{ table: [[cell text, ...], ...] }`. */
const table = (t) =>
  `<w:tbl>${t.table.map((r) => `<w:tr>${r.map((c) => `<w:tc>${para(c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;

/** A document of `blocks`: paragraphs, or `{ table }`. `extra` adds zip parts; `stored` and `lie` as in zip(). */
export function document(blocks, { extra = {}, ...options } = {}) {
  const body = blocks.map((b) => (typeof b === 'object' && b.table ? table(b) : para(b))).join('');
  return zip(
    {
      '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      'word/document.xml': `<?xml version="1.0"?><w:document ${NS}><w:body>${body}</w:body></w:document>`,
      ...extra,
    },
    options,
  );
}
