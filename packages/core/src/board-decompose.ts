// A board offered as things, links and groups (editor spec §45, board_to_graph; B2). Any item or selection on a board
// decomposes into graph items. It is shown as a proposal first and written only when a person accepts a change (ES§17).
// - A sticky, card, text or shape item with words is a thing of the kind chosen for it, named by its words.
// - A connector between two items is a link between their things, typed by its label, else the graph's usual type.
// - A frame is a group: a cluster, with each item inside it a member of it.
// - A list inside an item, lines that start with a dash, a star or a number, is several things: one for each line.
// An item already linked to a thing is not offered again, and a connector joins the things its items stand for.
// It gives back which things each item gave, for linking them to it (board_graph_linked). Host-free and pure.
import gs from '@thoughtknot/graph-spec';
import { gqlBlocks } from './blocks.ts';
import { itemBox } from './board-svg.ts';
import type { Box } from './board-svg.ts';
import { readBoard } from './board.ts';
import type { BoardItem } from './board.ts';
import { readNote } from './drawing.ts';
import { linkChange, makeProposal, thingChange } from './proposals.ts';
import type { ChangeInput, Proposal } from './proposals.ts';
import { basisOf } from './proposals-basis.ts';
import { proposalId } from './steps.ts';
import { word } from './words.ts';

/** Who offers a board's proposal: the editor reading the board, declared as a step is. */
export const BOARD_PROPOSER = 'board';

/** The kinds of item that become things. A frame becomes a group, and ink, images and glyphs say nothing in words. */
const THINGS = new Set(['Sticky', 'Card', 'Text', 'Shape']);
/** A line of a list: a dash, a star or a number opens it. */
const LIST_LINE = /^\s*(?:[-*]|\d+[.)])\s+(\S.*)$/;
const KIND = /^[A-Za-z][A-Za-z0-9_]*$/;

/** What the board gave: the proposal, and the things each item became (by the item's id). */
export interface BoardProposal {
  proposal: Proposal;
  things: Record<string, string[]>;
}

/** What may be chosen: the items to decompose (all, when none), and the kind of thing for each item. */
export interface DecomposeOptions {
  selection?: readonly string[];
  kinds?: Readonly<Record<string, string>>;
  at?: string;
  shared?: string[];
}

/** The one of `values` given most often, the first such in order. */
function most(values: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | undefined;
  for (const [v, n] of counts) if (best === undefined || n > (counts.get(best) ?? 0)) best = v;
  return best;
}

/** A plain word from some words, for an id: `Tea break` is `tea_break`. Empty when they hold no letter. */
function idWord(text: string): string {
  let id = text
    .toLowerCase()
    .split(/[^a-z0-9]/)
    .filter(Boolean)
    .join('_');
  while (id && !/[a-z]/.test(id.charAt(0))) id = id.slice(1);
  return id;
}

/** A link's type from a connector's label, `works with` is `WORKS_WITH`; undefined when it is not plain words. */
const typeWord = (text: string | undefined) =>
  text && /^[A-Za-z][A-Za-z0-9 _-]*$/.test(text.trim())
    ? text
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_')
    : undefined;

const inside = (outer: Box, b: Box) =>
  b.x >= outer.x && b.y >= outer.y && b.x + b.w <= outer.x + outer.w && b.y + b.h <= outer.y + outer.h;

/** The words of an item as its lines: the lead, and the lines of a list when it holds at least two. */
function linesOf(item: BoardItem): { lead: string; list: string[] } {
  const rows = (item.text ?? '').split('\n');
  const list = rows.flatMap((r) => LIST_LINE.exec(r)?.[1]?.trim() ?? []);
  if (list.length < 2) return { lead: (item.text ?? '').trim(), list: [] };
  return {
    lead: rows
      .filter((r) => !LIST_LINE.test(r))
      .join(' ')
      .trim(),
    list,
  };
}

/**
 * What the board in `boardText` seems to say, offered as a proposal against the note as it is. Nothing is written.
 * It says so when there is nothing to offer.
 */
export function boardProposal(
  note: string,
  boardText: string,
  opts: DecomposeOptions = {},
): BoardProposal | { nothing: string } | { refused: string } {
  const { board } = readBoard(boardText);
  const graph = board.on;
  if (!graph) return { refused: word('board.decompose.free') };
  const texts = gqlBlocks(note).map((b) => b.text);
  const g = readNote(texts, undefined, opts.shared ?? []).world[graph];
  if (!g) return { refused: word('board.decompose.gone', { graph }) };
  const hidden = new Set(gs.SCHEMA_LABELS);
  const usualKind =
    most([...g.nodes.values()].flatMap(([labels]) => [...labels].filter((l) => !hidden.has(l)))) ?? 'Thing';
  const usualLink = most(g.edges.map((e) => e[1]));
  const held = new Set(g.edges.map(([s, type, t]) => `${s} ${type} ${t}`));
  const taken = new Set(g.nodes.keys());
  const chosen = new Set(opts.selection ?? board.items.map((i) => i.id));
  const things: Record<string, string[]> = {};
  const changes: ChangeInput[] = [];
  const freshId = (text: string): string | undefined => {
    const base = idWord(text);
    if (!base) return undefined;
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
    taken.add(id);
    return id;
  };
  const kindFor = (item: BoardItem) => {
    const k = opts.kinds?.[item.id];
    return k && KIND.test(k) ? k : usualKind;
  };
  // each item with words is a thing, and a list in it is several; an item linked already stands for its thing
  for (const item of board.items) {
    if (item.graph !== undefined && g.nodes.has(item.graph)) things[item.id] = [item.graph];
    if (!chosen.has(item.id) || item.graph !== undefined || !THINGS.has(item.kind)) continue;
    const { lead, list } = linesOf(item);
    const kind = kindFor(item);
    if (list.length) {
      for (const line of list) {
        const id = freshId(line);
        if (!id) continue;
        (things[item.id] ??= []).push(id);
        changes.push(
          thingChange(
            id,
            kind,
            { name: line },
            {
              group: `list: ${lead || item.id}`,
              reason: word('board.decompose.list', { item: item.id }),
            },
          ),
        );
      }
      continue;
    }
    const id = lead ? freshId(lead) : undefined;
    if (!id) continue;
    things[item.id] = [id];
    changes.push(thingChange(id, kind, { name: lead }, { reason: word('board.decompose.item', { item: item.id }) }));
  }
  // a frame is a group: a cluster, and each item inside it a member
  for (const frame of board.items.filter((i) => i.kind === 'Frame' && chosen.has(i.id) && i.graph === undefined)) {
    const label = (frame.text ?? '').trim();
    const id = label ? freshId(label) : undefined;
    if (!id) continue;
    const box = itemBox(frame);
    const reason = { reason: word('board.decompose.frame', { item: frame.id }) };
    things[frame.id] = [id];
    changes.push(thingChange(id, 'Cluster', { name: label }, reason));
    for (const item of board.items)
      if (item.id !== frame.id && item.kind !== 'Frame' && inside(box, itemBox(item)))
        for (const member of things[item.id] ?? []) changes.push(linkChange(member, 'MEMBER_OF', id, {}, reason));
  }
  // a connector between two items is a link between the first thing of each
  for (const c of board.connectors) {
    const [from, to] = [things[c.from]?.[0], things[c.to]?.[0]];
    const type = typeWord(c.label) ?? usualLink ?? 'RELATES_TO';
    if (!from || !to || from === to || held.has(`${from} ${type} ${to}`)) continue;
    if (!chosen.has(c.from) && !chosen.has(c.to)) continue;
    held.add(`${from} ${type} ${to}`);
    changes.push(
      linkChange(from, type, to, {}, { reason: word('board.decompose.connector', { from: c.from, to: c.to }) }),
    );
  }
  if (!changes.length) return { nothing: word('board.decompose.nothing') };
  const proposal = makeProposal({
    id: proposalId(BOARD_PROPOSER, texts),
    graph,
    by: { name: BOARD_PROPOSER, kind: 'step' },
    at: opts.at ?? null,
    read: [board.name],
    basis: basisOf(note, graph, opts.shared),
    changes,
  });
  return 'refused' in proposal ? proposal : { proposal, things };
}
