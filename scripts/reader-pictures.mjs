// The command line that brings the pictures for readers up to date in a folder or a repository (editor spec §62,
// picture_outside_tools). Graphs edited by hand, or kept on GitHub, then stay in step with their pictures. It
// draws as the apps do, with the core's own Graphviz, so the files it writes match theirs.
// - A note with a picture line is kept in step. `--add` gives every note with a graph its pictures.
// - `--check` writes nothing. It lists each file out of date and fails, for a check in CI.
// - Only a file that names itself as ThoughtKnot's is written over or removed.
//
// Usage:
//   node scripts/reader-pictures.mjs <folder> [--add] [--check]
// Writes: the pictures and the notes' image lines in <folder>, unless --check.
import { readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEngine } from '../packages/core/src/engine.ts';
import { PALETTES } from '../packages/core/src/palette.ts';
import { chosen, directions, svgOf } from '../packages/core/src/render.ts';
import { folderPictures } from '../packages/core/src/reader-picture-folder.ts';
import { DEFAULT_SETTINGS } from '../packages/core/src/settings.ts';

/** Folders never read: a tool's own, or a hidden one such as .git or .obsidian. */
const SKIPPED = new Set(['node_modules']);

/** Every note under `root`, by its path from there with `/` between parts. */
async function notesUnder(root, dir = root) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIPPED.has(e.name)) continue;
    const path = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await notesUnder(root, path)));
    else if (e.name.toLowerCase().endsWith('.md')) out.push(relative(root, path).split(sep).join('/'));
  }
  return out.sort();
}

/** Today where the tool runs, as the picture's foot says it. */
function today() {
  const now = new Date(),
    two = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** Brings the pictures under `root` up to date, or with `check` only says which are not. It gives the exit code. */
export async function readerPictures(root, { add = false, check = false, say = console.log } = {}) {
  const engine = await loadEngine();
  const at = (path) => join(root, ...path.split('/'));
  const run = await folderPictures({
    notes: await notesUnder(root),
    read: (path) => readFile(at(path), 'utf8').catch(() => null),
    add,
    date: today(),
    layout: async (d, theme) => {
      const laid = directions(d);
      return chosen(
        laid,
        laid.map((x) => svgOf(engine, x.dot, d.routing)),
        PALETTES[theme],
      );
    },
    noteClassification: null,
    settings: DEFAULT_SETTINGS,
  });
  for (const p of run.problems) say(p);
  if (check) {
    for (const path of run.outOfDate) say(`out of date: ${path}`);
    return run.outOfDate.length ? 1 : 0;
  }
  for (const c of run.changes) {
    if (c.text === null) await rm(at(c.path), { force: true });
    else {
      await mkdir(dirname(at(c.path)), { recursive: true });
      await writeFile(at(c.path), c.text);
    }
  }
  say(`${run.outOfDate.length} file(s) brought up to date`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith('--'));
  if (!root) {
    console.error('usage: node scripts/reader-pictures.mjs <folder> [--add] [--check]');
    process.exit(2);
  }
  process.exitCode = await readerPictures(root, { add: args.includes('--add'), check: args.includes('--check') });
}
