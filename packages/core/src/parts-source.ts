// A note read in parts, drawn from the store a group at a time (editor spec §53, scale_parts_overview; way F). The
// overview needs only the store's group rows: each group, its size and the links between groups. A group's things and
// links are read from the store when it opens or comes on screen. Past the budget, the groups used longest ago are let
// go. So the memory a drawing holds follows the screen, not the size of the graph.
//
// The store stays a copy that can be thrown away. A read from rows of other text than the note has now is refused, so
// a stale store is never drawn (text_is_the_store).
import { sha256 } from './ai-digest.ts';
import { noteRowsPaced } from './mesh-index-rows.ts';
import type { GraphDrawing } from './note-reading.ts';
import type { MeshIndex } from './mesh-index.ts';
import type { Grouping } from './scale-groups.ts';

/** The most rows (things and links) a drawing of a note read in parts holds at once, by default. */
export const PARTS_HELD_MOST = 20_000;

/** A group of a note read in parts, as it was read from the store, and how many rows it holds. */
interface Held {
  part: GraphDrawing;
  rows: number;
}

/** One graph of a note read in parts, read from the store a group at a time. */
export class PartsSource {
  /** The groups held, the one used most lately last. */
  private readonly held = new Map<string, Held>();
  private readonly pinned = new Set<string>();
  private rows = 0;

  /**
   * The graph `graph` of `note`, read in parts into `ix` from text with digest `version`. `most` is how many rows it may
   * hold at once.
   */
  private readonly ix: MeshIndex;
  readonly note: string;
  readonly graph: string;
  private readonly version: string;
  private readonly most: number;

  constructor(ix: MeshIndex, note: string, graph: string, version: string, most = PARTS_HELD_MOST) {
    this.ix = ix;
    this.note = note;
    this.graph = graph;
    this.version = version;
    this.most = most;
  }

  /** Whether the store still holds the rows this was made from. */
  get fresh(): boolean {
    return this.ix.version(this.note) === this.version;
  }

  /** How many things and links it holds now. */
  get holding(): number {
    return this.rows;
  }

  /** The groups held now, the one used most lately last. */
  get open(): string[] {
    return [...this.held.keys()];
  }

  /** Its groups and the links between them, from the group rows alone: no thing is read. Empty when not fresh. */
  overview(): Grouping {
    if (!this.fresh) return { by: 'links', groups: [], between: [] };
    const rows = this.ix.groups(this.note);
    const groups = rows.groups.filter((g) => g.graph === this.graph);
    const at = new Map(groups.map((g, i) => [g.id, i]));
    return {
      by: groups[0]?.by ?? 'links',
      groups: groups.map((g) => ({ id: g.id, label: g.label, by: g.by, keys: [], size: g.things })),
      between: rows.between
        .filter((b) => b.graph === this.graph && at.has(b.from) && at.has(b.to))
        .map((b) => ({ from: at.get(b.from) as number, to: at.get(b.to) as number, links: b.links })),
    };
  }

  /**
   * Group `id`'s things and the links inside it, read from the store, to lay out on its own. Held until let go, or until
   * more is held than the budget and it is the group used longest ago. With `keep`, it is never let go for room.
   * Null when the store no longer holds the rows this was made from.
   */
  group(id: string, keep = false): GraphDrawing | null {
    if (!this.fresh) return null;
    if (keep) this.pinned.add(id);
    const kept = this.held.get(id);
    if (kept) {
      this.held.delete(id);
      this.held.set(id, kept);
      return kept.part;
    }
    const { backend } = this.ix;
    const inside = backend.inside
      ? backend.inside(this.note, id)
      : backend.links(this.note).filter((l) => l.fromGroup === id && l.toGroup === id);
    const part: GraphDrawing = {
      graph: this.graph,
      boxes: backend
        .things(this.note, [id])
        .filter((t) => t.graph === this.graph)
        .map((t) => ({ key: t.key, kind: t.kind, text: t.text })),
      links: inside
        .filter((l) => l.graph === this.graph)
        .map((l) => ({ from: l.from, type: l.type, reading: l.reading, to: l.to })),
      estimates: [],
    };
    const rows = part.boxes.length + part.links.length;
    this.held.set(id, { part, rows });
    this.rows += rows;
    this.makeRoom();
    return part;
  }

  /** Lets group `id` go: it is read from the store again when next needed. */
  letGo(id: string): void {
    const kept = this.held.get(id);
    this.pinned.delete(id);
    if (!kept) return;
    this.held.delete(id);
    this.rows -= kept.rows;
  }

  /** Lets go of every group not on screen: only those `onScreen` names, and those kept, stay held. */
  onScreen(ids: Iterable<string>): void {
    const shown = new Set(ids);
    for (const id of [...this.held.keys()]) if (!shown.has(id) && !this.pinned.has(id)) this.letGo(id);
  }

  /** Lets go of the groups used longest ago, never a kept one nor the newest, until it holds no more than its budget. */
  private makeRoom(): void {
    const newest = [...this.held.keys()].at(-1);
    for (const id of [...this.held.keys()]) {
      if (this.rows <= this.most) return;
      if (id !== newest && !this.pinned.has(id)) this.letGo(id);
    }
  }
}

/**
 * The graphs of `note` from the store, each to draw a group at a time. The note is read into the store first, a part
 * at a time with `pause` between parts, unless the store holds this text. Empty when the note changed while it was read.
 */
export async function partsOf(
  ix: MeshIndex,
  note: string,
  text: string,
  pause: () => Promise<void>,
  most = PARTS_HELD_MOST,
): Promise<Map<string, PartsSource>> {
  const version = sha256(text);
  if (ix.version(note) !== version) ix.backend.put(await noteRowsPaced(note, text, pause));
  const out = new Map<string, PartsSource>();
  if (ix.version(note) !== version) return out;
  for (const g of ix.groups(note).groups)
    if (!out.has(g.graph)) out.set(g.graph, new PartsSource(ix, note, g.graph, version, most));
  return out;
}
