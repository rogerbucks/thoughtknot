// A Bash command read only far enough for gate-guard.ts to tell what each of its steps may write. This is not a shell.
// It knows quotes, the separators, redirections and heredocs. Some things could run other code, or are not known here:
// a substitution, brackets, a comment or an unclosed quote. Any of them makes the whole command unread: null, so the
// guard can refuse rather than guess. Zsh is held to this too, since its glob qualifiers run code from inside brackets.

/** A file a step sends its output to. */
export type ShellWrite = { to: string; append: boolean };

/** One simple command: its words, the files it writes, and the text of its heredoc (null when it has none). */
export type ShellStep = { words: string[]; writes: ShellWrite[]; body: string | null };

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

const newStep = (): ShellStep => ({ words: [], writes: [], body: null });

/** The heredoc's text, and where the line after its last ends; null when it never closes or its text would run code. */
function readHeredoc(command: string, from: number, doc: Heredoc): { body: string; next: number } | null {
  const lines: string[] = [];
  let at = from;
  while (at <= command.length) {
    const stop = command.indexOf('\n', at);
    const end = stop < 0 ? command.length : stop;
    const line = doc.tabs ? command.slice(at, end).replace(/^\t+/, '') : command.slice(at, end);
    if (line === doc.end) {
      const body = lines.length ? `${lines.join('\n')}\n` : '';
      return !doc.quoted && /[$`\\]/.test(body) ? null : { body, next: end + 1 };
    }
    lines.push(line);
    at = end + 1;
  }
  return null;
}

/** The text inside double quotes from `from`, and where it ends; null when it never closes or holds a substitution. */
function readDoubleQuoted(command: string, from: number): { text: string; next: number } | null {
  let text = '';
  for (let at = from; at < command.length; at += 1) {
    const c = command.charAt(at);
    if (c === '"') return { text, next: at + 1 };
    if (c === '`' || (c === '$' && command.charAt(at + 1) === '(')) return null;
    if (c === '\\') at += 1;
    text += command.charAt(at);
  }
  return null;
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
function endStep(r: Reading): boolean {
  if (!endWord(r) || r.next !== null) return false;
  if (r.step.words.length || r.step.writes.length) r.steps.push(r.step);
  r.step = newStep();
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
  r.word = (r.word ?? '') + r.command.slice(r.at + 1, end);
  r.quoted = true;
  r.at = end + 1;
  return true;
}

function readQuoted(r: Reading): boolean {
  const inner = readDoubleQuoted(r.command, r.at + 1);
  if (!inner) return false;
  r.word = (r.word ?? '') + inner.text;
  r.quoted = true;
  r.at = inner.next;
  return true;
}

function readEscape(r: Reading): boolean {
  const then = r.command.charAt(r.at + 1);
  if (then !== '\n') r.word = (r.word ?? '') + then;
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
  if (c === '\\') return readEscape(r);
  if (c === '`' || c === '(' || c === ')' || (c === '#' && r.word === null)) return false;
  if (c === '\n') return readNewline(r);
  if (c === '>') return readGreater(r);
  if (c === '<') return readLess(r);
  if (c === '&' && r.command.charAt(r.at + 1) === '>') {
    const append = r.command.charAt(r.at + 2) === '>';
    return redirect(r, append ? 'append' : 'write', append ? 3 : 2);
  }
  if (c === ' ' || c === '\t' || c === ';' || c === '|' || c === '&') {
    r.at += 1;
    return c === ' ' || c === '\t' ? endWord(r) : endStep(r);
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
