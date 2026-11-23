// Which existing files gate-shell.ts lets a Bash command rewrite though it names `classification` (spec ES§26, risk
// TRUST-1). Roger ruled on 23 Nov 2026 that a code or data file, such as `.ts`, `.py` or `.json`, carries no
// classification. So a known write to one may go on. Only the kinds listed, in lower case, are let off. Any other kind
// is judged as a note, one not known included. So are the settings files of the gate and of Claude Code. A link to
// another file is judged as a note too, as is a file whose front matter holds a classification.
import { classificationOf } from '@thoughtknot/core';

/** The kinds of file that are code or data, never a note. */
const CODE_FILE = /\.(ts|tsx|js|mjs|cjs|py|json|css|html|sh|rs)$/;

/** The settings files that set a gate, the mod's or Claude Code's, judged as notes whatever their kind. */
const SETTINGS_FILE = /^(settings|data)\.json$|settings\.local\.json$/i;

/** Whether a path names a code file by its own name: a kind listed above, and no settings file. */
function codeName(path: string): boolean {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  return CODE_FILE.test(name) && !SETTINGS_FILE.test(name);
}

/** What codeFile asks of the host: a file's real path, links settled, and how many hard links it has. */
export type CodePorts = {
  realPath: (path: string) => Promise<string>;
  links?: (path: string) => Promise<number>;
};

/**
 * Whether a file that exists is a code file a known write may change. `text` is what it holds now, null when it could
 * not be read. Its path and its real path must both name one, and it must have no other hard link. So a link to a
 * note, made either way, is still judged as a note. With no count of its links, none is let off. Its text must carry
 * no front matter with a classification, so a note given a code file's name is judged as a note too.
 */
export async function codeFile(path: string, text: string | null, ports: CodePorts): Promise<boolean> {
  if (text === null || !ports.links || classificationOf(text).kind !== 'none') return false;
  try {
    return codeName(path) && codeName(await ports.realPath(path)) && (await ports.links(path)) === 1;
  } catch {
    return false;
  }
}
