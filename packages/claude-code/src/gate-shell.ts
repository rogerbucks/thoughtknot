// How gate-guard.ts judges a Bash command (spec §26, risk TRUST-1): whether it could change an existing note's
// classification. Bash cannot be fully parsed, so shell-steps.ts reads a command into its steps. The steps are followed
// in order: where `cd` leads, and what each variable may hold, each value a `for` gives it among them. So the files
// each step writes are known. What the shell may not set, or sets in a subshell, is not known.
//
// A write to a file not yet made is allowed, whatever it holds. Roger ruled so on 7 Nov 2026: a new note may carry a
// classification, such as a screenshot's sidecar does. A heredoc that `cat` sends to a note that exists is judged as a
// Write is, whether the command names `classification` or not. Beyond that, a command that names it is refused unless
// every step only reads, or writes only to files not yet made. What a command changes without naming it, such as
// cutting the front matter by line numbers, is not seen. GUIDE.md says so.
import { classificationOf } from '@thoughtknot/core';
import type { GatePorts } from './gate-guard.ts';
import { LITERAL_DOLLAR, UNKNOWN, shellSteps } from './shell-steps.ts';
import type { ShellStep } from './shell-steps.ts';

/**
 * The programs that only read, search or print, with the arguments that would make each do more. No other program is
 * trusted, but for `git`, `sed` and `uniq`, judged below. `cd`, `mkdir` and `touch` touch no note's text.
 */
const READERS = new Map<string, RegExp | null>([
  ['[', null],
  ['basename', null],
  ['cat', null],
  ['cd', null],
  ['cut', null],
  ['date', /^(-\w*s|--set)/],
  ['dirname', null],
  ['echo', null],
  ['find', /^-(exec|ok|delete|fprint|fls)/],
  ['grep', null],
  ['head', null],
  ['less', /^(-\w*o|--log)/i],
  ['ls', null],
  ['mkdir', null],
  ['nl', null],
  ['printf', /^-v/],
  ['pwd', null],
  ['realpath', null],
  ['rg', /^--(pre|hostname-bin)/],
  ['sort', /^(-\w*o|--o|--c)/],
  ['tail', null],
  ['test', null],
  ['touch', null],
  ['tr', null],
  ['true', null],
  ['uuidgen', null],
  ['wc', null],
  ['which', null],
]);

/** What `git` may be asked to do and still only read; an option that writes a file or runs a program is refused. */
const GIT_READS = new Set(['blame', 'check-ignore', 'diff', 'grep', 'log', 'ls-files', 'rev-parse', 'show', 'status']);
const GIT_MORE = /^(-O|--open-files-in-pager|--output|--ext-diff)/;

/** A sed script that only prints: addresses with p, d, = or q, or a substitution whose flags write and run nothing. */
const SED_ADDRESS = String.raw`(\d+|\$|/([^/\\]|\\.)*/)`;
const SED_PART = new RegExp(
  String.raw`^(${SED_ADDRESS}(,${SED_ADDRESS})?)?\s*!?\s*([pd=q]?|s/([^/\\]|\\.)*/([^/\\]|\\.)*/[gpI0-9]*)$`,
);

/** The words a shell gives the next ones to, before the command. */
const KEYWORDS = new Set(['!', '{', 'do', 'elif', 'else', 'if', 'then', 'time', 'until', 'while']);
/** The words that close what KEYWORDS open, standing alone. */
const CLOSERS = new Set(['}', 'done', 'esac', 'fi']);
/** The programs whose words are only names to set: `export A=b`. */
const SETTERS = new Set(['declare', 'export', 'local', 'readonly', 'typeset']);
/** The programs that write only what they are given, and so may be sent to a new file. */
const PRINTERS = new Set(['cat', 'echo', 'printf', 'true', ':']);
/** How many paths a word may stand for before it is not known. */
const MOST_VALUES = 64;

/** A character that makes the shell choose the path, so what it would write to is not known here. */
const PATH_NOT_KNOWN = /[*?[\]{}$`~^#<>|]/;

/** What stateOf says of a file not there, and of one there but not read (a folder, say): no file's text holds these. */
const MISSING = `${UNKNOWN}missing`;
const UNREAD = `${UNKNOWN}unread`;

const isOption = (arg: string) => arg.startsWith('-') && arg !== '-';

const isAssignment = (word: string) => /^[A-Za-z_]\w*=/.test(word);

const sameClassification = (before: string, after: string) =>
  JSON.stringify(classificationOf(before)) === JSON.stringify(classificationOf(after));

/** Whether `sed` with these arguments only prints: no in-place edit, no script file, and a script that only prints. */
function sedOnlyPrints(args: readonly string[]): boolean {
  const scripts: string[] = [];
  let given = false;
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] ?? '';
    if (arg === '-e' || arg === '--expression') {
      at += 1;
      scripts.push(args[at] ?? '');
      given = true;
    } else if (/^-[nEr]+$/.test(arg) || arg === '--quiet' || arg === '--silent') continue;
    else if (isOption(arg)) return false;
    else if (!given && !scripts.length) scripts.push(arg);
  }
  return scripts.length > 0 && scripts.every((script) => script.split(/[;\n]/).every((p) => SED_PART.test(p.trim())));
}

/** Whether `git` with these arguments only reads. */
function gitOnlyReads(args: readonly string[]): boolean {
  let at = 0;
  while (args[at] === '-C' || args[at] === '--no-pager') at += args[at] === '-C' ? 2 : 1;
  return GIT_READS.has(args[at] ?? '') && !args.slice(at + 1).some((arg) => GIT_MORE.test(arg));
}

/** Whether a command runs a trusted program, with no argument that would make it write. Redirections are not judged. */
function programOnlyReads(words: readonly string[]): boolean {
  const [program = '', ...args] = words;
  if (program === 'sed') return sedOnlyPrints(args);
  if (program === 'git') return gitOnlyReads(args);
  if (program === 'uniq') return args.filter((arg) => !isOption(arg)).length <= 1;
  const more = READERS.get(program);
  if (more === undefined) return false;
  return !more || !args.some((arg) => more.test(arg));
}

/** What the steps so far have set: the folder the shell is in (null when not known), and each variable's values. */
type Scope = { cwd: string | null; vars: Map<string, string[] | null> };

/** Each text a word may stand for, its variables and `~` expanded; null when that is not known here. */
function expand(word: string, scope: Scope, home?: string): string[] | null {
  if (word.includes(UNKNOWN)) return null;
  let values = [''];
  const text = home ? word.replace(/^~(?=\/|$)/, home) : word;
  for (const part of text.split(/(\$\{[A-Za-z_]\w*\}|\$[A-Za-z_]\w*|\$)/)) {
    const options = part.startsWith('$') ? scope.vars.get(part.replace(/^\$\{?|\}$/g, '')) : [part];
    if (!options) return null;
    values = values.flatMap((v) => options.map((o) => v + o));
    if (values.length > MOST_VALUES) return null;
  }
  return values.map((v) => v.replaceAll(LITERAL_DOLLAR, '$'));
}

/** `path` taken from the folder `from` as one full path, its `.` and `..` worked out, as the shell would. */
function joined(from: string, path: string): string {
  const parts: string[] = [];
  for (const part of `${from}/${path}`.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return `/${parts.join('/')}`;
}

/** Each full path a word may lead to; null when one is not known, or the shell would choose it by a pattern. */
function pathsOf(word: string, scope: Scope, home?: string): string[] | null {
  const values = expand(word, scope, home);
  if (!values || values.some((v) => PATH_NOT_KNOWN.test(v))) return null;
  if (values.some((v) => !v.startsWith('/')) && scope.cwd === null) return null;
  return values.map((v) => joined(v.startsWith('/') ? '' : (scope.cwd ?? ''), v));
}

/** What a file holds now: its text, MISSING when it is not there, or UNREAD when it is there but not read. */
async function stateOf(path: string, ports: GatePorts): Promise<string> {
  if (!ports.read) return UNREAD;
  try {
    return await ports.read(path);
  } catch {
    try {
      await ports.realPath(path);
      return UNREAD;
    } catch {
      return MISSING;
    }
  }
}

/** The files `cp` or `mv` would write, or null when they are not known. */
async function copyTargets(args: readonly string[], scope: Scope, ports: GatePorts): Promise<string[] | null> {
  if (args.some((arg) => isOption(arg) && (!/^-[a-zA-Z]+$/.test(arg) || arg.includes('t')))) return null;
  const named = args.filter((arg) => !isOption(arg));
  const to = named.pop();
  const targets = to === undefined || !named.length ? null : pathsOf(to, scope, ports.home);
  if (!targets || targets.length !== 1) return null;
  const [target = ''] = targets;
  if ((await stateOf(target, ports)) !== UNREAD) return named.length === 1 ? [target] : null;
  // the target is a folder: each file goes into it by its own name
  const sources = named.map((n) => expand(n, scope, ports.home));
  const known = sources.every((s): s is string[] => s !== null && !s.some((v) => PATH_NOT_KNOWN.test(v)));
  return known ? sources.flat().map((v) => joined(target, v.replace(/\/+$/, '').split('/').pop() ?? '')) : null;
}

/** How a step writes a file: its heredoc and whether its text is known, whether it appends, and whether it is `cat`'s. */
type Writing = { body: string | null; literal: boolean; append: boolean; cat: boolean };

/**
 * Whether a step's write to `path` is allowed. A file not yet made has no classification to change. A heredoc `cat`
 * sends to a note that exists is judged by what it leaves. Any other write to a file that exists is refused when the
 * command names `classification`, as is a heredoc whose text the shell would expand.
 */
async function mayWrite(path: string, how: Writing, named: boolean, ports: GatePorts): Promise<boolean> {
  const before = await stateOf(path, ports);
  if (before === MISSING) return true;
  if (before === UNREAD || how.body === null || !how.cat || (named && !how.literal)) return !named;
  return sameClassification(before, how.append ? before + how.body : how.body);
}

/** The keywords before a step's command, and the command after them. */
function split(words: readonly string[]): { keywords: string[]; rest: string[] } {
  let at = 0;
  while (KEYWORDS.has(words[at] ?? '')) at += 1;
  return { keywords: words.slice(0, at), rest: words.slice(at) };
}

/** The variable a `for` sets, and the words of its values; null when the step is no `for`. */
function forOf(rest: readonly string[]): { name: string; values: string[] } | null {
  const [first, name = '', keyword, ...values] = rest;
  return first === 'for' && keyword === 'in' && /^[A-Za-z_]\w*$/.test(name) ? { name, values } : null;
}

/** How many loops (`for`, `while`, `until`), and how many blocks of any kind, a step opens, less those it closes. */
function blocksOf(words: readonly string[]): { loops: number; blocks: number } {
  const { keywords, rest } = split(words);
  const opened = keywords.filter((k) => k === 'while' || k === 'until').length + (rest[0] === 'for' ? 1 : 0);
  const closed = rest.length === 1 && rest[0] === 'done' ? 1 : 0;
  const ifs = keywords.filter((k) => k === 'if').length - (rest.length === 1 && rest[0] === 'fi' ? 1 : 0);
  return { loops: opened - closed, blocks: opened - closed + ifs };
}

/** The command a step runs: its keywords, a `for`, and the names it sets before the command, taken off. */
function commandOf(words: readonly string[]): string[] {
  const { rest } = split(words);
  if (forOf(rest) || (rest.length === 1 && CLOSERS.has(rest[0] ?? ''))) return [];
  let at = 0;
  while (isAssignment(rest[at] ?? '')) at += 1;
  return at === rest.length ? [] : rest.slice(at);
}

/** The names a step gives values to for the steps after it, as `NAME=value` or a bare name; and whether it runs `cd`. */
function setsOf(words: readonly string[]): { names: string[]; sets: string[]; cd: boolean } {
  const { rest } = split(words);
  const loop = forOf(rest);
  if (loop) return { names: [loop.name], sets: [], cd: false };
  const [program = '', ...args] = commandOf(words);
  const sets = !program && rest.length ? rest : SETTERS.has(program) ? args.filter(isAssignment) : [];
  const read = program === 'read' ? args.filter((w) => !isOption(w)) : [];
  return { names: [...sets.map((w) => w.slice(0, w.indexOf('='))), ...read], sets, cd: program === 'cd' };
}

/**
 * Sets what a step leaves for the steps after it: its variables' values, and where its `cd` leads. When it is not
 * sure to run, or to run in this shell, what it sets is not known. A `cd` to a folder not there fails, and leaves none.
 */
async function follow(words: readonly string[], sure: boolean, scope: Scope, ports: GatePorts): Promise<void> {
  const { names, sets, cd } = setsOf(words);
  const loop = forOf(split(words).rest);
  if (loop) {
    const each = loop.values.map((w) => expand(w, scope, ports.home));
    scope.vars.set(loop.name, each.every((e): e is string[] => e !== null) ? each.flat() : null);
    return;
  }
  const values = sets.map((w) => expand(w.slice(w.indexOf('=') + 1), scope, ports.home));
  for (const name of names) scope.vars.set(name, null);
  if (sure) sets.forEach((w, i) => scope.vars.set(w.slice(0, w.indexOf('=')), values[i] ?? null));
  if (!cd) return;
  const args = commandOf(words).slice(1);
  const to = args.length ? pathsOf(args.at(-1) ?? '', scope, ports.home) : ports.home ? [ports.home] : null;
  const [there] = to?.length === 1 ? to : [];
  scope.cwd = sure && there !== undefined && (await stateOf(there, ports)) !== MISSING ? there : null;
}

/** Whether one step may run, given what the steps before it set. */
async function judgeStep(step: ShellStep, scope: Scope, named: boolean, ports: GatePorts): Promise<boolean> {
  const command = commandOf(step.words);
  const [program = '', ...args] = command;
  if (program === 'cp' || program === 'mv') {
    const targets = await copyTargets(args, scope, ports);
    if (!targets || step.writes.length) return !named;
    const how = { body: null, literal: true, append: false, cat: false };
    for (const target of targets) if (!(await mayWrite(target, how, named, ports))) return false;
    return true;
  }
  const reads = !program || SETTERS.has(program) || program === 'read' || programOnlyReads(command);
  if (!reads) return !named;
  if (!step.writes.length) return true;
  if (program && !PRINTERS.has(program)) return !named;
  const cat = step.writes.length === 1 && command.join(' ') === 'cat';
  for (const write of step.writes) {
    const targets = pathsOf(write.to, scope, ports.home);
    if (!targets) {
      if (named) return false;
      continue;
    }
    const how = { body: step.body, literal: step.literal, append: write.append, cat };
    for (const target of targets) if (!(await mayWrite(target, how, named, ports))) return false;
  }
  return true;
}

/** What a loop's body sets, from the step that opens it to its `done`: forgotten before the body, as any pass may set it. */
function loopSets(steps: readonly ShellStep[], from: number): { names: string[]; cd: boolean } {
  const names: string[] = [];
  let cd = false;
  let depth = 0;
  for (let at = from; at < steps.length; at += 1) {
    const step = steps[at] as ShellStep;
    if (step.sub) continue;
    depth += blocksOf(step.words).loops;
    if (at > from) {
      const sets = setsOf(step.words);
      names.push(...sets.names);
      cd ||= sets.cd;
    }
    if (depth <= 0) break;
  }
  return { names, cd };
}

/**
 * Whether a Bash command may run. It may not when it could change an existing note's classification. Nor may it when
 * it names `classification` (`named`) and does what is not read here. The steps are followed in order. A step is sure
 * to run when it follows `;`, a new line or a step sent to the background, outside any block. One after `&&` runs only
 * when those before it did, so what it sets holds to the end of their chain. One after `||` may run whichever failed,
 * so what the chain set before it is forgotten. A step may run in a subshell, or not at all: in a pipeline, in the
 * background, or inside a block. What it sets is forgotten.
 */
export async function shellMayRun(command: string, named: boolean, ports: GatePorts): Promise<boolean> {
  const steps = shellSteps(command);
  if (!steps) return !named;
  const scope: Scope = { cwd: ports.cwd, vars: new Map(ports.home ? [['HOME', [ports.home]]] : []) };
  const chain = { names: new Set<string>(), cd: false, later: new Set<string>(), laterCd: false };
  const forget = (names: Iterable<string>, cd: boolean) => {
    for (const name of names) scope.vars.set(name, null);
    if (cd) scope.cwd = null;
  };
  let depth = 0;
  let subs: ShellStep[] = [];
  for (let at = 0; at < steps.length; at += 1) {
    const step = steps[at] as ShellStep;
    // a `$(…)` runs as its step is reached, so it is judged then
    if (step.sub) {
      subs.push(step);
      continue;
    }
    if (step.after === '||') forget(chain.names, chain.cd);
    if (!step.after || step.after === '&' || step.after === '|') {
      if (step.after) forget(chain.names, chain.cd);
      else forget(chain.later, chain.laterCd);
      for (const set of [chain.names, chain.later]) set.clear();
      chain.cd = chain.laterCd = false;
    }
    for (const one of [...subs, step]) if (!(await judgeStep(one, scope, named, ports))) return false;
    subs = [];
    const next = steps.slice(at + 1).find((s) => !s.sub);
    const piped = step.after === '|' || next?.after === '|' || next?.after === '&';
    const sets = setsOf(step.words);
    for (const name of sets.names) chain.names.add(name);
    chain.cd ||= sets.cd;
    if (step.after === '&&' || step.after === '||') {
      for (const name of sets.names) chain.later.add(name);
      chain.laterCd ||= sets.cd;
    }
    const opens = blocksOf(step.words);
    await follow(step.words, depth === 0 && !piped, scope, ports);
    if (opens.loops > 0) {
      const body = loopSets(steps, at);
      forget(body.names, body.cd);
    }
    depth = Math.max(0, depth + opens.blocks);
  }
  for (const one of subs) if (!(await judgeStep(one, scope, named, ports))) return false;
  return true;
}
