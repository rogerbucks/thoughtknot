// What sets Claude's gate is the user's alone (spec §26, risk TRUST-1). Two things in the vault set it: the matrix note
// that gives Claude's row, and each note's classification line in its front matter. A session that could change either
// could lower its own gate. So Claude's own writes to them are refused, as its writes to the data folder are.
//
// The matrix note is named in the settings by its path inside the vault. Any vault may hold it, so a write is refused
// when its real path ends with that path. For Bash, the note's file name alone counts.
//
// A classification is judged by what the call leaves. The note is read, the call's change is made to a copy, and the
// classification before and after is compared. A note not yet made has none to change, so a new note may be written.
// A Write over a note that exists is a change, never a new note, so a class cannot be reset by writing the note again.
// A change may raise the class, never lower it. Both sides must be one class among those set (lowest first, read
// through the settings' table of class names). The class after must rank above the one before. It must also be one
// the user lists in settings.json under `classificationRaises`: the classes Claude may raise a note to. The list is
// the user's alone, as the data folder is, and none set means no raise. So a class the user keeps for themselves (a
// credential, say) is left off it. Anything else is refused: a move down, a class not set, none, or one that
// cannot be read. When the note cannot be read, a call is refused if any text it carries holds a classification line.
// Bash is judged by gate-shell.ts, which still refuses any change.
import { classificationOf, matchClass, word } from '@thoughtknot/core';
import { forms, namesWord, onWindows, pathOf, sessionFolderGoneRefusal, slashed, slashedPorts } from './data-guard.ts';
import type { GuardPorts, ToolInput } from './data-guard.ts';
import { shellMayRun } from './gate-shell.ts';

// The refusals are said when made, in the language set then. Claude Code shows them in the chat, so the person may read them.

/** The refusal on the matrix note: it names no path or text of the call. */
export const matrixNoteRefusal = (): string => word('cc.refusal.matrix-note');

/** The refusal on a classification line: it names no level, path or text of the call. */
export const classificationRefusal = (): string => word('cc.refusal.classification');

/** The refusal on a raise to a class the user has not listed: it names no level, path or text of the call. */
export const classificationRaiseRefusal = (): string =>
  word('cc.refusal.classification-raise', { settings: 'settings.json', key: RAISES_KEY });

/** The key in settings.json that lists the classes Claude may raise a note to. */
export const RAISES_KEY = 'classificationRaises';

/** The classes Claude may raise a note to, from the saved settings: only a list of names counts, else none. */
export function raisesFrom(saved: unknown): string[] {
  const given = saved && typeof saved === 'object' ? (saved as Record<string, unknown>)[RAISES_KEY] : undefined;
  return Array.isArray(given) ? given.filter((c): c is string => typeof c === 'string') : [];
}

/** The refusal when the guard could not tell where a path leads. */
export const gateCheckFailedRefusal = (): string => word('cc.refusal.gate-check-failed');

/** What this guard asks of the host: the matrix note's path in the vault (none when none is set), and a read. */
export type GatePorts = Omit<GuardPorts, 'data'> & {
  matrixNote: string | null;
  /** A file's text; rejects when it cannot be read. With none, any classification line in a call refuses it. */
  read?: (path: string) => Promise<string>;
  /** The classifications set, lowest first. With none, every change of a classification is refused. */
  classifications?: readonly string[];
  /** The settings' table from a note's class names to the classifications set (aiClassMap). */
  classMap?: Record<string, string>;
  /** The classes Claude may raise a note to (settings.json `classificationRaises`). With none, no raise is allowed. */
  raises?: readonly string[];
  /** How many hard links a file has. With none, Bash may not rewrite an existing code file that names it (ES§26). */
  links?: (path: string) => Promise<number>;
};

/** A line that sets a classification, top-level or not: what the gate's own reader looks for. */
const CLASSIFICATION_LINE = /^\s*-?\s*["']?classification["']?\s*:/im;

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

/** The rank of a note's one class among those set, lowest first; null when it has none, several, or one not set. */
function rankOf(text: string, ports: GatePorts): number | null {
  const c = classificationOf(text);
  const levels = [...(ports.classifications ?? [])];
  if (c.kind !== 'given') return null;
  const level = matchClass(c.level, levels, ports.classMap ?? {});
  return level === null ? null : levels.indexOf(level);
}

/** The refusal for a change from `before` to `after`, or null when it leaves the class or raises it to one listed. */
function judgeChange(before: string, after: string, ports: GatePorts): string | null {
  if (sameClassification(before, after)) return null;
  const from = rankOf(before, ports);
  const to = rankOf(after, ports);
  if (from === null || to === null || to <= from) return classificationRefusal();
  const levels = [...(ports.classifications ?? [])];
  const listed = (ports.raises ?? []).some((r) => matchClass(r, levels, ports.classMap ?? {}) === levels[to]);
  return listed ? null : classificationRaiseRefusal();
}

async function guardClassification(tool: string, path: string, input: Record<string, unknown>, ports: GatePorts) {
  let before: string | null = null;
  try {
    before = ports.read ? await ports.read(path) : null;
  } catch {
    // a note not yet made has no classification to change
    if (tool === 'Write') return null;
  }
  const after = before === null ? null : textAfter(tool, input, before);
  if (before !== null && after !== null) return judgeChange(before, after, ports);
  const carried = textsOf({ ...input, file_path: '', notebook_path: '', path: '' });
  return carried.some((t) => CLASSIFICATION_LINE.test(t)) ? classificationRefusal() : null;
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
    return (await shellMayRun(given, namesWord(command, 'classification'), ports)) ? null : classificationRefusal();
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
    return ports.cwdGone ? sessionFolderGoneRefusal() : gateCheckFailedRefusal();
  }
  return guardClassification(tool, path, input, ports);
}
