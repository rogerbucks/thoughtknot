#!/usr/bin/env node
// Section numbers name the spec they belong to (editor spec §51, spec_sections_named). The graph spec's sections are
// cited GS§3 and this editor spec's ES§27. A bare § with a number and no spec is refused in new text. The bare ones
// that were here first are counted per file in quality/bare-section-citations.json, and the count only shrinks.
// Prose that names its spec ("graph spec §3", "editor spec §27") is named already.
//
// Two more checks. The graph spec marks each missing section number withdrawn, in requirements/graph-spec-version.json.
// And every graph-spec rule id cited in a document, a workflow or the code must name a rule.
//
// Run it bare to see what is wrong, one line each. Run it with --update to rewrite the record from the repository.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEC, specRules } from './graph-spec-proved.mjs';
import { VERSION_FILE, readVersion } from './graph-spec-version.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const RECORD = 'quality/bare-section-citations.json';
// What may stand just before a section number to name its spec: GS or ES, or the words "graph spec" or "editor spec". A plain "spec" does not say which.
const NAMED = /(?:\b(?:GS|ES)|\b[Gg]raph spec(?:'s)?|\b[Ee]ditor spec(?:'s)?)\s*$/;
const TEXT = /\.(md|ya?ml|js|mjs|cjs|ts|py|json|gql)$/;
// Not ours to rewrite: the owner's conformance suite, fixtures, generated files and the record itself.
const SKIP =
  /^(python\/graph_spec\/conformance\/|packages\/core\/test\/fixtures\/|test\/(tests-first|seen-failing)\/|public-api\.json$|package-lock\.json$|quality\/bare-section-citations\.json$)/;

/** The repository's text files, as repo-relative paths. */
export const textFiles = (root = ROOT) =>
  execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 1e8 })
    .split('\n')
    .filter((f) => TEXT.test(f) && !SKIP.test(f));

/** How many section numbers in `text` name no spec. */
export function bareCount(text) {
  let n = 0;
  for (const m of text.matchAll(/§\s?\d+/g)) if (!NAMED.test(text.slice(Math.max(0, m.index - 16), m.index))) n++;
  return n;
}

/** {file: count} of the bare section numbers now. */
export function bareNow(root = ROOT) {
  const out = {};
  for (const f of textFiles(root)) {
    let n = 0;
    try {
      n = bareCount(readFileSync(join(root, f), 'utf8'));
    } catch {
      /* a file git lists but the checkout lacks */
    }
    if (n) out[f] = n;
  }
  return out;
}

/** What is wrong when the bare citations now are compared with the record, one line each. */
export function compareToRecord(now, recorded) {
  const out = [];
  for (const [file, n] of Object.entries(now)) {
    const was = recorded[file] ?? 0;
    if (n > was)
      out.push(
        `${file} has ${n - was} more bare section number${n - was > 1 ? 's' : ''} than its record: write GS§ for the graph spec or ES§ for the editor spec before the number`,
      );
  }
  for (const [file, was] of Object.entries(recorded))
    if ((now[file] ?? 0) < was)
      out.push(
        `${file} has fewer bare section numbers than its record: run node scripts/section-citations.mjs --update`,
      );
  return out;
}

/** Section numbers the graph spec lacks between its first and last, that its version file does not mark withdrawn. */
export function unmarkedGaps(specText, withdrawn) {
  const nums = [...specText.matchAll(/:Section \{id: 'spec:§(\d+)'/g)].map((m) => Number(m[1]));
  const marked = new Set(withdrawn.map((w) => Number(w.section)));
  const out = [];
  for (let n = Math.min(...nums); n <= Math.max(...nums); n++) if (!nums.includes(n) && !marked.has(n)) out.push(n);
  for (const w of withdrawn)
    if (nums.includes(Number(w.section))) out.push(`section ${w.section} is marked withdrawn but the spec has it`);
  return out;
}

/** The graph-spec rule ids cited in documents, workflows and code (not tests, which use made-up ones), that name no rule. */
export function unresolvedIds(root = ROOT) {
  const ids = new Set(specRules(readFileSync(join(root, SPEC), 'utf8')));
  const out = [];
  for (const f of textFiles(root)) {
    if (f === SPEC || /(^|\/)test\/|\.test\.|^scripts\//.test(f)) continue;
    let text = '';
    try {
      text = readFileSync(join(root, f), 'utf8');
    } catch {
      continue;
    }
    for (const m of text.matchAll(/\breq:\d+\.[A-Za-z0-9_.-]*[A-Za-z0-9_]/g))
      if (!ids.has(m[0])) out.push(`${f} cites ${m[0]}, which is no graph-spec rule`);
  }
  return out;
}

/** Everything wrong, one line each. */
export function problems(root = ROOT) {
  const recorded = JSON.parse(readFileSync(join(root, RECORD), 'utf8')).files;
  const gaps = unmarkedGaps(readFileSync(join(root, SPEC), 'utf8'), readVersion(root).withdrawn ?? []).map((g) =>
    typeof g === 'number' ? `the graph spec has no section ${g} and ${VERSION_FILE} does not mark it withdrawn` : g,
  );
  return [...compareToRecord(bareNow(root), recorded), ...gaps, ...unresolvedIds(root)];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--update')) {
    const files = bareNow();
    writeFileSync(
      join(ROOT, RECORD),
      `${JSON.stringify({ about: 'Bare section numbers, counted per file, that were here before sections were named GS§ and ES§ (editor spec §51, spec_sections_named). The count only shrinks. A new bare one fails.', files }, null, 2)}\n`,
    );
    console.log(
      `${RECORD}: ${Object.values(files).reduce((a, b) => a + b, 0)} bare section numbers in ${Object.keys(files).length} files`,
    );
  } else {
    const found = problems();
    if (found.length) {
      for (const p of found) console.log(p);
      process.exitCode = 1;
    } else console.log('every section number names its spec, or is on the record');
  }
}
