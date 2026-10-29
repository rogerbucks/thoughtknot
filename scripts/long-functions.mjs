#!/usr/bin/env node
// The guard against long functions (spec §13, test_conventions: CODE-9). A file is capped at 400 lines. But one
// function of 200 lines is as hard to hold in the head as a file of 200 lines. Its change is hard to review, and its
// branches are hard to test one by one.
//
// A long function has more than 100 lines, from its first line to its last. Only the code that ships counts: each
// package's src, server and page folders. A function is named by its file and the path of names down to it, such as
// `packages/obsidian/src/block.ts#renderBlock` or `…#BlockView.draw`. One with no name is named by what holds it and its
// place there: `…#bindViewportEvents>2` is the second nameless function inside it. A function that wraps a whole module,
// `(function (root) { … })(this)`, is read as the file: the file's cap holds it, and each function in it is named as if
// at the top.
//
// Those already there are held in test/long-functions.json, a ratchet: each one's lines may only go down. A new long
// function fails, and so does one on the list that grew. One that shrank, or now has 100 lines or fewer, fails too until
// the list is lowered with --tighten. So a function split stays split. The list is never raised by the command.
//
// Usage: node scripts/long-functions.mjs            lists each function over or under its allowance; exits 1 if any.
//        node scripts/long-functions.mjs --tighten  lowers each allowance to what the function now has.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ALLOWANCE = 'test/long-functions.json';
/** The most lines a function may have before it is long. */
export const MOST_LINES = 100;
const SHIPPED = /^packages\/[^/]+\/(src|server|page)\/.*\.(ts|tsx|js|mjs)$/;

/** The shipped source files of the repository, as git lists them, leaving out declarations and built files. */
export const shippedFiles = () =>
  execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => SHIPPED.test(f) && !f.endsWith('.d.ts') && !/\/(dist|built)\//.test(f));

/** The name a function is known by in its place: its own, or the name it is bound to, or null for none. */
function ownName(n) {
  if (n.name && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name) || ts.isPrivateIdentifier(n.name)))
    return n.name.text;
  if (ts.isConstructorDeclaration(n)) return 'constructor';
  const p = n.parent;
  if (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)))
    return ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
  return null;
}

const isFunction = (n) =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isConstructorDeclaration(n) ||
  ts.isGetAccessorDeclaration(n) ||
  ts.isSetAccessorDeclaration(n);

/**
 * Whether `n` wraps a whole module: a function called where it is written, as a statement at the top of the file, such
 * as `(function (root) { … })(this)`. The file's cap holds it, so it is read as the file and what it holds as the top.
 */
function wrapsModule(n) {
  let call = n.parent;
  while (call && ts.isParenthesizedExpression(call)) call = call.parent;
  if (!call || !ts.isCallExpression(call) || ts.skipOuterExpressions(call.expression) !== n) return false;
  let statement = call.parent;
  while (statement && ts.isParenthesizedExpression(statement)) statement = statement.parent;
  return !!statement && ts.isExpressionStatement(statement) && ts.isSourceFile(statement.parent);
}

/** Every function of `sources` ({file: text}) over the line limit, as {name, lines}, by name. */
export function longFunctions(sources, most = MOST_LINES) {
  const found = [];
  for (const [file, text] of Object.entries(sources)) {
    const kind = /\.tsx$/.test(file) ? ts.ScriptKind.TSX : /\.ts$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    const visit = (n, path, nameless) => {
      if ((ts.isFunctionExpression(n) || ts.isArrowFunction(n)) && wrapsModule(n))
        return n.forEachChild((c) => visit(c, path, nameless));
      if (isFunction(n) && n.body) {
        const own = ownName(n) ?? `${path.length ? '>' : ''}${(nameless.count = (nameless.count ?? 0) + 1)}`;
        const name = own.startsWith('>') ? `${path.join('.')}${own}` : [...path, own].join('.');
        const first = src.getLineAndCharacterOfPosition(n.getStart(src)).line;
        const last = src.getLineAndCharacterOfPosition(n.getEnd()).line;
        if (last - first + 1 > most) found.push({ name: `${file}#${name}`, lines: last - first + 1 });
        const inner = {};
        n.forEachChild((c) => visit(c, name.split('.'), inner));
        return;
      }
      const holds = ts.isClassLike(n) && n.name ? [...path, n.name.text] : path;
      n.forEachChild((c) => visit(c, holds, holds === path ? nameless : {}));
    };
    visit(src, [], {});
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Each function whose lines differ from its allowance. One new or grown is `over`, with its lines. One that shrank or
 * went is `under`: its allowance is to be lowered.
 */
export function compareAllowance(found, allowance) {
  const lines = Object.fromEntries(found.map((f) => [f.name, f.lines])),
    out = [];
  for (const name of [...new Set([...Object.keys(lines), ...Object.keys(allowance)])].sort()) {
    const has = lines[name] ?? 0,
      allowed = allowance[name] ?? 0;
    if (has > allowed) out.push({ name, has, allowed, over: true });
    else if (has < allowed) out.push({ name, has, allowed, over: false });
  }
  return out;
}

/** The allowance lowered to what each function now has, never raised; a function no longer long is dropped. */
export function tightened(found, allowance) {
  const lines = Object.fromEntries(found.map((f) => [f.name, f.lines]));
  return Object.fromEntries(
    Object.entries(allowance)
      .map(([name, allowed]) => [name, Math.min(allowed, lines[name] ?? 0)])
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** The long functions of the repository as committed. */
export const repositoryFunctions = () => longFunctions(Object.fromEntries(shippedFiles().map((f) => [f, read(f)])));

function main(args) {
  const found = repositoryFunctions(),
    allowance = JSON.parse(read(ALLOWANCE));
  if (args.includes('--tighten')) {
    writeFileSync(join(ROOT, ALLOWANCE), `${JSON.stringify(tightened(found, allowance), null, 2)}\n`);
    return 0;
  }
  const differ = compareAllowance(found, allowance);
  for (const d of differ)
    console.log(
      d.over
        ? `${d.name}: ${d.has} lines, ${d.allowed ? `over its ${d.allowed}` : `over ${MOST_LINES}`}: split it`
        : `${d.name}: ${d.has} lines, under its ${d.allowed}: run node scripts/long-functions.mjs --tighten`,
    );
  return differ.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
