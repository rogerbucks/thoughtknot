// What sets Claude's gate is the user's alone (spec §26, risk TRUST-1). Two things in the vault set it: the matrix note
// that gives Claude's row, and each note's classification line in its front matter. A session that could change either
// could lower its own gate. So Claude's own writes to them are refused, as its writes to the data folder are.
//
// The matrix note is named in the settings by its path inside the vault. Any vault may hold it, so a write is refused
// when its real path ends with that path. For Bash, the note's file name alone counts.
//
// A classification is judged by what the call leaves. The note is read, the call's change is made to a copy, and the
// classification before and after is compared. A note not yet made has none to change, so a new note may be written.
// When the note cannot be read, a call is refused if any text it carries holds a classification line. Bash cannot be
// fully parsed, so shell-steps.ts reads a command into its steps. A heredoc that `cat` sends to a path known in full is
// judged as a Write is, whether the command names `classification` or not. Beyond that, a command that names it is
// refused unless every step only reads. What a command changes without naming it, such as cutting the front matter by
// line numbers, is not seen. GUIDE.md says so.
import { classificationOf, word } from '@thoughtknot/core';
import { forms, namesWord, onWindows, pathOf, slashed, slashedPorts } from './data-guard.ts';
import type { GuardPorts, ToolInput } from './data-guard.ts';
import { shellSteps } from './shell-steps.ts';
import type { ShellStep } from './shell-steps.ts';

// The refusals are said when made, in the language set then. Claude Code shows them in the chat, so the person may read them.

/** The refusal on the matrix note: it names no path or text of the call. */
export const matrixNoteRefusal = (): string => word('cc.refusal.matrix-note');

/** The refusal on a classification line: it names no level, path or text of the call. */
export const classificationRefusal = (): string => word('cc.refusal.classification');

/** The refusal when the guard could not tell where a path leads. */
export const gateCheckFailedRefusal = (): string => word('cc.refusal.gate-check-failed');

/** What this guard asks of the host: the matrix note's path in the vault (none when none is set), and a read. */
export type GatePorts = Omit<GuardPorts, 'data'> & {
  matrixNote: string | null;
  /** A file's text; rejects when it cannot be read. With none, any classification line in a call refuses it. */
  read?: (path: string) => Promise<string>;
};

/** A line that sets a classification, top-level or not: what the gate's own reader looks for. */
const CLASSIFICATION_LINE = /^\s*-?\s*["']?classification["']?\s*:/im;

/**
 * The programs that only read, search or print, with the arguments that would make each do more. No other program is
 * trusted. `cd` and `mkdir` touch no note's text, so they may stand beside a heredoc.
 */
const READERS = new Map<string, RegExp | null>([
  ['cat', null],
  ['cd', null],
  ['cut', null],
  ['echo', null],
  ['find', /^-(exec|ok|delete|fprint|fls)/],
  ['grep', null],
  ['head', null],
  ['less', /^(-\w*o|--log)/i],
  ['ls', null],
  ['mkdir', null],
  ['printf', null],
  ['pwd', null],
  ['rg', /^--(pre|hostname-bin)/],
  ['sort', /^(-\w*o|--o|--c)/],
  ['tail', null],
  ['tr', null],
  ['true', null],
  ['wc', null],
]);

/** A character that makes the shell choose the path, so what it would write to is not known here. */
const PATH_NOT_KNOWN = /[*?[\]{}$`~^#<>|]/;

/** One change of an edit: the text replaced, its replacement, and whether every copy is replaced. */
type Change = { old_string?: unknown; new_string?: unknown; replace_all?: unknown };

/** The text after `changes`, made one by one to `text`; a change whose text is not found leaves it, as the tool fails. */
function afterChanges(text: string, changes: readonly Change[]): string {
  let out = text;
  for (const c of changes) {
    if (typeof c.old_string !== 'string' || typeof c.new_string !== 'string' || !c.old_string) continue;
    out =
      c.replace_all === true
        ? out.split(c.old_string).join(c.new_string)
        : out.replace(c.old_string, () => String(c.new_string));
  }
  return out;
}

/** The note's text after the call, or null when the call's tool is not one whose result can be worked out. */
function textAfter(tool: string, input: Record<string, unknown>, before: string): string | null {
  if (tool === 'Write' && typeof input.content === 'string') return input.content;
  if (tool === 'Edit') return afterChanges(before, [input]);
  if (tool === 'MultiEdit' && Array.isArray(input.edits)) return afterChanges(before, input.edits as Change[]);
  return null;
}

/** Every text a call carries, however deep: what is judged when the note cannot be read. */
function textsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(textsOf);
  if (value && typeof value === 'object') return Object.values(value).flatMap(textsOf);
  return [];
}

/** The matrix note's path in the vault, as parts joined by `/`, without a leading `./` or `/`. */
const vaultPath = (note: string) => note.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');

const sameClassification = (before: string, after: string) =>
  JSON.stringify(classificationOf(before)) === JSON.stringify(classificationOf(after));

async function guardClassification(tool: string, path: string, input: Record<string, unknown>, ports: GatePorts) {
  let before: string | null = null;
  try {
    before = ports.read ? await ports.read(path) : null;
  } catch {
    // a note not yet made has no classification to change
    if (tool === 'Write') return null;
  }
  const after = before === null ? null : textAfter(tool, input, before);
  if (before !== null && after !== null) return sameClassification(before, after) ? null : classificationRefusal();
  const carried = textsOf({ ...input, file_path: '', notebook_path: '', path: '' });
  return carried.some((t) => CLASSIFICATION_LINE.test(t)) ? classificationRefusal() : null;
}

/** Whether a step runs a trusted program, with no argument that would make it write and no file to write to. */
function onlyReads(step: ShellStep): boolean {
  const [program = '', ...args] = step.words;
  const more = READERS.get(program);
  if (more === undefined || step.writes.length) return false;
  return !more || !args.some((arg) => more.test(arg));
}

/** Where a step's heredoc goes, and whether it appends; null unless it is `cat` to one path known in full. */
function heredocTarget(step: ShellStep, home?: string): { path: string; append: boolean } | null {
  const [write, ...others] = step.writes;
  if (!write || others.length || step.body === null || step.words.join(' ') !== 'cat') return null;
  const path = home ? write.to.replace(/^~(?=\/)/, home) : write.to;
  return path.startsWith('/') && !PATH_NOT_KNOWN.test(path) ? { path, append: write.append } : null;
}

/** Whether a heredoc would change the classification of the note it writes; a note not yet made has none to change. */
async function heredocChanges(
  body: string,
  target: { path: string; append: boolean },
  read: (path: string) => Promise<string>,
): Promise<boolean> {
  let before: string;
  try {
    before = await read(target.path);
  } catch {
    return false;
  }
  return !sameClassification(before, target.append ? before + body : body);
}

async function guardCommand(command: string, named: boolean, ports: GatePorts) {
  const steps = shellSteps(command);
  if (!steps) return named ? classificationRefusal() : null;
  for (const step of steps) {
    const target = ports.read ? heredocTarget(step, ports.home) : null;
    if (target && ports.read && (await heredocChanges(step.body ?? '', target, ports.read)))
      return classificationRefusal();
    if (named && !target && !onlyReads(step)) return classificationRefusal();
  }
  return null;
}

/**
 * The refusal for a call that would change what sets Claude's gate: the matrix note, or a note's classification line.
 * Null when the call may go on. Reads are not judged.
 */
export async function guardGateFiles(tool: string, input: ToolInput, ports: GatePorts): Promise<string | null> {
  const note = ports.matrixNote ? vaultPath(ports.matrixNote) : '';
  if (tool === 'Bash') {
    const given = typeof input.command === 'string' ? input.command : '';
    const command = given.replace(/['"`\\]/g, '');
    if (note && namesWord(command, note.slice(note.lastIndexOf('/') + 1))) return matrixNoteRefusal();
    return guardCommand(given, namesWord(command, 'classification'), ports);
  }
  const path = pathOf(tool, input);
  if (path === null) return null;
  try {
    if (note) {
      const tail = `/${note.toLowerCase()}`;
      const given = { ...ports, data: '' };
      // on Windows the path and the folders are read with slashes, as the data folder's guard reads them
      const found = onWindows(given) ? await forms(slashed(path), slashedPorts(given)) : await forms(path, given);
      if (found.some((f) => f.toLowerCase().endsWith(tail))) return matrixNoteRefusal();
    }
  } catch {
    return gateCheckFailedRefusal();
  }
  return guardClassification(tool, path, input, ports);
}
