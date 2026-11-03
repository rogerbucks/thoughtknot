// Bundles the Copilot Cowork skill's companion script as one file: scripts/thoughtknot.mjs. It is built from the
// library alone: @thoughtknot/core, with the graph-spec reader and Graphviz inside it. So the skill takes every
// reading, check, layout and edit from the library (cowork_core_only). It carries no other code.
import esbuild from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Builds the companion script to `outfile`, naming the library version it is built from when one is given. */
export async function buildScript(outfile, version) {
  await esbuild.build({
    absWorkingDir: here,
    entryPoints: ['bin/thoughtknot.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    legalComments: 'inline',
    logLevel: 'warning',
    // top-level await and the wasm engine are bundled; node's own modules are the only imports left
    banner: {
      js: `${version ? `// built from @thoughtknot/core ${version}\n` : ''}import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);`,
    },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildScript(join(here, 'dist/scripts/thoughtknot.mjs'));
