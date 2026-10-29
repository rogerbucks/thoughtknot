// The engine, the third of the five layers (editor spec §40, five_layer_stack; §30, same_join_every_author). It
// checks each edit before it reaches the CRDT below. So a statement that cannot be read is refused on its device and
// never replicates. Every author's edit is checked the same way, a person's on a desktop or a phone or an AI's. After a
// merge it joins the edits by their meaning (crdt_transport). A merge of the text may pick one of two values, and that
// pick is never the decision. The join holds the dispute as contested claims, for a person to decide.
import { gqlBlocks, readNote } from '@thoughtknot/core';
import gs from '@thoughtknot/graph-spec';
import type { Anchor, Made, NoteCrdt } from './crdt.ts';

/** An edit the engine refused, and the problems it would have brought in. */
export interface Refused {
  refused: string[];
}

/** What a merge brought, read by meaning: the claims left contested and the values the text picked among them. */
export interface Joined {
  base: string;
  ours: string;
  theirs: string;
  merged: string;
  contested: string[];
  picked: { subject: string; about: string; value: unknown; claim: string; over: string[] }[];
}

/** The errors of a note's graph blocks, each as its graph and words, so moving a line does not make it new. */
export function errorsOf(text: string): string[] {
  const blocks = gqlBlocks(text);
  if (!blocks.length) return [];
  return readNote(blocks.map((b) => b.text))
    .problems.filter((p) => p.severity === 'error')
    .map((p) => `${p.graph ?? ''}: ${p.message}`);
}

/** The errors `after` has that `before` did not, each counted: an error already there is not the edit's. */
export function newErrors(before: string, after: string): string[] {
  const had = new Map<string, number>();
  for (const e of errorsOf(before)) had.set(e, (had.get(e) ?? 0) + 1);
  return errorsOf(after).filter((e) => {
    const n = had.get(e) ?? 0;
    had.set(e, n - 1);
    return n <= 0;
  });
}

/** Each graph block of `text` as a document of the join: its statements under a header naming `doc`. */
function docsOf(text: string, doc: string): Map<string, string> {
  const out = new Map<string, string>();
  gqlBlocks(text).forEach((block, i) => {
    const [first = '', ...rest] = block.text.split('\n');
    const graph = /\/\/\s*graph:\s*([^\s·]+)/.exec(first)?.[1] ?? `block${i}`;
    const revision = doc === 'doc:base' ? '' : ' · revision of doc:base';
    out.set(
      `${graph}#${i}`,
      `// graph: ${graph} · document ${doc} · schema s1 · as of 2026-01-01${revision}\n${rest.join('\n')}`,
    );
  });
  return out;
}

/** The edits the layer below merged, joined by meaning: each graph block of ours and theirs over their base. */
export function joinMerge(m: { base: string; ours: string; theirs: string; merged: string }): Joined {
  const [base, ours, theirs, merged] = [
    docsOf(m.base, 'doc:base'),
    docsOf(m.ours, 'doc:ours'),
    docsOf(m.theirs, 'doc:theirs'),
    docsOf(m.merged, 'doc:merged'),
  ];
  const out: Joined = { ...m, contested: [], picked: [] };
  for (const [key, b] of base) {
    const [o, t, g] = [ours.get(key), theirs.get(key), merged.get(key)];
    if (o === undefined || t === undefined || g === undefined) continue;
    try {
      const j = gs.afterTextMerge({ base: b, ours: o, theirs: t, merged: g });
      out.contested.push(...j.contested);
      out.picked.push(...j.picked);
    } catch {
      // a block that cannot be read is no claim: its problem is shown on the note, as any problem is
    }
  }
  return out;
}

/** The engine over one device's CRDT: every edit checked before it replicates, every merge joined by meaning. */
export class Engine {
  readonly #crdt: NoteCrdt;
  constructor(crdt: NoteCrdt) {
    this.#crdt = crdt;
  }

  get device(): string {
    return this.#crdt.device;
  }

  open(note: string, text?: string): Promise<string> {
    return this.#crdt.open(note, text);
  }

  text(note: string): string {
    return this.#crdt.text(note);
  }

  /** Replaces the text from `from` to `to` by `text`, in `author`'s name, unless it would bring in an error. */
  async edit(note: string, from: number, to: number, text: string, author: string): Promise<Refused | undefined> {
    const before = this.#crdt.text(note);
    const refused = newErrors(before, before.slice(0, from) + text + before.slice(to));
    if (refused.length) return { refused };
    await this.#crdt.splice(note, from, to, text, author);
    return undefined;
  }

  /** Merges in other devices' changes, and joins them by meaning: nothing when no change came. */
  async merge(note: string): Promise<Joined | undefined> {
    const m = await this.#crdt.merge(note);
    return m && joinMerge(m);
  }

  anchor(note: string, place: number): Anchor {
    return this.#crdt.anchor(note, place);
  }

  place(note: string, anchor: Anchor): number {
    return this.#crdt.place(note, anchor);
  }

  history(note: string): Made[] {
    return this.#crdt.history(note);
  }
}
