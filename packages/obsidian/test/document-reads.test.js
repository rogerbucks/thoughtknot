// The document worker's bundle runs as a real worker (ES§67 format_untrusted_files), from its own function's text.
// It is started as main.js starts it. It reads a Word file and a PDF, says why a wrong file is refused, and a stuck read can be
// stopped. A worker thread stands in for the browser's Worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import esbuild from 'esbuild';
import { DocumentReader } from '../../core/src/document-reader.ts';
import { documentWorker } from '../esbuild.config.mjs';
import { document } from '../../core/test/docx-fixture.js';
import { pdf } from '../../core/test/pdf-fixture.js';
import { deck, sp } from '../../core/test/pptx-fixture.js';

/** The bundle as main.js holds it: the text of the function `documentWorker`. */
async function bundleText() {
  const built = await esbuild.build({
    stdin: {
      contents: `import { documentWorker } from 'thoughtknot:document-worker'; export default documentWorker.toString();`,
      resolveDir: import.meta.dirname,
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    plugins: [documentWorker],
    logLevel: 'silent',
  });
  const url = `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`;
  return (await import(url)).default;
}

/** A port to a worker thread whose script is the function's text, run on a scope made of the thread's parent port. */
const threadPort = (fn) => {
  const code = `const { parentPort } = require('node:worker_threads');
    const scope = { onmessage: null, postMessage: (r) => parentPort.postMessage(r) };
    parentPort.on('message', (data) => scope.onmessage?.({ data }));
    (${fn})(scope);`;
  const w = new Worker(code, { eval: true });
  const port = {
    onmessage: null,
    onerror: null,
    postMessage: (r) => w.postMessage(r),
    terminate: () => void w.terminate(),
  };
  w.on('message', (data) => port.onmessage?.({ data }));
  w.on('error', (e) => port.onerror?.(e));
  return port;
};
const CLOCK = { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) };

test('the bundled worker reads a Word file and a PDF, and refuses a wrong file in words', async () => {
  const fn = await bundleText();
  const reader = new DocumentReader({ worker: () => threadPort(fn), clock: CLOCK });
  try {
    assert.deepEqual(await reader.read(document(['Grow steadily.']), 'a.docx'), { text: 'Grow steadily.' });
    assert.deepEqual(await reader.read(pdf([['Alpha']]), 'b.pdf'), { text: '[page 1]\nAlpha' });
    assert.match((await reader.read(pdf([['x']]), 'c.docx')).refused, /not a Word document/);
    const slides = await reader.readDeck(
      deck([{ shapes: [sp({ ph: { type: 'title' }, paras: ['Plan'] })] }]),
      'd.pptx',
    );
    assert.deepEqual(
      slides.deck.slides.map((s) => s.title),
      ['Plan'],
    );
  } finally {
    reader.close();
  }
});

test('a worker that never answers is stopped at the time limit and the file is refused', async () => {
  const reader = new DocumentReader({ worker: () => threadPort('function () {}'), clock: CLOCK, ms: () => 100 });
  try {
    assert.match((await reader.read(document(['x']), 'slow.docx')).refused, /slow\.docx took more than/);
  } finally {
    reader.close();
  }
});
