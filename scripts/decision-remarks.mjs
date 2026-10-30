#!/usr/bin/env node
// Decisions have one home (risk FLOW-11). A remark such as "(Roger, 16 Oct 2026)" in the requirements or the docs says
// the owner decided something that day. The wiki's Decisions page lists only answered Question nodes. A decision known
// only from a remark is lost to a reader. So every remark's date must have a Question answered that day.
//
// Remarks from before this check have no Question yet. They are allowed, date by date, in
// quality/decision-remarks.json, a ratchet. A date with more remarks than allowed fails. One with fewer fails until
// the allowance is lowered with --tighten. The command never raises an allowance. A date that gets its Question needs
// no allowance at all.
//
// Usage: node scripts/decision-remarks.mjs            lists each date over or under its allowance; exits 1 if any.
//        node scripts/decision-remarks.mjs --tighten  lowers each allowance to what the files now have.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ALLOWANCE = 'quality/decision-remarks.json';
const REQUIREMENTS = 'requirements/editor-requirements.md';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const REMARK = /\(Roger, (\d{1,2}) ([A-Z][a-z]{2}) (20\d\d)\)/g;

/** The ISO dates of the "(Roger, <date>)" remarks in a text, one entry per remark. */
export function remarkDates(text) {
  return [...text.matchAll(REMARK)]
    .filter((m) => MONTHS.includes(m[2]))
    .map((m) => `${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`);
}

/** The dates on which some Question of the requirements was answered. */
export function answeredDates(text) {
  return new Set([...text.matchAll(/:Question \{[^}]*?answered: '(\d{4}-\d\d-\d\d)'/g)].map((m) => m[1]));
}

/** The docs that may carry a remark: the requirements, the root guides and everything under docs/. */
export function docFiles(root = ROOT) {
  const walk = (dir) =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : [],
    );
  const rootMd = readdirSync(root).filter((f) => f.endsWith('.md'));
  return [REQUIREMENTS, ...rootMd, ...(existsSync(join(root, 'docs')) ? walk('docs') : [])];
}

/** Remarks per date that no Question answers: { '2026-10-18': 9, … }. */
export function unrecorded(root = ROOT) {
  const answered = answeredDates(readFileSync(join(root, REQUIREMENTS), 'utf8'));
  const counts = {};
  for (const file of new Set(docFiles(root))) {
    for (const d of remarkDates(readFileSync(join(root, file), 'utf8'))) {
      if (!answered.has(d)) counts[d] = (counts[d] ?? 0) + 1;
    }
  }
  return counts;
}

/** What is wrong: [{date, have, allowed}] for each date over or under its allowance. */
export function compare(have, allowed) {
  return [...new Set([...Object.keys(have), ...Object.keys(allowed)])]
    .sort()
    .map((date) => ({ date, have: have[date] ?? 0, allowed: allowed[date] ?? 0 }))
    .filter((r) => r.have !== r.allowed);
}

/** The allowance lowered to what is there, never raised. */
export function tightened(have, allowed) {
  return Object.fromEntries(
    Object.keys(allowed)
      .sort()
      .map((d) => [d, Math.min(allowed[d], have[d] ?? 0)])
      .filter(([, n]) => n > 0),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const have = unrecorded();
  const path = join(ROOT, ALLOWANCE);
  const allowed = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  if (process.argv.includes('--tighten')) {
    writeFileSync(path, JSON.stringify(tightened(have, allowed), null, 2) + '\n');
    process.exit(0);
  }
  const bad = compare(have, allowed);
  for (const r of bad) {
    console.error(
      r.have > r.allowed
        ? `${r.date}: ${r.have} remarks "(Roger, <date>)" but no Question answered that day. Add the Question to ${REQUIREMENTS}.`
        : `${r.date}: allowance ${r.allowed} but only ${r.have} left. Lower it: node scripts/decision-remarks.mjs --tighten`,
    );
  }
  if (bad.length) process.exit(1);
  console.log(`decision remarks: ${Object.values(have).reduce((a, b) => a + b, 0)} without a Question, as allowed`);
}
