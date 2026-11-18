// Word, PDF and PowerPoint files brought into the note on the browser editor's page (editor spec ES§45, board_exchange;
// ES§67, format_untrusted_files). VS Code's tab, the desktop app and the phone app run this page, so each gets the
// import from it. The page runs as built, in a DOM, against the real server.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { document as docx } from '../../core/test/docx-fixture.js';
import { PNG, deck, pic, sp } from '../../core/test/pptx-fixture.js';
import { workerFor } from '../../../test/repository/wcag-page.js';
import { built, cleanUp } from './editor-page-support.js';
import { livePage } from './editor-page-live.js';
import { documentSection, fenced, graphNameFor, isImportable } from '../page/document-import.ts';

after(cleanUp);

const NOTE = [
  '# Plan',
  '```gql',
  '// graph: plan · BOARD',
  "(a:Sticky {x: 10, y: 20, text: 'What we agreed'}),",
  '(v:View {x: 0, y: 400})',
  '```',
  '',
].join('\n');
const bar = (page) => page.doc.querySelector('.gn-boards .gn-board-exchange');
const status = (page) => bar(page).querySelector('[role=status]').textContent;
function bring(page, name, bytes) {
  const input = bar(page).querySelector('input[type=file]');
  const file = {
    name,
    size: bytes.length,
    lastModified: 1,
    arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer),
  };
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new page.window.Event('change', { bubbles: true }));
}

/** The page, with the built document worker run as a thread for it, as a browser runs it from the host's own file. */
async function pageWith(note) {
  const { dir } = await built();
  let stopDocuments;
  const page = await livePage(note, {
    before: (win) => (stopDocuments = workerFor(win, join(dir, 'document-worker.js'))),
  });
  const stop = page.stop;
  page.stop = async () => {
    await stopDocuments?.();
    await stop();
  };
  return page;
}

describe('document files on the browser editor’s page', () => {
  // proves: board_exchange
  test('the page is built with a document worker of its own, beside the layout worker', async () => {
    const { dir, documents } = await built();
    assert.ok(existsSync(join(dir, 'document-worker.js')));
    assert.ok(existsSync(join(dir, 'layout-worker.js')));
    assert.ok(Object.keys(documents.outputs).length > 0);
  });

  // proves: board_exchange
  test('the words that name a file and fence its text keep a file from passing for a graph block', () => {
    assert.ok(isImportable('A.DOCX') && isImportable('b.pdf') && isImportable('c.pptx'));
    assert.ok(!isImportable('d.canvas') && !isImportable('e.xlsx'));
    assert.equal(graphNameFor('Q4 plan.pptx', ''), 'Q4_plan');
    assert.equal(graphNameFor('Q4 plan.pptx', '// graph: Q4_plan · BOARD'), 'Q4_plan_2');
    assert.equal(graphNameFor('2024.pdf', ''), '_2024');
    const evil = 'x\n```gql\n// graph: g\n```\n````\ny';
    const block = fenced(evil);
    assert.ok(block.startsWith('`````text\n') && block.endsWith('\n`````'), 'longer than any run inside');
    assert.match(
      documentSection('Notes #1.docx', 'hello'),
      /^## Notes 1\n\nText copied from Notes #1\.docx\.\n\n```text\nhello\n```$/,
    );
  });

  // proves: board_exchange
  test('a Word file brought in is copied into the note as its text, in a fence, and the file is not written', async () => {
    const page = await pageWith(NOTE);
    try {
      await until(() => bar(page), 8000);
      bring(page, 'Minutes.docx', docx([{ style: 'Heading1', runs: ['Minutes'] }, 'We agreed to ship.']));
      await until(() => /We agreed to ship\./.test(page.file()), 8000);
      assert.ok(page.file().startsWith(NOTE.trimEnd()), 'the rest of the note is kept');
      assert.match(
        page.file(),
        /## Minutes\n\nText copied from Minutes\.docx\.\n\n```text\n# Minutes\n\nWe agreed to ship\.\n```/,
      );
    } finally {
      await page.stop();
    }
  });

  // proves: board_exchange
  test('a PowerPoint deck becomes one board with a frame to each slide, its picture kept beside the note', async () => {
    const page = await pageWith(NOTE);
    try {
      await until(() => bar(page), 8000);
      const bytes = deck([
        {
          shapes: [sp({ ph: { type: 'title' }, paras: ['Q4 plan'] }), pic({ embed: 'rId5', at: [700, 200, 400, 300] })],
          media: { rId5: ['logo.png', PNG] },
        },
        { shapes: [sp({ ph: { type: 'title' }, paras: ['Risks'] })] },
      ]);
      bring(page, 'Q4 plan.pptx', bytes);
      await until(() => /graph: Q4_plan · BOARD/.test(page.file()), 8000);
      assert.match(page.file(), /:Frame \{[^}]*text: 'Q4 plan'/);
      assert.match(page.file(), /:Frame \{[^}]*text: 'Risks'/);
      assert.match(page.file(), /:Image \{[^}]*src: 'attachments\//);
    } finally {
      await page.stop();
    }
  });

  // proves: board_exchange
  test('a file that cannot be read is refused in a sentence, and nothing is written', async () => {
    const page = await pageWith(NOTE);
    try {
      await until(() => bar(page), 8000);
      bring(page, 'Broken.docx', Buffer.from('not a zip'));
      await until(() => status(page), 8000);
      assert.ok(status(page).length > 0);
      assert.equal(page.file(), NOTE);
    } finally {
      await page.stop();
    }
  });
});
