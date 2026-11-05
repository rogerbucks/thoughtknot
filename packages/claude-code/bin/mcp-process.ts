// The local MCP server's process (editor spec §49, mcp_app_local): `node mcp.mjs <folder>`. It reads JSON-RPC messages,
// one a line, from standard input and writes each answer as one line on standard output. Nothing else is written there.
// - Notes are read only inside the folder named. The person's settings are the ThoughtKnot plugin's own, in that
//   folder's `.obsidian/plugins/thoughtknot/data.json`; with none, the strictest defaults hold.
// - Writes go to a file beside the note, then move into place.
// - It opens no port and makes no network call. The layout is the core's own Graphviz engine.
import { randomBytes } from 'node:crypto';
import { readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { loadEngine, PALETTES } from '@thoughtknot/core';
import { McpServer } from '../src/mcp-server.ts';

const given = process.argv[2];
if (!given) {
  console.error('Name the folder of notes: node mcp.mjs <folder>');
  process.exit(2);
}
const folder = await realpath(given);
const here = dirname(fileURLToPath(import.meta.url));
const engine = await loadEngine();

const server = new McpServer({
  folder,
  realPath: (p) => realpath(p),
  read: (p) => readFile(p, 'utf8'),
  write: async (p, text) => {
    const temp = `${p}.thoughtknot-${process.pid}`;
    await writeFile(temp, text);
    await rename(temp, p);
  },
  settings: async () => {
    try {
      return JSON.parse(await readFile(join(folder, '.obsidian/plugins/thoughtknot/data.json'), 'utf8')) as unknown;
    } catch {
      return null;
    }
  },
  lay: async (dots) => ({ svgs: dots.map((d) => engine.render(d)) }),
  palette: PALETTES.system,
  page: () => readFile(join(here, 'mcp-page.html'), 'utf8'),
  now: () => new Date().toISOString(),
  key: () => randomBytes(24).toString('base64url'),
});

// one answer at a time, in the order the messages came
let turn = Promise.resolve();
createInterface({ input: process.stdin }).on('line', (line) => {
  turn = turn.then(async () => {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const answer = await server.handle(message).catch((err: unknown) => ({
      jsonrpc: '2.0',
      id: (message as { id?: unknown }).id ?? null,
      error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
    }));
    if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
  });
});
