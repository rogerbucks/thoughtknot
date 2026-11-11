// Growing the picture from one thing (editor spec §53, scale_expand_on_demand). Roger, 22 Oct 2026: in a massive graph
// the reader starts from one thing and asks for more, one step at a time. Never the whole graph at once.
//
// An expansion starts at a thing. Each step adds the things one link further out: its ring. A ring too big to read is
// cut to its best-linked things, and the whole is never more than can be laid out at once. A step back takes the last
// ring away. `part` is the drawing cut down to what is kept, to lay out on its own.
//
// A drawing read in parts holds no links: they are read from the store as a step reaches its things. `more` and
// `readPart` wait for them; `grow` and `part` use only the links read so far.
//
// Host-free and pure: it reads the drawing, and never changes it.
import { adjacency, edgesOf } from './focus.ts';
import type { GraphDrawing, Link } from './note-reading.ts';
import { linksNear } from './parts-source.ts';
import type { LinksNear } from './parts-source.ts';

/** The most things one step adds: more is a crowd, not an answer. */
export const RING_MOST = 60;
/** The most things an expansion holds in all, so it can always be laid out in one go. */
export const EXPANSION_MOST = 400;

/** The things kept around one thing, a ring per step, and the drawing to lay out for them. */
export class Expansion {
  /** The rings, nearest first: the first holds only the thing it starts from. */
  readonly rings: string[][];
  /** How many things each ring left out, as too many to show. */
  readonly cut: number[];
  private readonly drawing: GraphDrawing;
  private readonly adj: Map<string, [number, string][]>;
  private readonly kept: Set<string>;
  private readonly near: LinksNear | undefined;
  /** With `near`: the things whose links are read, and the links read, by `edge`. */
  private readonly asked = new Set<string>();
  private readonly read = new Map<number, Link>();

  /**
   * An expansion of `drawing` from thing `from`. With `near`, or for a drawing read in parts, its links are not read.
   * Each thing's links come from `near` when a step reaches it.
   */
  constructor(drawing: GraphDrawing, from: string, near?: LinksNear) {
    this.drawing = drawing;
    this.near = near ?? linksNear(drawing);
    this.adj = this.near ? new Map<string, [number, string][]>() : adjacency(edgesOf(drawing));
    this.rings = [[from]];
    this.cut = [0];
    this.kept = new Set([from]);
  }

  /** The thing it starts from. */
  get from(): string {
    return this.rings[0]?.[0] as string;
  }

  /** How many steps out it reaches. */
  get steps(): number {
    return this.rings.length - 1;
  }

  /** Every thing kept, in rings, nearest first. */
  keys(): string[] {
    return this.rings.flat();
  }

  /**
   * One step further out: the things linked to the last ring that are not kept yet. The best-linked come first, and
   * ties keep the order they are written in. Gives back the new ring, empty when there is nothing more to add.
   */
  grow(): string[] {
    const last = this.rings.at(-1) ?? [];
    const found = new Map<string, number>();
    for (const at of last)
      for (const [, other] of this.adj.get(at) ?? [])
        if (!this.kept.has(other)) found.set(other, (found.get(other) ?? 0) + 1);
    if (!found.size) return [];
    const order = new Map(this.drawing.boxes.map((b, i) => [b.key, i]));
    const ranked = [...found]
      .sort(([a, x], [b, y]) => y - x || (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .map(([k]) => k);
    const room = Math.min(RING_MOST, EXPANSION_MOST - this.kept.size);
    const ring = ranked.slice(0, Math.max(0, room));
    if (!ring.length) return [];
    for (const k of ring) this.kept.add(k);
    this.rings.push(ring);
    this.cut.push(ranked.length - ring.length);
    return ring;
  }

  /** One step back: the last ring is taken away. The thing it starts from always stays. */
  shrink(): void {
    if (this.rings.length < 2) return;
    for (const k of this.rings.pop() ?? []) this.kept.delete(k);
    this.cut.pop();
  }

  /** One step further out, as `grow`, once the links of the last ring are read. */
  async more(): Promise<string[]> {
    await this.ask(this.rings.at(-1) ?? []);
    return this.grow();
  }

  /** The drawing to lay out, as `part`, once the links of every thing kept are read. */
  async readPart(): Promise<GraphDrawing> {
    await this.ask([...this.kept]);
    return this.part();
  }

  /** The drawing cut down to the things kept and the links among them, to lay out on its own. */
  part(): GraphDrawing {
    if (!this.near) return partOf(this.drawing, this.kept);
    const links = [...this.read.values()].filter((l) => this.kept.has(l.from) && this.kept.has(l.to));
    return {
      ...partOf({ ...this.drawing, links: [] }, this.kept),
      links: links.sort((a, b) => (a.edge ?? 0) - (b.edge ?? 0)),
    };
  }

  /** With `near`, reads the links of those of `keys` not asked about yet, each link once. */
  private async ask(keys: readonly string[]): Promise<void> {
    if (!this.near) return;
    const fresh = keys.filter((k) => !this.asked.has(k));
    if (!fresh.length) return;
    for (const k of fresh) this.asked.add(k);
    for (const l of await this.near(fresh)) {
      const n = l.edge ?? -1;
      if (this.read.has(n)) continue;
      this.read.set(n, l);
      const add = (at: string, other: string) => {
        const list = this.adj.get(at);
        if (list) list.push([n, other]);
        else this.adj.set(at, [[n, other]]);
      };
      add(l.from, l.to);
      if (l.to !== l.from) add(l.to, l.from);
    }
  }
}

/** `d` cut down to the things `keys` names and the links between them, to lay out on its own. */
export function partOf(d: GraphDrawing, keys: Iterable<string>): GraphDrawing {
  const kept = new Set(keys);
  const { folding: _folding, ...rest } = d;
  return {
    ...rest,
    boxes: d.boxes.filter((b) => kept.has(b.key)),
    links: d.links.filter((l) => kept.has(l.from) && kept.has(l.to)),
    estimates: [],
  };
}
