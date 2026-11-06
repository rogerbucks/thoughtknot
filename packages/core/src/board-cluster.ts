// Grouping sticky notes on a board (editor spec §45, board_cluster). Notes that share a tag or a word are put in a frame
// together. It is worked out on the device from the notes' own text, with no network call. An AI may name a group only
// when the person chooses it. No note moves (nodes stay put): a frame is drawn round the notes where they already are,
// and a group is left as it is when another note sits in the way. Pure and host-free.
import type { Board, BoardItem } from './board.ts';
import { freeId } from './board-edit.ts';
import type { BoardChange } from './board-edit.ts';
import { itemBox } from './board-svg.ts';
import type { Box } from './board-svg.ts';
import { word } from './words.ts';

/** A group of notes that share words: the notes, the words they share and the name the frame gets. */
export interface Cluster {
  label: string;
  ids: string[];
  shared: string[];
}

/** The room left between a frame and the notes it holds. */
export const FRAME_PAD = 24;
// words too common to say two notes belong together
const COMMON = new Set(
  'the and for are but not you all can had her was one our out has his how its may new now see two way who did get let put say she too use with that this from have they will your what when been more some than them then were into over such only also just like about would there their which could other these'.split(
    ' ',
  ),
);
/** The notes that can be grouped: those that hold text and are not frames. */
const groupable = (i: BoardItem) => (i.kind === 'Sticky' || i.kind === 'Card' || i.kind === 'Text') && !!i.text;

/** The tags (#word) and the words of a note's text, lower case. Tags count for more than words. */
function termsOf(text: string): { tags: Set<string>; words: Set<string> } {
  const tags = new Set<string>();
  const words = new Set<string>();
  for (const m of text.toLowerCase().matchAll(/#([\p{L}\p{N}_-]+)|([\p{L}\p{N}]{3,})/gu)) {
    if (m[1]) tags.add(m[1]);
    else if (m[2] && !COMMON.has(m[2])) words.add(m[2]);
  }
  return { tags, words };
}

/** The groups of notes that share a tag or a word, two notes or more, the biggest first. */
export function clusters(board: Board): Cluster[] {
  const notes = board.items.filter(groupable);
  const terms = notes.map((n) => termsOf(n.text ?? ''));
  const root = notes.map((_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i] as number)));
  const sharedBy = (a: number, b: number): string[] => {
    const x = terms[a],
      y = terms[b];
    if (!x || !y) return [];
    return [
      ...[...x.tags].filter((t) => y.tags.has(t)).map((t) => `#${t}`),
      ...[...x.words].filter((w) => y.words.has(w)),
    ];
  };
  for (let a = 0; a < notes.length; a++)
    for (let b = a + 1; b < notes.length; b++) if (sharedBy(a, b).length) root[find(b)] = find(a);
  const groups = new Map<number, number[]>();
  notes.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const out: Cluster[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const count = new Map<string, number>();
    for (let a = 0; a < members.length; a++)
      for (let b = a + 1; b < members.length; b++)
        for (const t of sharedBy(members[a] as number, members[b] as number)) count.set(t, (count.get(t) ?? 0) + 1);
    const shared = [...count.entries()].sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0])).map(([t]) => t);
    out.push({ label: shared[0] ?? '', ids: members.map((i) => (notes[i] as BoardItem).id), shared });
  }
  return out.sort((a, b) => b.ids.length - a.ids.length || a.label.localeCompare(b.label));
}

/** The smallest box that holds every box given, with `pad` all round. */
function around(boxes: Box[], pad: number): Box {
  const x = Math.min(...boxes.map((b) => b.x)) - pad;
  const y = Math.min(...boxes.map((b) => b.y)) - pad;
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(Math.max(...boxes.map((b) => b.x + b.w)) + pad - x),
    h: Math.round(Math.max(...boxes.map((b) => b.y + b.h)) + pad - y),
  };
}

const meets = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** What grouping does: the frames to add, the groups made, the groups left alone and a line for a screen reader. */
export interface ClusterPlan {
  changes: BoardChange[];
  framed: Cluster[];
  left: Cluster[];
  said: string;
}

/**
 * The frames that group the board's notes. A frame goes round its notes where they are. A group is left alone when a note
 * of another group, or any other item, lies within its frame, so no note ends up in a frame it does not belong to.
 */
export function clusterPlan(board: Board): ClusterPlan {
  const framed: Cluster[] = [];
  const left: Cluster[] = [];
  const changes: BoardChange[] = [];
  const work: Board = { ...board, items: [...board.items] };
  for (const c of clusters(board)) {
    const members = work.items.filter((i) => c.ids.includes(i.id));
    const box = around(members.map(itemBox), FRAME_PAD);
    // already framed: a frame holds all of these notes, so grouping twice adds nothing
    const held = (f: BoardItem) => {
      const fb = itemBox(f);
      return members.every((m) => {
        const b = itemBox(m);
        return b.x >= fb.x && b.y >= fb.y && b.x + b.w <= fb.x + fb.w && b.y + b.h <= fb.y + fb.h;
      });
    };
    if (work.items.some((i) => i.kind === 'Frame' && held(i))) continue;
    const blocked = work.items.some((i) => !c.ids.includes(i.id) && i.kind !== 'Frame' && meets(box, itemBox(i)));
    if (blocked) {
      left.push(c);
      continue;
    }
    const frame: BoardItem = {
      id: freeId(work, 'Frame'),
      kind: 'Frame',
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      layer: -1,
      more: {},
    };
    if (c.label) frame.text = c.label;
    work.items.push(frame);
    changes.push({ kind: 'add', item: frame });
    framed.push(c);
  }
  const said =
    !framed.length && !left.length
      ? word('board.cluster.none')
      : word('board.cluster.done', { frames: framed.length, left: left.length });
  return { changes, framed, left, said };
}
