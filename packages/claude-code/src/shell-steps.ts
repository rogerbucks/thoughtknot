// A Bash command read only far enough for gate-guard.ts to tell what each of its steps may write. This is not a shell.
// It knows quotes, the separators, redirections, heredocs and `$(…)`. The steps a `$(…)` runs are read as steps of
// their own, marked as run in a subshell. Where its output goes in a word stands UNKNOWN. A `$` in single quotes,
// or escaped, stands LITERAL_DOLLAR, so the guard expands only the variables the shell would. Some things could run
// other code, or are not known here: backticks, `$((…))`, brackets, a comment or an unclosed quote. Any of them makes
// the whole command unread: null, so the guard can refuse rather than guess. Zsh is held to this too, since its glob
// qualifiers run code from inside brackets.

/** Where a substitution's output goes in a word: it is not known here. */
export const UNKNOWN = '\u0000';

/** A `$` the shell takes as it is, not as the start of a variable. */
export const LITERAL_DOLLAR = '\u0001';

/** A file a step sends its output to. */
export type ShellWrite = { to: string; append: boolean };

/** What joins a step to the one before it, when it is not `;` or a new line. */
export type Joint = '&&' | '||' | '|' | '&';

/**
 * One simple command: its words, the files it writes, and the text of its heredoc (null when it has none). `literal` is
 * false when the shell would expand a variable in that text. `sub` marks a step run inside a `$(…)`, in a subshell.
 * `after` is what joins it to the step before, when that is not `;` or a new line.
 */
export type ShellStep = {
  words: string[];
  writes: ShellWrite[];
  body: string | null;
  literal: boolean;
  sub?: true;
  after?: Joint;
};

/** The heredoc waiting for the line after its command. */
type Heredoc = { end: string; quoted: boolean; tabs: boolean; step: ShellStep };

/** What the next word is, when it is not a word of the command. */
type Next = 'write' | 'append' | 'read' | 'heredoc' | 'heredoc-tabs' | null;

/** How far the reading has got. Each reader below moves `at` on, and answers false when the command is unread. */
type Reading = {
  command: string;
  at: number;
  steps: ShellStep[];
  step: ShellStep;
  word: string | null;
  quoted: boolean;
  next: Next;
  waiting: Heredoc | null;
};

const newStep = (): ShellStep => ({ words: [], writes: [], body: null, literal: true });

/** The heredoc's text, and where the line after its last ends; null when it never closes or its text would run code. */
function readHeredoc(
  command: string,
  from: number,
  doc: Heredoc,
): { body: string; literal: boolean; next: number } | null {
  const lines: string[] = [];
  let at = from;
  while (at <= command.length) {
    const stop = command.indexOf('\n', at);
    const end = stop < 0 ? command.length : stop;
    const line = doc.tabs ? command.slice(at, end).replace(/^\t+/, '') : command.slice(at, end);
    if (line === doc.end) {
      const body = lines.length ? `${lines.join('\n')}\n` : '';
      if (doc.quoted) return { body, literal: true, next: end + 1 };
      return /`|\\|\$[({]/.test(body) ? null : { body, literal: !body.includes('$'), next: end + 1 };
    }
    lines.push(line);
    at = end + 1;
  }
  return null;
}

/** Where the `)` that closes a `$(` opened just before `from` is; null when none does. */
function substitutionEnd(command: string, from: number): number | null {
  let depth = 1;
  for (let at = from; at < command.length; at += 1) {
    const c = command.charAt(at);
    if (c === '\\') at += 1;
    else if (c === "'" || c === '"') {
      const end = c === "'" ? command.indexOf("'", at + 1) : quoteEnd(command, at + 1);
      if (end < 0) return null;
      at = end;
    } else if (c === '(') depth += 1;
    else if (c === ')' && (depth -= 1) === 0) return at;
  }
  return null;
}

/** Where the `"` that closes double quotes opened just before `from` is; -1 when none does. */
function quoteEnd(command: string, from: number): number {
  for (let at = from; at < command.length; at += 1) {
    const c = command.charAt(at);
    if (c === '\\') at += 1;
    else if (c === '"') return at;
  }
  return -1;
}

/**
 * Reads the `$(…)` at `at` into steps of their own, run in a subshell, and puts UNKNOWN in the word where its output
 * goes. False when its text is not read, or it is `$((…))`.
 */
function readSubstitution(r: Reading): boolean {
  if (r.command.charAt(r.at + 2) === '(') return false;
  const end = substitutionEnd(r.command, r.at + 2);
  const inner = end === null ? null : shellSteps(r.command.slice(r.at + 2, end));
  if (end === null || !inner) return false;
  for (const step of inner) r.steps.push({ ...step, sub: true });
  r.word = (r.word ?? '') + UNKNOWN;
  r.at = end + 1;
  return true;
}

/** Reads the text inside the double quotes at `at`; false when they never close or hold backticks. */
function readQuoted(r: Reading): boolean {
  r.at += 1;
  r.word = r.word ?? '';
  r.quoted = true;
  while (r.at < r.command.length) {
    const c = r.command.charAt(r.at);
    if (c === '"') {
      r.at += 1;
      return true;
    }
    if (c === '`') return false;
    if (c === '$' && r.command.charAt(r.at + 1) === '(') {
      if (!readSubstitution(r)) return false;
      continue;
    }
    if (c === '\\') {
      const then = r.command.charAt(r.at + 1);
      r.word += then === '$' ? LITERAL_DOLLAR : then;
      r.at += 2;
      continue;
    }
    r.word += c;
    r.at += 1;
  }
  return false;
}

/** Files the word as what `next` says it is. False when that is a second heredoc. */
function endWord(r: Reading): boolean {
  if (r.word === null) return true;
  if (r.next === 'write' || r.next === 'append') {
    if (r.word !== '/dev/null') r.step.writes.push({ to: r.word, append: r.next === 'append' });
  } else if (r.next === 'heredoc' || r.next === 'heredoc-tabs') {
    if (r.waiting) return false;
    r.waiting = { end: r.word, quoted: r.quoted, tabs: r.next === 'heredoc-tabs', step: r.step };
  } else if (r.next === null) {
    r.step.words.push(r.word);
  }
  r.word = null;
  r.quoted = false;
  r.next = null;
  return true;
}

/** Ends the step. False when a redirection has no word to go to. */
function endStep(r: Reading, joint?: Joint): boolean {
  if (!endWord(r) || r.next !== null) return false;
  if (r.step.words.length || r.step.writes.length) {
    r.steps.push(r.step);
    r.step = newStep();
  }
  // a new line after `&&`, say, keeps it: the next step is still joined by it
  if (joint) r.step.after = joint;
  return true;
}

/** Drops a word of digits before a redirection: it is only a file descriptor. */
function dropDescriptor(r: Reading): void {
  if (r.word !== null && !r.quoted && /^\d+$/.test(r.word)) r.word = null;
}

/** Starts a redirection of `length` characters. */
function redirect(r: Reading, kind: Next, length: number): boolean {
  dropDescriptor(r);
  if (!endWord(r) || r.next !== null) return false;
  r.next = kind;
  r.at += length;
  return true;
}

function readSingleQuoted(r: Reading): boolean {
  const end = r.command.indexOf("'", r.at + 1);
  if (end < 0) return false;
  r.word = (r.word ?? '') + r.command.slice(r.at + 1, end).replaceAll('$', LITERAL_DOLLAR);
  r.quoted = true;
  r.at = end + 1;
  return true;
}

function readEscape(r: Reading): boolean {
  const then = r.command.charAt(r.at + 1);
  if (then !== '\n') r.word = (r.word ?? '') + (then === '$' ? LITERAL_DOLLAR : then);
  r.quoted = true;
  r.at += 2;
  return true;
}

/** Ends the line; the heredoc its step opened, if any, starts on the next. */
function readNewline(r: Reading): boolean {
  if (!endStep(r)) return false;
  r.at += 1;
  if (!r.waiting) return true;
  const read = readHeredoc(r.command, r.at, r.waiting);
  if (!read) return false;
  r.waiting.step.body = read.body;
  r.waiting.step.literal = read.literal;
  r.waiting = null;
  r.at = read.next;
  return true;
}

function readGreater(r: Reading): boolean {
  const then = r.command.charAt(r.at + 1);
  const fd = /^>&\d+(?=[\s;&|]|$)/.exec(r.command.slice(r.at));
  if (fd) {
    dropDescriptor(r);
    r.at += fd[0].length;
    return true;
  }
  if (then === '&') return false;
  return redirect(r, then === '>' ? 'append' : 'write', then === '>' || then === '|' ? 2 : 1);
}

function readLess(r: Reading): boolean {
  const then = r.command.charAt(r.at + 1);
  const after = r.command.charAt(r.at + 2);
  if (then === '&' || then === '>') return false;
  if (then !== '<') return redirect(r, 'read', 1);
  if (after === '<') return redirect(r, 'read', 3);
  return after === '-' ? redirect(r, 'heredoc-tabs', 3) : redirect(r, 'heredoc', 2);
}

/** Reads what starts at `at`. */
function readNext(r: Reading): boolean {
  const c = r.command.charAt(r.at);
  if (c === "'") return readSingleQuoted(r);
  if (c === '"') return readQuoted(r);
  if (c === '$' && r.command.charAt(r.at + 1) === '(') return readSubstitution(r);
  if (c === '\\') return readEscape(r);
  if (c === '`' || c === '(' || c === ')' || (c === '#' && r.word === null)) return false;
  if (c === '\n') return readNewline(r);
  if (c === '>') return readGreater(r);
  if (c === '<') return readLess(r);
  if (c === '&' && r.command.charAt(r.at + 1) === '>') {
    const append = r.command.charAt(r.at + 2) === '>';
    return redirect(r, append ? 'append' : 'write', append ? 3 : 2);
  }
  if (c === ' ' || c === '\t') {
    r.at += 1;
    return endWord(r);
  }
  if (c === ';' || c === '|' || c === '&') {
    const then = r.command.charAt(r.at + 1);
    const double = (c !== ';' && then === c) || (c === '|' && then === '&');
    r.at += double ? 2 : 1;
    if (c === ';') return endStep(r);
    return endStep(r, double && c === '&' ? '&&' : double && then === '|' ? '||' : c === '|' ? '|' : '&');
  }
  r.word = (r.word ?? '') + c;
  r.at += 1;
  return true;
}

/** Each step of `command`, in order; null when the command holds anything this does not read. */
export function shellSteps(command: string): ShellStep[] | null {
  const r: Reading = {
    command,
    at: 0,
    steps: [],
    step: newStep(),
    word: null,
    quoted: false,
    next: null,
    waiting: null,
  };
  while (r.at < command.length) if (!readNext(r)) return null;
  return endStep(r) && !r.waiting ? r.steps : null;
}
