// Writes the person's decision, or a presentation they chose to keep, into a note, for the Claude Code host (editor spec
// §49). Node runs it as a process, because a mod writes no file itself.
// - The request comes in on standard input as one JSON object (claude-record.ts, `RecordRequest`).
// - The note is read, written to a file beside it and moved into place, so a reader never sees half of it.
// - The answer goes out on standard output as `{ok, text}`. Nothing else is written.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { recordInto, saidOf } from '../src/claude-record.ts';
import type { RecordRequest } from '../src/claude-record.ts';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d: string) => (input += d));
process.stdin.on('end', () => {
  let r: RecordRequest;
  try {
    r = JSON.parse(input) as RecordRequest;
    if (typeof r.path !== 'string' || !/\.md$/i.test(r.path)) throw new Error('not a note');
  } catch {
    process.stdout.write(JSON.stringify({ ok: false, text: 'Nothing was written: the request could not be read.' }));
    return;
  }
  let outcome: { ok: boolean; why?: string };
  try {
    const done = recordInto(readFileSync(r.path, 'utf8'), r);
    if (done.ok) {
      const temp = `${r.path}.thoughtknot-${process.pid}`;
      writeFileSync(temp, done.note);
      renameSync(temp, r.path);
    }
    outcome = done;
  } catch (err) {
    outcome = { ok: false, why: err instanceof Error ? err.message : String(err) };
  }
  process.stdout.write(JSON.stringify({ ok: outcome.ok, text: saidOf(r, outcome) }));
});
