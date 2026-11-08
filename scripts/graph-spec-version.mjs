#!/usr/bin/env node
// The Graph Spec's version (editor spec §51, spec_versioned). The spec's rules are requirements/graph-spec.gql; its
// version, and the changelog of every version, are requirements/graph-spec-version.json. A change to the rules makes a
// new version. That adds a changelog line. The line holds the decision, the owner's approval and the rules' new hash.
//
// Run it bare to see the version and whether the rules match.
// Run it with --hash to print the rules' hash for a changelog line.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SPEC_FILE = 'requirements/graph-spec.gql';
export const VERSION_FILE = 'requirements/graph-spec-version.json';

/** The rules' named hash (requirements/hashes.md): every line but the whole-line comments, which are the header. */
export function rulesHash(root = ROOT) {
  const rules = readFileSync(join(root, SPEC_FILE), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  return `sha-256:${createHash('sha256').update(rules).digest('hex')}`;
}

/** The version file, read. */
export const readVersion = (root = ROOT) => JSON.parse(readFileSync(join(root, VERSION_FILE), 'utf8'));

/** What is wrong with the version file or the rules it describes, as sentences. Empty when all is well. */
export function problems(root = ROOT) {
  const v = readVersion(root);
  const out = [];
  if (!/^\d+\.\d+$/.test(v.version)) out.push(`the version '${v.version}' is not major.minor, such as 1.0`);
  const log = Array.isArray(v.changelog) ? v.changelog : [];
  const last = log[log.length - 1];
  if (!last) return [...out, 'the changelog has no line'];
  for (const [i, entry] of log.entries())
    for (const key of ['version', 'date', 'what', 'decision', 'approved_by', 'rules_hash'])
      if (!entry[key]) out.push(`changelog line ${i + 1} has no ${key}`);
  if (last.version !== v.version) out.push(`the version is ${v.version} but the changelog ends at ${last.version}`);
  if (last.rules_hash !== rulesHash(root))
    out.push(
      `the rules changed since Graph Spec ${last.version}: add a changelog line with a new version, its decision and the owner's approval, and the hash from 'node scripts/graph-spec-version.mjs --hash'`,
    );
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--hash')) console.log(rulesHash());
  else {
    const found = problems();
    console.log(`Graph Spec ${readVersion().version}${found.length ? '' : ': the rules match it'}`);
    for (const p of found) console.log(`  ${p}`);
    process.exitCode = found.length ? 1 : 0;
  }
}
