// The boards of a note exported as pictures in Obsidian (editor spec ES§45, board_exchange). Three commands write
// them beside the note: an SVG or a PNG for each board, or one PDF with a page for each. No file is replaced. The
// canvas and the image are stand-ins: what is proved is what the plugin does with them.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';

before(() => build());

const PATH = 'Trips/Plan.md';
const NOTE = `# Plan

\`\`\`gql
// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'Go by train'})
\`\`\`

\`\`\`gql
// graph: later · BOARD
(t:Text {x: 0, y: 0, text: 'Book'})
\`\`\`
`;
const PNG = [137, 80, 78, 71];
const JPEG = [0xff, 0xd8, 0xff, 0xd9];

/** Loads the plugin with the note in front, and a canvas that makes `PNG` or `JPEG` bytes of whatever is drawn. */
async function withCanvas(fn) {
  const env = await load({ files: { [PATH]: NOTE } });
  const saved = globalThis.Image;
  globalThis.Image = class {
    set src(_url) {
      queueMicrotask(() => this.onload?.());
    }
  };
  const asked = [];
  const papers = [];
  const canvas = () => ({
    width: 0,
    height: 0,
    remove() {},
    getContext: () => ({
      drawImage() {},
      fillRect() {
        papers.push(this.fillStyle);
      },
    }),
    toBlob(done, type) {
      asked.push([type, this.width, this.height]);
      queueMicrotask(() => done(new Blob([new Uint8Array(type === 'image/jpeg' ? JPEG : PNG)], { type })));
    },
  });
  const createEl = env.doc.body.createEl.bind(env.doc.body);
  env.doc.body.createEl = (tag, ...rest) => (tag === 'canvas' ? canvas() : createEl(tag, ...rest));
  env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), NOTE, 'preview');
  const run = async (id, notices) => {
    const said = env.state.notices.length;
    await env.state.commands.find((c) => c.id === id).callback();
    await until(() => env.state.notices.length >= said + notices);
  };
  try {
    await fn(env, run, asked, papers);
  } finally {
    globalThis.Image = saved;
    env.uninstall();
  }
}
const bytes = (data) => [...new Uint8Array(data)];

describe('The boards of a note are exported as pictures', () => {
  // proves: board_exchange
  test('as SVG: one picture for each board, standing on its own, and the note is never written', async () => {
    await withCanvas(async (env, run) => {
      await run('export-boards-svg', 2);
      const svg = env.state.files.get('Trips/Plan ideas.svg');
      assert.match(svg, /^<svg xmlns=/);
      assert.match(svg, /Go by train/);
      assert.match(env.state.files.get('Trips/Plan later.svg'), /Book/);
      assert.match(env.state.notices.at(-1), /Wrote Trips\/Plan later\.svg\./);
      assert.equal(env.state.files.get(PATH), NOTE);
      await run('export-boards-svg', 2);
      assert.ok(env.state.files.has('Trips/Plan ideas-2.svg'), 'a file already there is never replaced');
    });
  });

  // proves: board_exchange
  test('as PNG: each board is drawn at twice its size', async () => {
    await withCanvas(async (env, run, asked) => {
      await run('export-boards-png', 2);
      assert.deepEqual(bytes(env.state.files.get('Trips/Plan ideas.png')), PNG);
      assert.deepEqual(bytes(env.state.files.get('Trips/Plan later.png')), PNG);
      assert.equal(asked.length, 2);
      for (const [type, w, h] of asked) {
        assert.equal(type, 'image/png');
        assert.ok(w > 0 && h > 0 && w % 2 === 0 && h % 2 === 0, 'whole pixels, twice the natural size');
      }
    });
  });

  // proves: board_exchange
  test('as PDF: one file with a page for each board, each a picture kept as it was made', async () => {
    await withCanvas(async (env, run, asked, papers) => {
      await run('export-boards-pdf', 1);
      const pdf = bytes(env.state.files.get('Trips/Plan boards.pdf'));
      const text = String.fromCharCode(...pdf);
      assert.ok(text.startsWith('%PDF-1.4'));
      assert.match(text, /\/Count 2/);
      assert.equal(text.split('/Filter /DCTDecode').length - 1, 2, 'a picture on each page');
      assert.deepEqual(
        asked.map((a) => a[0]),
        ['image/jpeg', 'image/jpeg'],
      );
      assert.deepEqual(papers, ['#ffffff', '#ffffff'], 'each drawn on the light page: a JPEG holds no clear pixels');
      assert.match(env.state.notices.at(-1), /Wrote Trips\/Plan boards\.pdf\./);
    });
  });

  // proves: board_exchange
  test('a picture that cannot be drawn is said, and a note with no board writes nothing', async () => {
    await withCanvas(async (env, run) => {
      globalThis.Image = class {
        set src(_url) {
          queueMicrotask(() => this.onerror?.());
        }
      };
      await run('export-boards-png', 1);
      assert.match(env.state.notices.at(-1), /The boards were not exported: /);
      assert.deepEqual([...env.state.files.keys()], [PATH]);
    });
  });
});
