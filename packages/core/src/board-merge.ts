// Merging two versions of a board that were edited apart (editor spec §45, board_offline_merge). Two people edit while
// offline. When they meet again, the board is merged from the version they both started from and each person's own.
// Nothing is lost. A change only one person made is taken. Where both changed the same thing differently, both are
// kept. The clash is flagged on the items, so the people can see it and settle it. Neither side is silently picked.
// Pure and host-free. The plug-in for Obsidian runs it only on files Obsidian has already synced.
import { readBoard, writeBoard } from './board.ts';
import type { Board, BoardItem } from './board.ts';
import type { Value } from '@thoughtknot/graph-spec';
import { CLASH } from './board-clash.ts';
import { GAP } from './board-edit.ts';
import { itemBox } from './board-svg.ts';
import { word } from './words.ts';

export { CLASH };

/** One clash found in a merge: the item kept as it is, its copy holding the other side, and what clashed. */
export interface Clash {
  id: string;
  copy: string | null;
  why: string;
}

/** The result of a merge: the merged block, the clashes flagged in it and a line for a screen reader. */
export interface Merged {
  text: string;
  clashes: Clash[];
  said: string;
}

type Rec = Record<string, Value | undefined>;

/** An item's properties as one flat record, so each can be compared by itself. */
function recOf(item: BoardItem): Rec {
  const r: Rec = { kind: item.kind, x: item.x, y: item.y };
  for (const k of ['w', 'h', 'layer', 'text', 'style', 'graph', 'group', 'locked'] as const) r[k] = item[k];
  return { ...r, ...item.more };
}

/** A flat record back into an item with the given name. */
function itemOf(id: string, r: Rec): BoardItem {
  const item: BoardItem = { id, kind: r.kind as BoardItem['kind'], x: Number(r.x), y: Number(r.y), more: {} };
  const own = new Set(['kind', 'x', 'y', 'w', 'h', 'layer', 'text', 'style', 'graph', 'group', 'locked']);
  for (const [k, v] of Object.entries(r)) {
    if (v === undefined) continue;
    if (!own.has(k)) item.more[k] = v;
    else if (k === 'w' || k === 'h' || k === 'layer') item[k] = Number(v);
    else if (k === 'text' || k === 'style' || k === 'graph' || k === 'group') item[k] = typeof v === 'string' ? v : '';
    else if (k === 'locked') item.locked = v === true;
  }
  return item;
}

const eq = (a: Value | undefined, b: Value | undefined) => JSON.stringify(a) === JSON.stringify(b);

/** The three-way merge of one item. `clash` lists the properties both sides changed in different ways. */
function mergeItem(base: Rec | null, ours: Rec, theirs: Rec): { merged: Rec; clash: string[] } {
  const merged: Rec = {};
  const clash: string[] = [];
  for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(base ?? {})])) {
    const [o, t, b] = [ours[k], theirs[k], base?.[k]];
    if (eq(o, t)) merged[k] = o;
    else if (base && eq(o, b)) merged[k] = t;
    else if (base && eq(t, b)) merged[k] = o;
    else {
      merged[k] = o;
      clash.push(k);
    }
  }
  return { merged, clash };
}

/** A name for the copy of an item that holds the other side of a clash. */
function copyName(taken: Set<string>, id: string): string {
  let n = 1;
  while (taken.has(`${id}_other${n === 1 ? '' : n}`)) n++;
  return `${id}_other${n === 1 ? '' : n}`;
}

/**
 * The block merged from `base` (what both started from), `ours` and `theirs` (each person's version). A change made on
 * one side only is taken. An item both changed in the same property, differently, stays as ours, and a copy beside it
 * holds theirs. Both carry a `clash` property. An item one side took out and the other changed is kept and flagged.
 */
export function mergeBoards(base: string, ours: string, theirs: string): Merged {
  const [b, o, t] = [base, ours, theirs].map((x) => readBoard(x).board);
  const index = (bd: Board | undefined) => new Map((bd?.items ?? []).map((i) => [i.id, i]));
  const [bi, oi, ti] = [index(b), index(o), index(t)];
  const out: BoardItem[] = [];
  const clashes: Clash[] = [];
  const taken = new Set([...bi.keys(), ...oi.keys(), ...ti.keys()]);
  const flag = (item: BoardItem, other: string) => (item.more[CLASH] = other);
  for (const id of new Set([...oi.keys(), ...ti.keys()])) {
    const [bs, os, ts] = [bi.get(id), oi.get(id), ti.get(id)];
    const was = bs ? recOf(bs) : null;
    if (os && ts) {
      const { merged, clash } = mergeItem(was, recOf(os), recOf(ts));
      const item = itemOf(id, merged);
      out.push(item);
      if (clash.length) {
        const copy = itemOf(copyName(taken, id), recOf(ts));
        taken.add(copy.id);
        const box = itemBox(item);
        copy.x = Math.round(box.x + box.w + GAP);
        copy.y = Math.round(box.y);
        flag(item, copy.id);
        flag(copy, id);
        out.push(copy);
        clashes.push({ id, copy: copy.id, why: clash.join(', ') });
      }
    } else if (os || ts) {
      const kept = (os ?? ts) as BoardItem;
      const side = recOf(kept);
      const changed = !!was && !Object.keys({ ...was, ...side }).every((k) => eq(was[k], side[k]));
      const item = itemOf(id, side);
      // taken out by one side: gone if the other left it as it was, else kept and flagged
      if (!bs || changed) {
        out.push(item);
        if (bs) {
          flag(item, id);
          clashes.push({ id, copy: null, why: 'removed' });
        }
      }
    }
  }
  const have = new Set(out.map((i) => i.id));
  const key = (c: { from: string; to: string }) => `${c.from}\u0000${c.to}`;
  const [bk, ok, tk] = [b, o, t].map((bd) => new Map((bd?.connectors ?? []).map((c) => [key(c), c])));
  const links = new Map<string, Board['connectors'][number]>();
  for (const [k, c] of [...(ok?.entries() ?? []), ...(tk?.entries() ?? [])]) {
    const stays = (side: typeof ok) => side?.has(k) ?? false;
    const added = !bk?.has(k);
    // a link one side took out stays out when the other side left it as it was
    if ((added || (stays(ok) && stays(tk))) && have.has(c.from) && have.has(c.to)) links.set(k, c);
  }
  const board: Board = {
    name: o?.name || t?.name || b?.name || '',
    on: o?.on ?? t?.on ?? b?.on ?? null,
    items: out,
    connectors: [...links.values()],
  };
  const said = clashes.length ? word('board.merge.clashes', { count: clashes.length }) : word('board.merge.clean');
  return { text: writeBoard(board), clashes, said };
}
