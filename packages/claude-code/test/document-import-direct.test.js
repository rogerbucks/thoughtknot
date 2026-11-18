// The page's document import, called directly with a stand-in window, note and host (editor spec ES§45, board_exchange;
// ES§67, format_untrusted_files). The page as built is proved in document-import.test.js; here each way a file is taken
// is run on its own: no worker, a worker, a deck with its pictures kept, a deck whose pictures cannot be kept, a refusal.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installHost } from '@thoughtknot/core/display/host';
import { document as docx } from '../../core/test/docx-fixture.js';
import { PNG, deck, pic, sp } from '../../core/test/pptx-fixture.js';
import { DOCUMENT_WORKER_PATH, importDocument, readerOf } from '../page/document-import.ts';

const said = [];
installHost({ icon() {}, isPhone: () => false, notice: (t) => said.push(t), menu() {} });

/** A window with timers, and a Worker only when `Worker` is given. */
const windowOf = (Worker) => ({
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (t) => clearTimeout(t),
  File: class {
    constructor(parts, name) {
      this.name = name;
      this.parts = parts;
    }
  },
  ...(Worker ? { Worker } : {}),
});
const noteOf = (text, ok = true) => {
  const note = {
    text,
    writes: [],
    writeWhole: async (next) => {
      note.writes.push(next);
      return ok ? { ok: true } : { ok: false, why: 'The note changed.' };
    },
  };
  return note;
};
const fileOf = (name, bytes) => ({
  name,
  size: bytes.length,
  lastModified: 1,
  arrayBuffer: async () => new Uint8Array(bytes).buffer,
});
const DECK = deck([
  {
    shapes: [sp({ ph: { type: 'title' }, paras: ['Q4'] }), pic({ embed: 'rId5', at: [700, 200, 400, 300] })],
    media: { rId5: ['l.png', PNG] },
  },
]);

describe('importDocument', () => {
  test('a Word file is read on the page where there is no worker, and written as fenced text', async () => {
    const win = windowOf();
    const note = noteOf('# N\n');
    assert.equal(await importDocument(win, note, fileOf('A.docx', docx(['Hello']))), '');
    assert.match(note.writes[0], /^# N\n\n## A\n\nText copied from A\.docx\.\n\n```text\nHello\n```\n$/);
    assert.match(said.at(-1), /Added the text of A\.docx/);
    assert.equal(readerOf(win), readerOf(win), 'one reader for a window');
  });

  test('a note that refuses the write says why, and a file that cannot be read says why', async () => {
    const win = windowOf();
    assert.equal(await importDocument(win, noteOf('x', false), fileOf('A.docx', docx(['Hi']))), 'The note changed.');
    assert.equal(await importDocument(win, noteOf('x', false), fileOf('P.pptx', DECK)), 'The note changed.');
    assert.ok((await importDocument(win, noteOf('x'), fileOf('B.docx', Buffer.from('no')))).length > 0);
    assert.ok((await importDocument(win, noteOf('x'), fileOf('B.pptx', Buffer.from('no')))).length > 0);
  });

  test('a deck keeps its pictures where the host can, and leaves them out and says so where it cannot', async () => {
    const kept = [];
    const pictures = {
      url: async () => null,
      keep: async (f) => (kept.push(f.name), { src: `attachments/${f.name}` }),
    };
    const note = noteOf('# N\n');
    assert.equal(await importDocument(windowOf(), note, fileOf('Q4.pptx', DECK), pictures), '');
    assert.equal(kept.length, 1);
    assert.match(note.writes[0], /src: 'attachments\/Q4-1\.png'/);
    const none = noteOf('# N\n');
    await importDocument(windowOf(), none, fileOf('Q4.pptx', DECK));
    assert.doesNotMatch(none.writes[0], /:Image/);
    assert.match(said.at(-1), /Added the board Q4/);
    const refused = { url: async () => null, keep: async () => ({ refused: 'no' }) };
    const third = noteOf('# N\n');
    await importDocument(windowOf(), third, fileOf('Q4.pptx', DECK), refused);
    assert.doesNotMatch(third.writes[0], /:Image/);
  });

  test('where the window has a Worker, the read goes to the worker file by its path and is answered', async () => {
    const seen = [];
    class Worker {
      constructor(url) {
        seen.push(url);
      }
      postMessage({ id }) {
        queueMicrotask(() => this.onmessage({ data: { id, text: 'from the worker' } }));
      }
      terminate() {
        seen.push('stopped');
      }
    }
    const win = windowOf(Worker);
    const note = noteOf('# N\n');
    assert.equal(await importDocument(win, note, fileOf('W.pdf', Buffer.from('x'))), '');
    assert.deepEqual(seen, [DOCUMENT_WORKER_PATH]);
    assert.match(note.writes[0], /from the worker/);
    readerOf(win).close();
    assert.equal(seen.at(-1), 'stopped');
  });
});
