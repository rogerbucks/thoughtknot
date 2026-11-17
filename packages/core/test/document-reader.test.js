// A Word document or a PDF read off the page's thread (ES§67 format_untrusted_files). The reader hands bytes to a
// worker through a port, under a time limit. Here the port is an in-thread one, or a fake that never answers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../src/connectors.ts';
import { DocumentReader, serveDocuments } from '../src/document-reader.ts';
import { sourceOf } from '../src/sources.ts';
import { document } from './docx-fixture.js';
import { pdf } from './pdf-fixture.js';

const CLOCK = { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) };

/** A port that serves in this thread, counting the ports made. */
function served() {
  const made = [];
  const worker = () => {
    let open = true;
    const scope = { onmessage: null, postMessage: (r) => queueMicrotask(() => open && port.onmessage?.({ data: r })) };
    const port = {
      onmessage: null,
      onerror: null,
      postMessage: (r) => queueMicrotask(() => open && scope.onmessage?.({ data: r })),
      terminate: () => (open = false),
    };
    serveDocuments(scope);
    made.push(port);
    return port;
  };
  return { worker, made };
}

/** A port whose worker never answers: a read stuck inside a parse. */
const stuck = () => {
  const made = [];
  const worker = () => {
    const port = { onmessage: null, onerror: null, postMessage() {}, terminate: () => (port.ended = true) };
    made.push(port);
    return port;
  };
  return { worker, made };
};

describe('format_untrusted_files: a document is read in a worker', () => {
  test('the worker gives the text of a Word file and of a PDF, and says why a wrong file is refused', async () => {
    const { worker, made } = served();
    const reader = new DocumentReader({ worker, clock: CLOCK });
    assert.deepEqual(await reader.read(document(['Grow steadily.']), 'a.docx'), { text: 'Grow steadily.' });
    assert.deepEqual(await reader.read(pdf([['Alpha']]), 'b.pdf'), { text: '[page 1]\nAlpha' });
    assert.match((await reader.read(pdf([['x']]), 'c.docx')).refused, /not a Word document/);
    assert.equal(made.length, 1, 'one worker is reused');
  });

  test('a read that overruns the limit stops the worker, refuses the file in words, and the next read starts afresh', async () => {
    const { worker, made } = stuck();
    const reader = new DocumentReader({ worker, clock: CLOCK, ms: () => 20 });
    const got = await reader.read(new Uint8Array(4), 'slow.pdf');
    assert.match(got.refused, /slow\.pdf took more than 0 seconds/);
    assert.equal(made[0].ended, true, 'the stuck worker is stopped');
    await reader.read(new Uint8Array(4), 'slow.pdf');
    assert.equal(made.length, 2, 'a new worker is started');
  });

  test('where no worker can run the file is read on the page; the same text comes back', async () => {
    const reader = new DocumentReader({ clock: CLOCK });
    assert.deepEqual(await reader.read(document(['Hi.']), 'a.docx'), { text: 'Hi.' });
  });

  test('a worker that fails to start or breaks is told as a refusal, and is not kept', async () => {
    const reader = new DocumentReader({
      worker: () => {
        throw new Error('no blob');
      },
      clock: CLOCK,
    });
    assert.match((await reader.read(new Uint8Array(4), 'a.pdf', 'k')).refused, /reader stopped \(no blob\)/);
  });

  test('a text read once is kept by its key, so a redraw does not read it again', async () => {
    const { worker, made } = served();
    const reader = new DocumentReader({ worker, clock: CLOCK });
    const bytes = document(['Once.']);
    await reader.read(bytes, 'a.docx', '10:1');
    reader.close();
    assert.deepEqual(await reader.read(bytes, 'a.docx', '10:1'), { text: 'Once.' });
    assert.equal(made.length, 1);
  });

  test('a read after close is refused', async () => {
    const reader = new DocumentReader({ worker: served().worker, clock: CLOCK });
    reader.close();
    assert.match((await reader.read(document(['x']), 'a.docx')).refused, /closed/);
  });

  test('connect takes the text a host has read already, and gives it as prose', () => {
    const source = sourceOf('// graph: plan · FROM Data/plan.pdf');
    const got = connect(source, { found: 'Data/plan.pdf', document: '[page 1]\nAlpha' });
    assert.equal(got.prose, '[page 1]\nAlpha');
    assert.deepEqual(got.statements, []);
  });
});
