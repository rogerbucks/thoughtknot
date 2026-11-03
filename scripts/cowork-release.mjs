#!/usr/bin/env node
// Builds the Copilot Cowork skill as one .skill file for a GitHub release (editor spec §46, cowork_released).
//
// - thoughtknot-cowork-<version>.skill: a zip with one folder, `thoughtknot-graph-notes/`. In it are SKILL.md, the
//   reference it names, the companion script, LICENSE and THIRD_PARTY_NOTICES.md.
// - The companion script is built here from the library at the commit the release is tagged on. That is
//   @thoughtknot/core, with the reader and Graphviz inside it. It takes no code from anywhere else (cowork_core_only).
// - The same SKILL.md loads as a Claude skill: its front matter is a Claude skill's, and it names no host.
// - It is never sent to a store. It is attached to the release, as the library's packages are.
//
// Usage:
//   node scripts/cowork-release.mjs --out DIR   builds the .skill into DIR, at the manifest's version.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScript } from '../packages/cowork/esbuild.config.mjs';
import { zip } from './vscode-release.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = join(ROOT, 'packages/cowork/skill/thoughtknot-graph-notes');
/** The folder the skill lives in inside the .skill file. */
export const FOLDER = 'thoughtknot-graph-notes';

/** The .skill file's name at `version`. */
export const skillName = (version) => `thoughtknot-cowork-${version}.skill`;

/** Every file under `dir`, by its path from `dir`, in a fixed order. */
const filesUnder = (dir) =>
  readdirSync(dir, { recursive: true })
    .map(String)
    .filter((p) => statSync(join(dir, p)).isFile())
    .map((p) => p.split('\\').join('/'))
    .sort();

/** The files of the skill as the .skill holds them: [path, bytes], the companion script built from the library. */
export async function skillFiles(version) {
  const stage = mkdtempSync(join(tmpdir(), 'thoughtknot-cowork-'));
  try {
    const script = join(stage, 'thoughtknot.mjs');
    await buildScript(script, version);
    return [
      ...filesUnder(SKILL).map((p) => [`${FOLDER}/${p}`, readFileSync(join(SKILL, p))]),
      [`${FOLDER}/scripts/thoughtknot.mjs`, readFileSync(script)],
      [`${FOLDER}/LICENSE`, readFileSync(join(ROOT, 'LICENSE'))],
      [`${FOLDER}/THIRD_PARTY_NOTICES.md`, readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'))],
    ];
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

/** Builds the .skill at `version` into `out`, and gives its path. */
export async function packSkill({ version, out }) {
  mkdirSync(out, { recursive: true });
  const file = join(out, skillName(version));
  writeFileSync(file, zip(await skillFiles(version)));
  return file;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--out');
  if (at === -1 || !process.argv[at + 1]) {
    console.error('usage: node scripts/cowork-release.mjs --out DIR');
    process.exit(2);
  }
  const { version } = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  console.log(`cowork-release: built ${await packSkill({ version, out: resolve(process.argv[at + 1]) })}`);
}
