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

/** Each step of `command`, in order; null when the command holds anything this does not read. */
export function shellSteps(command: string): ShellStep[] | null {
  const steps: ShellStep[] = [];
  let step = newStep();
  let word: string | null = null;
  let quoted = false;
  let next: Next = null;
  const waiting: Heredoc[] = [];
  let at = 0;

  /** Files the word as what `next` says it is. False when that is a second heredoc. */
  const endWord = (): boolean => {
    if (word === null) return true;
    if (next === 'write' || next === 'append') {
      if (word !== '/dev/null') step.writes.push({ to: word, append: next === 'append' });
    } else if (next === 'heredoc' || next === 'heredoc-tabs') {
      if (waiting.length) return false;
      waiting.push({ end: word, quoted, tabs: next === 'heredoc-tabs', step });
    } else if (next === null) {
      step.words.push(word);
    }
    word = null;
    quoted = false;
    next = null;
    return true;
  };

  /** Ends the step. False when a redirection has no word to go to. */
  const endStep = (): boolean => {
    if (!endWord() || next !== null) return false;
    if (step.words.length || step.writes.length) steps.push(step);
    step = newStep();
    return true;
  };

  /** Starts a redirection; a word of digits before it is only a file descriptor. */
  const redirect = (kind: Next): boolean => {
    if (word !== null && !quoted && /^\d+$/.test(word)) word = null;
    if (!endWord() || next !== null) return false;
    next = kind;
    return true;
  };

  while (at < command.length) {
    const c = command.charAt(at);
    const then = command.charAt(at + 1);
    if (c === "'") {
      const end = command.indexOf("'", at + 1);
      if (end < 0) return null;
      word = (word ?? '') + command.slice(at + 1, end);
      quoted = true;
      at = end + 1;
    } else if (c === '"') {
      const inner = readDoubleQuoted(command, at + 1);
      if (!inner) return null;
      word = (word ?? '') + inner.text;
      quoted = true;
      at = inner.next;
    } else if (c === '\\') {
      if (then !== '\n') word = (word ?? '') + then;
      quoted = true;
      at += 2;
    } else if (c === '`' || c === '(' || c === ')' || (c === '#' && word === null)) {
      return null;
    } else if (c === '\n') {
      if (!endStep()) return null;
      at += 1;
      const doc = waiting.pop();
      if (doc) {
        const read = readHeredoc(command, at, doc);
        if (!read) return null;
        doc.step.body = read.body;
        at = read.next;
      }
    } else if (c === ' ' || c === '\t') {
      if (!endWord()) return null;
      at += 1;
    } else if (c === '&' && then === '>') {
      if (!redirect(command.charAt(at + 2) === '>' ? 'append' : 'write')) return null;
      at += command.charAt(at + 2) === '>' ? 3 : 2;
    } else if (c === ';' || c === '|' || c === '&') {
      if (!endStep()) return null;
      at += 1;
    } else if (c === '>') {
      const fd = /^>&\d+(?=[\s;&|]|$)/.exec(command.slice(at));
      if (fd) {
        if (word !== null && !quoted && /^\d+$/.test(word)) word = null;
        at += fd[0].length;
      } else if (then === '&') {
        return null;
      } else {
        if (!redirect(then === '>' ? 'append' : 'write')) return null;
        at += then === '>' || then === '|' ? 2 : 1;
      }
    } else if (c === '<') {
      if (then === '&' || then === '>') return null;
      const here = then === '<' && command.charAt(at + 2) !== '<';
      const tabs = here && command.charAt(at + 2) === '-';
      const string = then === '<' && !here;
      if (!redirect(tabs ? 'heredoc-tabs' : here ? 'heredoc' : 'read')) return null;
      at += tabs || string ? 3 : here ? 2 : 1;
    } else {
      word = (word ?? '') + c;
      at += 1;
    }
  }
  return endStep() && !waiting.length ? steps : null;
}
