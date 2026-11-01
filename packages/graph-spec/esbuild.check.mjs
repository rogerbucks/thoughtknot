// Bundles the graph-spec library's entry point and its feature modules into one self-contained file. That file is
// packages/graph-spec/dist/graph-spec-check.js. Loaded as a script, it sets the page global GraphSpecCheck. Required
// in Node, it is the module. The release archive ships it at src/graph-spec-check.js, the path the vault vendors.
// Beside it, the same file as an ES module, graph-spec-check.mjs, for `import` (API-8). It exports each name of the
// entry point, and the whole module as its default.
// Usage: node esbuild.check.mjs [outfile]   (the outfile defaults to dist/graph-spec-check.js; the tests build elsewhere)
import esbuild from 'esbuild';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = process.argv[2] ? resolve(process.argv[2]) : join(here, 'dist', 'graph-spec-check.js');
await esbuild.build({
  absWorkingDir: here,
  entryPoints: ['src/graph-spec-check.js'],
  outfile,
  bundle: true,
  platform: 'neutral',
  format: 'iife',
  globalName: 'GraphSpecCheck',
  charset: 'utf8',
  legalComments: 'inline',
  banner: {
    js: [
      '// Generated from packages/graph-spec/src by packages/graph-spec/esbuild.check.mjs — do not hand-edit.',
      '// The graph spec checker in one plain file: as a script it sets the global GraphSpecCheck; in Node, require() it.',
    ].join('\n'),
  },
  footer: { js: "if (typeof module === 'object' && module && module.exports) module.exports = GraphSpecCheck;" },
  logLevel: 'warning',
});

// The ES module: the entry point bundled again, with each of its names exported by name and the module as the default.
const names = Object.keys(createRequire(import.meta.url)('./src/graph-spec-check.js'));
await esbuild.build({
  absWorkingDir: here,
  stdin: {
    contents: [
      "import C from './src/graph-spec-check.js';",
      'export default C;',
      `export const { ${names.join(', ')} } = C;`,
    ].join('\n'),
    resolveDir: here,
    sourcefile: 'graph-spec-check.mjs',
  },
  outfile: outfile.replace(/\.js$/, '.mjs'),
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  charset: 'utf8',
  legalComments: 'inline',
  banner: {
    js: [
      '// Generated from packages/graph-spec/src by packages/graph-spec/esbuild.check.mjs — do not hand-edit.',
      '// The graph spec checker in one plain file, as an ES module: import it, by name or as a whole.',
    ].join('\n'),
  },
  logLevel: 'warning',
});
