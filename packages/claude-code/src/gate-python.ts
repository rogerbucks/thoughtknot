// The files a Python script given as a heredoc would write, for gate-shell.ts (spec ES§26, risk TRUST-1). Python cannot
// be fully read here, so only a plain script is. It writes with `open(…)` or `.write_text(…)`. Its path is made of
// string literals, `Path`, `os.path.join`, `expanduser` and `/`, or is a name given such a path once. Anything that
// could write, run code or reach a file another way is not read, and the files it writes are not known. So is a script
// that defines functions or classes, imports a module not listed below, or renames one it imports.
//
// Roger ruled on 8 Nov 2026 that a new note made through a Python heredoc may carry a classification, as one made with
// `cat` may. gate-shell.ts allows the script only when every file it writes is not there yet.

/** The modules a plain script may import, none of which writes a file but through a handle `open` gave. */
const MODULES = new Set([
  'calendar',
  'datetime',
  'hashlib',
  'json',
  'os',
  'os.path',
  'pathlib',
  'random',
  're',
  'string',
  'sys',
  'textwrap',
  'time',
  'unicodedata',
  'uuid',
  'zoneinfo',
]);

/** What a plain script may take from `os`, `sys` and `pathlib`: none of these writes a file. */
const FROM = new Map([
  ['os', /^(path|makedirs|mkdir|sep|linesep|getcwd|listdir|scandir|walk)$/],
  ['sys', /^(stdout|stderr|exit|argv|version)$/],
  ['pathlib', /^(Path|PurePath|PurePosixPath)$/],
]);
const OS_USE = /\bos\b(?!\.(path|makedirs|mkdir|sep|linesep|getcwd|listdir|scandir|walk)\b)/;
const SYS_USE = /\bsys\b(?!\.(stdout|stderr|exit|argv|version)\b)/;
const PATHLIB_USE = /\bpathlib\b(?!\.(Path|PurePath|PurePosixPath)\b)/;

/** Words a plain script never holds: what runs code, reaches a name another way, or moves, links or cuts a file. */
const BARRED =
  /\b(exec|eval|compile|__import__|getattr|setattr|delattr|globals|locals|vars|breakpoint|def|class|lambda|global|nonlocal|async|await|write_bytes|rename|unlink|symlink_to|hardlink_to|link_to|chmod|lchmod|rmdir|truncate|chown)\b|__(?!name__)\w+__|\.open\b|;/;

/** A word that must be called where it stands, never passed or kept: kept, it could be called on another file. */
const CALLED_ONLY = /\b(open|write_text|replace)\b(?!\s*\()/;

/** Marks a string literal in the code: its number among `strings` between these two. */
const OPEN = '\u0002';
const CLOSE = '\u0003';
const LITERAL = new RegExp(`^${OPEN}(\\d+)${CLOSE}$`);

const PREFIX = /^(r|u|b|f|br|rb|fr|rf)$/i;

/**
 * The code with each string literal put as a mark, and comments taken out. And each literal's text: null when it
 * holds an escape or is an f-string. Null when a literal never closes, or an f-string's braces would call anything.
 */
function marked(source: string): { code: string; strings: (string | null)[] } | null {
  const strings: (string | null)[] = [];
  let code = '';
  let at = 0;
  while (at < source.length) {
    const ch = source[at] ?? '';
    if (ch === '#') {
      const end = source.indexOf('\n', at);
      at = end < 0 ? source.length : end;
      continue;
    }
    const word = /^[A-Za-z_]\w*/.exec(source.slice(at))?.[0];
    const quote = word ? source[at + word.length] : ch;
    if (word && !(PREFIX.test(word) && (quote === '"' || quote === "'"))) {
      code += word;
      at += word.length;
      continue;
    }
    if (quote !== '"' && quote !== "'") {
      code += ch;
      at += 1;
      continue;
    }
    const prefix = (word ?? '').toLowerCase();
    const start = at + prefix.length;
    const fence = source.startsWith(quote.repeat(3), start) ? quote.repeat(3) : quote;
    let end = start + fence.length;
    let escaped = false;
    for (; end < source.length; end += 1) {
      if (source.startsWith(fence, end)) break;
      if (source[end] === '\\') {
        escaped = true;
        end += 1;
      } else if (fence.length === 1 && source[end] === '\n') return null;
    }
    if (end >= source.length) return null;
    const text = source.slice(start + fence.length, end);
    if (prefix.includes('f') && /\{(?!\{)[^}]*(\(|\[|:=)/.test(text.replaceAll('{{', ''))) return null;
    strings.push(escaped || prefix.includes('f') ? null : text);
    code += `${OPEN}${strings.length - 1}${CLOSE}`;
    at = end + fence.length;
  }
  return { code, strings };
}

/** Where the bracket that closes the one at `from` is; -1 when none does. */
function closing(code: string, from: number): number {
  let depth = 0;
  for (let at = from; at < code.length; at += 1) {
    if ('([{'.includes(code[at] ?? '')) depth += 1;
    else if (')]}'.includes(code[at] ?? '')) {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  return -1;
}

/** `text` cut at each `by` outside brackets. */
function parts(text: string, by: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < text.length; at += 1) {
    const ch = text[at] ?? '';
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else if (ch === by && depth === 0) {
      out.push(text.slice(from, at));
      from = at + 1;
    }
  }
  out.push(text.slice(from));
  return out.map((p) => p.trim());
}

/** What is inside `name(…)` when the text is that one call and nothing more; null when it is not. */
function callOf(text: string, name: string): string | null {
  if (!text.startsWith(`${name}(`)) return null;
  const open = name.length;
  return closing(text, open) === text.length - 1 ? text.slice(open + 1, -1) : null;
}

type Known = { strings: readonly (string | null)[]; names: ReadonlyMap<string, string | null>; home?: string };

const joinPath = (a: string, b: string) => (b.startsWith('/') ? b : `${a.replace(/\/+$/, '')}/${b}`);

function expandUser(path: string | null, home?: string): string | null {
  if (path === null || !(path === '~' || path.startsWith('~/'))) return path;
  return home ? home + path.slice(1) : null;
}

/** The text of a path expression, or null when it is not one read here. */
function pathOf(expression: string, known: Known): string | null {
  const text = expression.trim();
  const literal = LITERAL.exec(text);
  if (literal) return known.strings[Number(literal[1])] ?? null;
  if (/^[A-Za-z_]\w*$/.test(text)) return known.names.get(text) ?? null;
  if (text.startsWith('(') && closing(text, 0) === text.length - 1) return pathOf(text.slice(1, -1), known);
  const joined = parts(text, '/');
  if (joined.length > 1) return joinAll(joined, known);
  if (text.endsWith('.expanduser()'))
    return expandUser(pathOf(text.slice(0, -'.expanduser()'.length), known), known.home);
  if (/^(pathlib\.)?Path\.home\(\)$/.test(text)) return known.home ?? null;
  const user = callOf(text, 'os.path.expanduser');
  if (user !== null) return expandUser(pathOf(user, known), known.home);
  for (const name of ['os.path.join', 'Path', 'pathlib.Path', 'str']) {
    const inner = callOf(text, name);
    if (inner === null) continue;
    if (!inner.trim()) return name === 'str' ? null : '.';
    return joinAll(parts(inner, ','), known);
  }
  return null;
}

function joinAll(pieces: readonly string[], known: Known): string | null {
  let out: string | null = null;
  for (const piece of pieces) {
    const one = pathOf(piece, known);
    if (one === null) return null;
    out = out === null ? one : joinPath(out, one);
  }
  return out;
}

/** The text left of a line's assignment `=`, outside brackets; null when the line assigns nothing. */
function assigned(line: string): string | null {
  let depth = 0;
  for (let at = 0; at < line.length; at += 1) {
    const ch = line[at] ?? '';
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else if (ch === '=' && depth === 0 && line[at + 1] !== '=' && !'=!<>'.includes(line[at - 1] ?? ''))
      return line.slice(0, at);
  }
  return null;
}

/** How many times the script gives `name` a value, in any way. */
function bindings(lines: readonly string[], name: string): number {
  const word = new RegExp(`\\b${name}\\b`);
  const other = new RegExp(`\\b(for|as|del|import|case)\\b.*\\b${name}\\b|\\b${name}\\s*:=`);
  return lines.filter((line) => word.test(assigned(line) ?? '') || other.test(line)).length;
}

/** Whether each import is of a listed module, takes only what it may from it, and renames nothing. */
function importsAllowed(lines: readonly string[]): boolean {
  for (const line of lines) {
    const from = /^\s*from\s+([\w.]+)\s+import\s+(.+)$/.exec(line);
    const plain = /^\s*import\s+(.+)$/.exec(line);
    if (from) {
      const [, module = '', names = ''] = from;
      const allowed = FROM.get(module);
      const taken = names.split(',').map((n) => n.trim());
      if (!MODULES.has(module) || taken.some((n) => !/^\w+$/.test(n) || (allowed && !allowed.test(n)))) return false;
    } else if (plain) {
      if (plain[1]?.split(',').some((m) => !MODULES.has(m.trim()))) return false;
    } else if (/\b(import|from)\b/.test(line)) return false;
  }
  return true;
}

/** Each argument of the call whose `(` is at `open`; null when the call never closes or unpacks its arguments. */
function argumentsAt(code: string, open: number): { given: string[]; named: Map<string, string> } | null {
  const end = closing(code, open);
  if (end < 0) return null;
  const all = parts(code.slice(open + 1, end), ',').filter(Boolean);
  if (all.some((a) => a.startsWith('*'))) return null;
  const named = new Map<string, string>();
  const given: string[] = [];
  for (const one of all) {
    const key = /^([A-Za-z_]\w*)\s*=(?!=)([\s\S]*)$/.exec(one);
    if (key) named.set(key[1] ?? '', (key[2] ?? '').trim());
    else given.push(one);
  }
  return { given, named };
}

/** The expression just before `.method(` at `dot`: a call, a bracketed group or a name. */
function receiverBefore(code: string, dot: number): string | null {
  const before = code.slice(0, dot);
  const found =
    /((?:(?:pathlib\.)?Path(?:\.home)?|os\.path\.(?:join|expanduser))?\((?:[^()]|\([^()]*\))*\)(?:\.expanduser\(\))?|[A-Za-z_]\w*)$/.exec(
      before,
    );
  if (!found) return null;
  const ahead = before[before.length - (found[1]?.length ?? 0) - 1] ?? '';
  return /[\w.)\]]/.test(ahead) ? null : (found[1] ?? null);
}

/**
 * Every file the script would write, as the text of its path: full, or from the folder Python runs in. Null when the
 * script is not plain enough for that to be known.
 */
export function pythonWrites(script: string, home?: string): string[] | null {
  const read = marked(script);
  if (!read) return null;
  const { code, strings } = read;
  const lines = code.split('\n');
  if (BARRED.test(code) || CALLED_ONLY.test(code) || !importsAllowed(lines)) return null;
  const body = lines.filter((line) => !/^\s*(import|from)\b/.test(line)).join('\n');
  if (OS_USE.test(body) || SYS_USE.test(body) || PATHLIB_USE.test(body)) return null;

  const names = new Map<string, string | null>();
  const known: Known = { strings, names, ...(home ? { home } : {}) };
  for (const line of lines) {
    const one = /^([A-Za-z_]\w*)\s*=(?!=)(.+)$/.exec(line);
    if (one && bindings(lines, one[1] ?? '') === 1) names.set(one[1] ?? '', pathOf(one[2] ?? '', known));
  }

  const writes: string[] = [];
  for (const call of code.matchAll(/(\.)?\b(open|write_text|replace)\s*\(/g)) {
    const open = (call.index ?? 0) + call[0].length - 1;
    const args = argumentsAt(code, open);
    if (!args) return null;
    const method = call[2];
    if (method === 'replace') {
      // a string's replace takes two texts; a path's takes one, and moves the file
      if (args.given.length < 2) return null;
      continue;
    }
    if (method === 'write_text') {
      const receiver = call[1] ? receiverBefore(code, call.index ?? 0) : null;
      const path = receiver === null ? null : pathOf(receiver, known);
      if (path === null) return null;
      writes.push(path);
      continue;
    }
    if (call[1] || args.named.has('opener')) return null;
    const mode = args.given[1] ?? args.named.get('mode');
    if (mode !== undefined) {
      const text = LITERAL.exec(mode.trim());
      const value = text ? strings[Number(text[1])] : null;
      if (value === null || value === undefined) return null;
      if (!/[wax+]/.test(value)) continue;
    } else continue;
    const path = pathOf(args.given[0] ?? args.named.get('file') ?? '', known);
    if (path === null) return null;
    writes.push(path);
  }
  return writes;
}

/** A Python that reads its script from the heredoc, and the options that change nothing it may write. */
const PYTHON = /^(\/[\w./-]*\/)?python(3(\.\d+)?)?$/;
const PYTHON_OPTIONS = new Set(['-', '-B', '-E', '-I', '-s', '-u']);

/** The files a step's Python writes when it runs its heredoc as its script; null when it is no such step, or not known. */
export function pythonHeredocWrites(command: readonly string[], body: string | null, home?: string): string[] | null {
  const [program = '', ...args] = command;
  if (!PYTHON.test(program) || body === null || !args.every((arg) => PYTHON_OPTIONS.has(arg))) return null;
  return pythonWrites(body, home);
}
