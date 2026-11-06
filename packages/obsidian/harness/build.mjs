// Builds a page that shows the plugin drawing a sample note in an ordinary browser. It is for looking at it and trying
// the controls before it goes onto a device.
// Run: node packages/obsidian/harness/build.mjs <folder> [note.md]
// A note given is drawn in place of sample.md. The rendering scoreboard does so (scripts/render-scoreboard.mjs).
import esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutWorker, pluginWorker } from '../esbuild.config.mjs';

const here = dirname(fileURLToPath(import.meta.url)),
  out = process.argv[2],
  note = process.argv[3];
if (!out) throw new Error('give the folder to build the page into');
mkdirSync(out, { recursive: true });

/** Swaps the harness's sample note for the note at `path`. */
function noteIn(path) {
  return {
    name: 'note-in',
    setup(build) {
      build.onResolve({ filter: /^\.\/sample\.md$/ }, () => ({ path: resolve(path) }));
    },
  };
}
await esbuild.build({
  entryPoints: [join(here, 'harness.js')],
  outfile: join(out, 'harness.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  alias: { obsidian: join(here, 'obsidian-shim.js') },
  // the SQLite engine of Import is held inside the bundle, as the plugin's build holds it (spec §20)
  loader: { '.md': 'text', '.wasm': 'binary' },
  // the layout worker's own bundle, made as the plugin's build makes it (spec §9, layout_contained)
  plugins: [layoutWorker, pluginWorker, ...(note ? [noteIn(note)] : [])],
  logLevel: 'warning',
});
copyFileSync(join(here, '..', '..', '..', 'styles.css'), join(out, 'styles.css'));
copyFileSync(join(here, 'index.html'), join(out, 'index.html'));
