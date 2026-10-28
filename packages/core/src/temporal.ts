// Temporal security (editor spec §65, TS1; risk SEC-19): what time can undo, and the rules that stop it. Sync (W30,
// W31) makes each of these reachable, so these are the parts sync is built on.
// - Erased stays erased (temporal_erased_stays_erased). eraseInNote takes a thing, or one of its properties, out of a
//   note's text. The mesh's history, the edit inbox and the layout cache use it, so no earlier moment shows it again.
// - The clock is not trusted (temporal_clock_not_trusted). An edit is stamped by a hybrid clock, which orders by what
//   each device had seen. A device's wall clock far ahead is never taken up. The merge is the join, which reads no
//   time at all, so a wrong clock cannot make an edit win, hide or look older.
// - Replay is refused (temporal_replay_refused). The inbox keeps each edit's id, so one sent again changes nothing. A
//   key taken away stops every edit not already heard, whatever its stamp says.
// - Checked at use (temporal_checked_at_use). A link, token or cache carries its expiry, and atUse checks it when it
//   is used. writeChecked asks the permissions as they are at the moment of the write.
import gs from '@thoughtknot/graph-spec';
import type { MeshJoin, Value } from '@thoughtknot/graph-spec';
import { gqlSpans } from './fences.ts';
import { gqlBlock } from './export-data-gql.ts';
import type { Access, Answer, Guarded, Permissions } from './permissions.ts';

// ── erased stays erased ─────────────────────────────────────────────────────────────────────────

/** What is erased: a thing with its links, or, with `key`, one property of it. */
export interface Erasure {
  thing: string;
  key?: string;
}

/** Whether `text` names the thing as a word of its own. */
export const mentions = (text: string, thing: string): boolean =>
  new RegExp(`(^|[^A-Za-z0-9_:])${thing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9_])`).test(text);

/**
 * `block` with the erasure applied: the thing and its links gone, or its one property. The block's first line, which
 * names its graph and document, is kept. Every other line is written again from the graph read. A block the reader
 * cannot read loses each line that names the thing, so nothing of it is kept by mistake.
 */
export function eraseInBlock(block: string, erasure: Erasure): string {
  if (!mentions(block, erasure.thing)) return block;
  const [head = ''] = block.split('\n');
  let graph;
  try {
    const store = new gs.Store();
    const name = store.apply(block);
    graph = gs.worldFromStore(store)[name];
  } catch {
    graph = undefined;
  }
  if (!graph)
    return block
      .split('\n')
      .filter((line, i) => i === 0 || !mentions(line, erasure.thing))
      .join('\n');
  const things: [string, string[], Record<string, Value>][] = [];
  for (const [id, [labels, props]] of graph.nodes) {
    if (id === erasure.thing && erasure.key === undefined) continue;
    const kept = { ...props };
    if (id === erasure.thing && erasure.key !== undefined) delete kept[erasure.key];
    things.push([id, [...labels], kept]);
  }
  const gone = (id: string) => id === erasure.thing && erasure.key === undefined;
  const links = graph.edges
    .filter(([from, , to]) => !gone(from) && !gone(to))
    .map(
      ([from, type, to, props]) => [from, type, to, { ...props }] as [string, string, string, Record<string, Value>],
    );
  const written = gqlBlock({ graph: 'g', things, links }, { note: '', date: '' }).split('\n');
  return [head, ...written.slice(2)].join('\n').replace(/\n$/, '');
}

/** A note with the erasure applied to each of its gql blocks. Text outside the blocks is left as it is. */
export function eraseInNote(note: string, erasure: Erasure): string {
  const lines = note.split('\n');
  for (const span of gqlSpans(note).reverse()) {
    const erased = eraseInBlock(span.text, erasure);
    if (erased !== span.text) lines.splice(span.open + 1, span.close - span.open - 1, ...erased.split('\n'));
  }
  return lines.join('\n');
}

/** A log's words with each word naming the erased thing put out, and each claim id about it left out. */
export function eraseInWords(words: readonly string[], erasure: Erasure): string[] {
  const about = (w: string) =>
    w.startsWith(`claim:join/${erasure.thing}/`) &&
    (erasure.key === undefined || w.startsWith(`claim:join/${erasure.thing}/${erasure.key}=`));
  return words
    .filter((w) => !about(w))
    .map((w) => (erasure.key === undefined && mentions(w, erasure.thing) ? w.split(erasure.thing).join('…') : w));
}

// ── the clock is not trusted ────────────────────────────────────────────────────────────────────

/** A hybrid logical clock's stamp: the wall time it holds, in milliseconds, a count within it, and the device. */
export interface Stamp {
  wall: number;
  count: number;
  device: string;
}

/** How far ahead of this device's own clock another device's may be and still be taken up: five minutes. */
export const MOST_AHEAD = 5 * 60 * 1000;

/** Stamps in order: by wall time, then count, then device, so every device sorts them the same. */
export const byStamp = (a: Stamp, b: Stamp): number =>
  a.wall - b.wall || a.count - b.count || (a.device < b.device ? -1 : a.device > b.device ? 1 : 0);

/**
 * A device's hybrid logical clock. A stamp it gives sorts after every stamp it gave or heard before. So what a device
 * did after seeing an edit sorts after that edit. A stamp more than MOST_AHEAD in front of this device's clock is
 * never taken up. So one wrong clock cannot pull every device's time forward.
 */
export class HybridClock {
  private last: Stamp;
  readonly device: string;
  private readonly wall: () => number;

  constructor(device: string, wall: () => number = () => Date.now()) {
    this.device = device;
    this.wall = wall;
    this.last = { wall: 0, count: 0, device };
  }

  /** The stamp for something this device does now. */
  tick(): Stamp {
    const now = this.wall();
    this.last =
      now > this.last.wall
        ? { wall: now, count: 0, device: this.device }
        : { wall: this.last.wall, count: this.last.count + 1, device: this.device };
    return { ...this.last };
  }

  /** Takes up a stamp heard from another device, unless its clock is too far ahead. Says whether it was taken up. */
  hear(stamp: Stamp): boolean {
    const now = this.wall();
    if (stamp.wall > now + MOST_AHEAD) return false;
    const wall = Math.max(now, this.last.wall, stamp.wall);
    const count =
      wall === this.last.wall && wall === stamp.wall
        ? Math.max(this.last.count, stamp.count) + 1
        : wall === this.last.wall
          ? this.last.count + 1
          : wall === stamp.wall
            ? stamp.count + 1
            : 0;
    this.last = { wall, count, device: this.device };
    return true;
  }
}

// ── replay is refused ───────────────────────────────────────────────────────────────────────────

/**
 * One edit sync carries: a device's version of a note. It comes with the device's own count of its edits, its stamp
 * and the key it was signed with. Its id is the device and the count, so the same edit sent again has the same id.
 */
export interface Edit {
  device: string;
  seq: number;
  note: string;
  text: string;
  stamp: Stamp;
  key: string;
}

/** What the inbox did with an edit. */
export type Heard = 'kept' | 'replayed' | 'revoked';

/** An edit's id: its device and its count. */
export const editId = (e: Pick<Edit, 'device' | 'seq'>): string => `${e.device}#${e.seq}`;

/**
 * A device's inbox of edits from every device. An edit heard again changes nothing. A key taken away stops every edit
 * signed with it that was not heard before, on this device, from the moment it hears of it. The graph it holds is the
 * join of each device's latest version of each note, latest by the device's own count, never by a clock.
 */
export class EditInbox {
  private readonly edits = new Map<string, Edit>();
  private readonly revoked = new Set<string>();
  readonly clock: HybridClock;
  /** Each edit's id and the stamp this device heard it at, in the order heard. */
  readonly heard: [id: string, at: Stamp][] = [];
  /** Edits whose clock was too far ahead to take up: kept, and listed so a person sees the device is wrong. */
  readonly clockAhead: string[] = [];

  constructor(clock: HybridClock) {
    this.clock = clock;
  }

  /** Takes an edit in. */
  receive(edit: Edit): Heard {
    const id = editId(edit);
    if (this.edits.has(id)) return 'replayed';
    if (this.revoked.has(edit.key)) return 'revoked';
    if (!this.clock.hear(edit.stamp)) this.clockAhead.push(id);
    this.edits.set(id, { ...edit, stamp: { ...edit.stamp } });
    this.heard.push([id, this.clock.tick()]);
    return 'kept';
  }

  /** Takes a key away: no edit signed with it is taken in after this. */
  revoke(key: string): void {
    this.revoked.add(key);
  }

  /** Each device's latest version of each note, by note then device. */
  latest(): Edit[] {
    const out = new Map<string, Edit>();
    for (const e of this.edits.values()) {
      const at = `${e.note}\u0000${e.device}`;
      const had = out.get(at);
      if (!had || e.seq > had.seq) out.set(at, e);
    }
    return [...out.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, e]) => e);
  }

  /** The graph the inbox holds: the latest versions joined as the mesh joins them. */
  merged(): MeshJoin {
    const docs = this.latest().flatMap((e) =>
      gqlSpans(e.text)
        .map((s) => s.text)
        .filter((b) => / · document \S+/.test(b.split('\n')[0] ?? '')),
    );
    return gs.meshJoin({ docs });
  }

  /** Every edit kept, each with the erasure applied, so the inbox's history holds nothing of what was erased. */
  erase(erasure: Erasure): void {
    for (const [id, e] of this.edits) this.edits.set(id, { ...e, text: eraseInNote(e.text, erasure) });
  }

  /** Every edit kept, in the order heard. */
  all(): Edit[] {
    return this.heard.flatMap(([id]) => {
      const e = this.edits.get(id);
      return e ? [{ ...e }] : [];
    });
  }
}

// ── checked at use ──────────────────────────────────────────────────────────────────────────────

/** Something that stops working at a time: a shared link, a token, a saved value. */
export interface Expiring {
  /** When it stops working, as an ISO instant. One with no expiry works until taken away. */
  expires?: string;
}

/** Whether something expiring still works at `now`, checked at the moment it is used. */
export const atUse = (item: Expiring, now: string): { ok: true } | { ok: false; why: 'expired' } =>
  item.expires !== undefined && Date.parse(item.expires) <= Date.parse(now)
    ? { ok: false, why: 'expired' }
    : { ok: true };

/** A saved value, with the digest of what it was made from, and when it stops being trusted. */
export interface Cached<T> extends Expiring {
  value: T;
  source: string;
}

/** A saved value at use: refused when what it was made from has changed since, or when it has expired. */
export function useCached<T>(
  cached: Cached<T>,
  source: string,
  now: string,
): { ok: true; value: T } | { ok: false; why: 'stale' | 'expired' } {
  if (cached.source !== source) return { ok: false, why: 'stale' };
  const fresh = atUse(cached, now);
  return fresh.ok ? { ok: true, value: cached.value } : fresh;
}

/**
 * A write made only if the permissions as they are at the moment of writing allow it. `permissions` gives them as they
 * stand, so a permission taken away after the person asked, and before the write, stops the write.
 */
export function writeChecked(
  permissions: () => Permissions,
  person: string,
  thing: Guarded,
  write: () => void,
  access: Access = 'write',
): Answer {
  const answer = permissions().check(person, access, thing);
  if (answer.ok) write();
  return answer;
}
