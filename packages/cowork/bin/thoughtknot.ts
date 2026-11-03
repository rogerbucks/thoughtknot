// The Copilot Cowork skill's companion script (editor spec §46, cowork_skill). Cowork runs it as
// `node scripts/thoughtknot.mjs <command> <note> [options]` and reads one JSON object from standard output.
// - read, check: the graph blocks of a note, or its problems, once the gate lets the note in.
// - draw: an SVG and a PNG beside the note, and a card.
// - propose: what an edit would change. Nothing is written.
// - apply: writes the edit, only with the approval that propose gave for this edit of this note as it is now.
// It reads the files it is named and writes beside the note. It makes no network call (cowork_no_server).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { word } from '@thoughtknot/core';
import { apply, clear, draw, propose, read } from '../src/cowork.ts';
import { svgToPng } from './raster.ts';
import type { EditAsk } from '../src/cowork.ts';

const out = (answer: unknown, code = 0): never => {
  process.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
  return process.exit(code);
};

const [command, notePath, ...rest] = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = rest.indexOf(`--${name}`);
  return at < 0 ? undefined : rest[at + 1];
};

if (!command || !notePath || !['read', 'check', 'draw', 'propose', 'apply'].includes(command))
  out({ error: word('cowork.usage') }, 2);

let note: string;
try {
  note = readFileSync(notePath as string, 'utf8');
} catch {
  out({ error: word('cowork.note-unreadable') }, 2);
  note = '';
}

// the person's own library settings, when they keep them: their classifications and the models' ceilings
let saved: unknown = {};
const settings = option('settings');
if (settings) {
  try {
    saved = JSON.parse(readFileSync(settings, 'utf8'));
  } catch {
    out({ error: word('cowork.note-unreadable') }, 2);
  }
}

const gate = clear(note, saved, option('confirm') ?? null);
if (!gate.open) out({ read: false, ...gate });
const level = gate.open ? gate.level : null;

if (command === 'read') out({ read: true, level, ...read(note) });
if (command === 'check') {
  const { problems, why } = read(note);
  out({ read: true, level, problems, ...(why ? { why } : {}) });
}
if (command === 'draw') {
  const made = await draw(note, level, svgToPng, option('graph'));
  const stem = join(dirname(notePath as string), basename(notePath as string, extname(notePath as string)));
  const files: string[] = [];
  const kept: string[] = [];
  // a file already there that differs is the person's: it is replaced only when they said so (--replace)
  const put = (file: string, bytes: string | Uint8Array) => {
    const had = existsSync(file) ? readFileSync(file) : null;
    if (had && had.toString('latin1') !== Buffer.from(bytes).toString('latin1') && !rest.includes('--replace'))
      return kept.push(file);
    writeFileSync(file, bytes);
    files.push(file);
  };
  if (made.svg) put(`${stem}.svg`, made.svg);
  if (made.png) put(`${stem}.png`, made.png);
  out({
    read: true,
    level,
    card: made.card,
    text: made.text,
    files,
    ...(kept.length ? { kept, keptSaid: word('cowork.draw.kept') } : {}),
    ...(made.why ? { why: made.why } : {}),
    notes: made.notes,
  });
}

// an edit: propose it, or apply it with the approval propose gave
let ask: EditAsk;
try {
  const parsed: unknown = JSON.parse(option('edit') ?? '');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an edit');
  ask = parsed as EditAsk;
} catch {
  out({ error: word('cowork.usage') }, 2);
  ask = { do: 'line', line: '' };
}
if (command === 'propose') {
  const made = propose(note, ask);
  // the whole note as it would be stays here: the answer holds the changed block, and the approval for it
  const { after: _after, ...shown } = 'after' in made ? made : { ...made, after: '' };
  out({ read: true, level, ...shown });
}
const approved = option('approve');
const done = approved ? apply(note, ask, approved) : { refused: word('cowork.apply.not-approved') };
if ('write' in done) writeFileSync(notePath as string, done.write);
out({ read: true, level, written: 'write' in done, said: 'write' in done ? done.said : done.refused });
