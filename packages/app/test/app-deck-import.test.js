// A PowerPoint deck brought into a note in the desktop app's window (editor spec ES§45, board_exchange; ES§67,
// format_untrusted_files). The window runs the browser editor's page over the app's own folder calls. The deck is read
// in the document worker, becomes a board with a frame to each slide, and its picture is kept beside the note by the
// app's own write and read calls, as the Rust does. The deck is never written.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workerFor } from '../../../test/repository/wcag-page.js';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { PNG, deck, pic, sp } from '../../core/test/pptx-fixture.js';
import { builtApp, cleanUpApp, emptyFolder, openAppEditor } from './app-window.js';

after(cleanUpApp);

const NOTE = [
  '# Plan',
  '```gql',
  '// graph: plan · BOARD',
  "(a:Sticky {x: 10, y: 20, text: 'Agreed'}),",
  '(v:View {x: 0, y: 400})',
  '```',
  '',
].join('\n');
const DECK = deck([
  {
    shapes: [sp({ ph: { type: 'title' }, paras: ['Q4 plan'] }), pic({ embed: 'rId5', at: [700, 200, 400, 300] })],
    media: { rId5: ['logo.png', PNG] },
  },
  { shapes: [sp({ ph: { type: 'title' }, paras: ['Risks'] })] },
]);

test('a deck imported in the app window becomes a board, and its picture is kept beside the note', async () => {
  const folder = emptyFolder();
  writeFileSync(join(folder, 'Plan.md'), NOTE);
  const page = await openAppEditor(folder, 'Plan.md');
  const stopDocuments = workerFor(page.window, join(await builtApp(), 'document-worker.js'));
  try {
    const bar = () => page.doc.querySelector('.gn-boards .gn-board-exchange');
    await until(() => bar(), 8000);
    const input = bar().querySelector('input[type=file]');
    const file = {
      name: 'Q4 plan.pptx',
      size: DECK.length,
      lastModified: 1,
      arrayBuffer: async () => new Uint8Array(DECK).buffer,
    };
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new page.window.Event('change', { bubbles: true }));
    await until(() => /graph: Q4_plan · BOARD/.test(page.file()), 8000);
    assert.match(page.file(), /:Frame \{[^}]*text: 'Q4 plan'/);
    assert.match(page.file(), /:Frame \{[^}]*text: 'Risks'/);
    assert.match(page.file(), /:Image \{[^}]*src: 'attachments\/Q4-plan-1\.png'/);
    assert.ok(existsSync(join(folder, 'attachments', 'Q4-plan-1.png')), 'the picture is a file beside the note');
    assert.deepEqual(readFileSync(join(folder, 'attachments', 'Q4-plan-1.png')), PNG);
    assert.deepEqual(readdirSync(folder).sort(), ['Plan.md', 'attachments'], 'the deck itself is never written');
  } finally {
    await stopDocuments();
    await page.stop();
  }
});
