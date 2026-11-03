// Names for groups found by links (editor spec §60, discover_group_names). An AI may suggest a name and a one-line
// summary for each group. A suggestion only waits in the review lens: it changes nothing until a person applies it.
// Applying one writes the name into the group's things and returns the new graph; the graph given is never changed.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';

/** A group found by its links: an id and its things. */
export interface FoundGroup {
  id: string;
  things: string[];
}

/** What an AI suggests for one group. It may be anything, so it is checked. */
export interface Suggested {
  name?: unknown;
  summary?: unknown;
}

/** A suggestion waiting in the review lens. */
export interface GroupNameProposal {
  group: string;
  name: string;
  summary: string;
  status: 'waiting';
}

const LONGEST = { name: 60, summary: 140 };
const plain = (v: unknown, most: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= most;

/** The suggestions that pass the check, each waiting. A name or summary too long, empty or not text is dropped. */
export function proposeGroupNames(
  groups: readonly FoundGroup[],
  suggest: (g: FoundGroup) => Suggested,
): GroupNameProposal[] {
  const out: GroupNameProposal[] = [];
  for (const g of groups) {
    const s = suggest(g);
    if (plain(s.name, LONGEST.name) && plain(s.summary, LONGEST.summary))
      out.push({ group: g.id, name: s.name.trim(), summary: s.summary.trim(), status: 'waiting' });
  }
  return out;
}

/** The graph with one proposal applied: each thing of the group gets the group's name and summary. */
export function applyGroupName(g: Graph, group: FoundGroup, proposal: GroupNameProposal): Graph {
  const mine = new Set(group.things);
  const nodes = new Map(
    [...g.nodes].map(([id, [labels, props]]) => [
      id,
      [labels, mine.has(id) ? { ...props, group_name: proposal.name, group_summary: proposal.summary } : props] as [
        Set<string>,
        typeof props,
      ],
    ]),
  );
  return new gs.Graph(nodes, g.edges);
}
