// Live cards on a board (editor spec §45, graph_on_board, board_relations_drawn; B2). A card is a board item that names
// a thing of the board's graph. It holds no copy of the thing. What it shows is read from the graph each time, so it
// stays in step with every edit. Editing a card is a change to the thing, offered as any change is (ES§17).
// - A card shows the thing's name, its kind and its other properties, as the graph holds them now.
// - A card whose thing is gone says so, and stays on the board (board_link_kept).
// - The links between things on the board are drawn as connectors in a style of their own. One switch shows or hides
//   them all. They are drawn from the graph and never written into the board.
// Host-free and pure.
import gs from '@thoughtknot/graph-spec';
import type { Value } from '@thoughtknot/graph-spec';
import { gqlBlocks } from './blocks.ts';
import { readBoard } from './board.ts';
import type { Connector } from './board.ts';
import { readNote } from './drawing.ts';
import { valueGql } from './proposals.ts';
import type { ChangeInput } from './proposals.ts';

/** What a live card shows: its item, the thing it stands for, and that thing as the graph holds it now. */
export interface LiveCard {
  item: string;
  thing: string;
  /** False when the thing is gone from the graph. */
  there: boolean;
  name: string;
  kind: string;
  /** The thing's other properties, as text, in the order the graph holds them. */
  properties: [string, string][];
}

/** A connector drawn from a link of the graph, in its own style. */
export interface RelationConnector extends Connector {
  /** The link's type, which is its label. */
  type: string;
  style: 'relation';
}

/** A property's value as text: words as they are, a number or flag as written, a date by its text, a list joined. */
function textOf(v: Value): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return Array.isArray(v) ? v.map(textOf).join(', ') : v instanceof gs.GTime ? v.s : '';
}

/** The graph a board is on, read from the note; undefined when the board is on none or the note lacks it. */
function graphOf(note: string, on: string | null) {
  return on ? readNote(gqlBlocks(note).map((b) => b.text)).world[on] : undefined;
}

/** The live cards of a board: one for each item that names a thing, read from the graph as it is now. */
export function liveCards(note: string, boardText: string): LiveCard[] {
  const { board } = readBoard(boardText);
  const g = graphOf(note, board.on);
  return board.items.flatMap((item): LiveCard[] => {
    if (item.graph === undefined) return [];
    const node = g?.nodes.get(item.graph);
    if (!node) return [{ item: item.id, thing: item.graph, there: false, name: item.graph, kind: '', properties: [] }];
    const [labels, props] = node;
    const hidden = new Set(gs.SCHEMA_LABELS);
    const name = typeof props.name === 'string' ? props.name : item.graph;
    return [
      {
        item: item.id,
        thing: item.graph,
        there: true,
        name,
        kind: [...labels].find((l) => !hidden.has(l)) ?? '',
        properties: Object.entries(props)
          .filter(([k]) => k !== 'name' && k !== 'id')
          .map(([k, v]) => [k, textOf(v)]),
      },
    ];
  });
}

/** The change an edit of a card makes: the property of its thing set, to be accepted as any change is. */
export function cardEdit(boardText: string, item: string, key: string, value: string): ChangeInput | undefined {
  const thing = readBoard(boardText).board.items.find((i) => i.id === item)?.graph;
  return thing === undefined ? undefined : { op: 'set', thing, key, value: valueGql(value) };
}

/**
 * The links of the graph between things that are on the board, as connectors between their items. With `show` off there
 * are none. They are never written into the board: the graph holds the links.
 */
export function relationConnectors(note: string, boardText: string, show = true): RelationConnector[] {
  if (!show) return [];
  const { board } = readBoard(boardText);
  const g = graphOf(note, board.on);
  if (!g) return [];
  const itemOf = new Map<string, string>();
  for (const item of board.items)
    if (item.graph !== undefined && !itemOf.has(item.graph)) itemOf.set(item.graph, item.id);
  return g.edges.flatMap(([from, type, to]) => {
    const [a, b] = [itemOf.get(from), itemOf.get(to)];
    return a && b && a !== b ? [{ from: a, to: b, label: type, type, style: 'relation' as const }] : [];
  });
}
