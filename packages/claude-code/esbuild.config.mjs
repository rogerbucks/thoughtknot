// Bundles the /graph mod:
// - mod/hooks/graph.js, what its hooks module runs. It is platform neutral, because a mod has no Node and no
//   WebAssembly. Tree-shaking leaves the core's engine out.
// - mod/bin/render.mjs, the core's Graphviz engine, run by node as a process.
// - mod/bin/editor-server.mjs, the browser editor's local server.
// Then the mod's test fixtures: the test vault's sample note, and the SVG Graphviz draws for it.
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPage } from './esbuild.page.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** The MCP App's page: one HTML file, its script inline, as a host's sandboxed frame loads nothing else. */
function mcpPageHtml(script) {
  const css =
    'body{font:14px system-ui,sans-serif;margin:8px;color:CanvasText;background:Canvas}' +
    '.thoughtknot-mcp-drawing svg{max-width:100%;height:auto}.thoughtknot-mcp-bar,.thoughtknot-mcp-option{display:flex;gap:8px;align-items:center;margin:6px 0}' +
    'button{font:inherit;padding:4px 10px}textarea{width:100%;min-height:3em}';
  const safe = script.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><style>${css}</style></head><body><script type="module">${safe}</script></body></html>\n`;
}
const mod = join(here, 'mod');
const common = { absWorkingDir: here, bundle: true, format: 'esm', legalComments: 'inline', logLevel: 'warning' };

await esbuild.build({
  ...common,
  entryPoints: ['src/mod-entry.ts'],
  outfile: join(mod, 'hooks/graph.js'),
  platform: 'neutral',
  mainFields: ['module', 'main'],
});
await esbuild.build({
  ...common,
  entryPoints: ['bin/render-process.ts'],
  outfile: join(mod, 'bin/render.mjs'),
  platform: 'node',
});
// the real path of a file, which node settles for the mod, whose file calls settle no links (spec §26)
await esbuild.build({
  ...common,
  entryPoints: ['bin/real-path-process.ts'],
  outfile: join(mod, 'bin/real-path.mjs'),
  platform: 'node',
});
// Claude's proposal sent to that server, which node does for the mod, whose hooks have no network (spec §26)
await esbuild.build({
  ...common,
  entryPoints: ['bin/propose-process.ts'],
  outfile: join(mod, 'bin/propose.mjs'),
  platform: 'node',
});
// the person's decision, or a presentation they kept, written into the note, which node does for the mod (spec §49)
await esbuild.build({
  ...common,
  entryPoints: ['bin/record-process.ts'],
  outfile: join(mod, 'bin/record.mjs'),
  platform: 'node',
});
// the local MCP server, which node runs over standard input and output, and its one page, inlined into one HTML file
// (spec §49, mcp_app)
await esbuild.build({
  ...common,
  entryPoints: ['bin/mcp-process.ts'],
  outfile: join(mod, 'bin/mcp.mjs'),
  platform: 'node',
});
const mcpPage = await esbuild.build({
  ...common,
  entryPoints: ['page/mcp-page.ts'],
  platform: 'browser',
  target: 'es2022',
  write: false,
  minify: true,
});
writeFileSync(join(mod, 'bin/mcp-page.html'), mcpPageHtml(mcpPage.outputFiles[0].text));
// the browser editor's local server, which node runs as a process of its own (spec §26)
await esbuild.build({
  ...common,
  entryPoints: ['server/editor-server.ts'],
  outfile: join(mod, 'bin/editor-server.mjs'),
  platform: 'node',
});

// the browser editor's page, which that server serves from its own origin (esbuild.page.mjs)
await buildPage(join(mod, 'page'));

const graph = await import(`${pathToFileURL(join(mod, 'hooks/graph.js')).href}?${Date.now()}`);
const note = readFileSync(join(here, '../../test-vault/Sample graph note.md'), 'utf8');
const dots = [];
await graph.viewOf(note, async (d) => (dots.push(...d), { why: 'only the sources were wanted' }), graph.PANE_PALETTE);
const svgs = execFileSync('node', [join(mod, 'bin/render.mjs')], { input: JSON.stringify(dots), encoding: 'utf8' });
writeFileSync(
  join(mod, 'tests/fixtures.js'),
  "// Made by esbuild.config.mjs: the test vault's sample note, and the SVG Graphviz draws for each layout of its graph.\n" +
    `export const NOTE = ${JSON.stringify(note)};\nexport const SVGS = ${svgs};\n`,
);
