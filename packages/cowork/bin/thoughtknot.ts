// The Copilot Cowork skill's companion script (editor spec §46, cowork_skill). Cowork runs it as
// `node scripts/thoughtknot.mjs <command> <note> [options]` and reads one JSON object from standard output.
// - read, check: the graph blocks of a note, or its problems, once the gate lets the note in.
// - draw: an SVG and a PNG beside the note, and a card.
// - propose: what an edit would change. Nothing is written.
// - apply: writes the edit, only with the approval that propose gave for this edit of this note as it is now.
// It reads the files it is named and writes beside the note. It makes no network call (cowork_no_server).
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { word } from '@thoughtknot/core';
import { apply, clear, draw, propose, read } from '../src/cowork.ts';
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
  const made = await draw(note, level, option('graph'));
  const stem = join(dirname(notePath as string), basename(notePath as string, extname(notePath as string)));
  const files: string[] = [];
  if (made.svg) {
    writeFileSync(`${stem}.svg`, made.svg);
    files.push(`${stem}.svg`);
  }
  if (made.png) {
    writeFileSync(`${stem}.png`, made.png);
    files.push(`${stem}.png`);
  }
  out({
    read: true,
    level,
    card: made.card,
    text: made.text,
    files,
    ...(made.why ? { why: made.why } : {}),
    notes: made.notes,
  });
}

// an edit: propose it, or apply it with the approval propose gave
let ask: EditAsk;
try {
  ask = JSON.parse(option('edit') ?? '') as EditAsk;
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
