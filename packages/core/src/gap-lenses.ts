// Ready-made lenses for finding gaps in a large graph (editor spec §60, discover_gap_lenses). Each one reads the graph
// and names the things it finds, never changing it: things with nothing linked, things missing a property their kind
// needs, numbers far from their kind's usual, stale things, and names that nearly match.
import type { Graph } from '@thoughtknot/graph-spec';

/** A thing a gap lens found, and why in a few words. */
export interface Gap {
  thing: string;
  why: string;
}

const DAY = 24 * 60 * 60 * 1000;
/** A thing not touched for this many days is stale. */
export const STALE_DAYS = 180;
/** A kind needs a property when at least this share of its things have it (when no schema says so). */
const USUAL = 0.75;
/** A number is unusual when it is this many spreads from the middle of its kind's numbers. */
const SPREADS = 3;

const kindOf = (g: Graph, id: string) => [...g.nodes.get(id)![0]][0] ?? '';
const nameOf = (g: Graph, id: string) => (typeof g.p(id).name === 'string' ? (g.p(id).name as string) : id);

/** Things with no link in or out. */
export function unlinked(g: Graph): Gap[] {
  const linked = new Set(g.edges.flatMap(([from, , to]) => [from, to]));
  return [...g.nodes.keys()].filter((id) => !linked.has(id)).map((thing) => ({ thing, why: 'nothing linked' }));
}

/** Things missing a property `needs` names for their kind, or else one most things of their kind have. */
export function missingNeeds(g: Graph, needs: Readonly<Record<string, readonly string[]>> = {}): Gap[] {
  const byKind = new Map<string, string[]>();
  for (const id of g.nodes.keys()) byKind.set(kindOf(g, id), [...(byKind.get(kindOf(g, id)) ?? []), id]);
  const out: Gap[] = [];
  for (const [kind, ids] of byKind) {
    const keys = new Set(ids.flatMap((id) => Object.keys(g.p(id))));
    const wanted =
      needs[kind] ?? [...keys].filter((k) => ids.filter((id) => g.p(id)[k] !== undefined).length / ids.length >= USUAL);
    for (const id of ids) for (const k of wanted) if (g.p(id)[k] === undefined) out.push({ thing: id, why: `no ${k}` });
  }
  return out;
}

/** Numbers far from the middle of the same property among things of their kind. Needs four numbers to judge. */
export function unusualNumbers(g: Graph): Gap[] {
  const groups = new Map<string, [string, number][]>();
  for (const id of g.nodes.keys())
    for (const [k, v] of Object.entries(g.p(id)))
      if (typeof v === 'number')
        groups.set(`${kindOf(g, id)}\u0000${k}`, [...(groups.get(`${kindOf(g, id)}\u0000${k}`) ?? []), [id, v]]);
  const out: Gap[] = [];
  for (const [group, rows] of groups) {
    if (rows.length < 4) continue;
    const sorted = rows.map((r) => r[1]).sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)]!;
    const spread =
      [...sorted.map((n) => Math.abs(n - mid))].sort((a, b) => a - b)[Math.floor(sorted.length / 2)]! || 1e-9;
    for (const [id, n] of rows)
      if (Math.abs(n - mid) / spread > SPREADS)
        out.push({ thing: id, why: `${group.split('\u0000')[1]} ${n} is unusual` });
  }
  return out;
}

/** Things whose `updated` date is more than STALE_DAYS before `now`. */
export function stale(g: Graph, now: string): Gap[] {
  return [...g.nodes.keys()]
    .filter((id) => {
      const u = g.p(id).updated;
      const at = typeof u === 'string' ? Date.parse(u) : NaN;
      return !Number.isNaN(at) && Date.parse(now) - at > STALE_DAYS * DAY;
    })
    .map((thing) => ({ thing, why: 'not touched for months' }));
}

/** Names with the same letters once case, spaces and marks are dropped, or one letter apart when long enough. */
export function nearDuplicates(g: Graph): Gap[] {
  const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const ids = [...g.nodes.keys()];
  const out: Gap[] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = squash(nameOf(g, ids[i]!));
      const b = squash(nameOf(g, ids[j]!));
      if (a && (a === b || (a.length >= 6 && oneApart(a, b)))) out.push({ thing: ids[i]!, why: `like ${ids[j]}` });
    }
  return out;
}

/** Whether two strings differ by one inserted, dropped or changed letter. */
function oneApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const rest = (s: string, n: number) => s.slice(n);
  return rest(a, i + 1) === rest(b, i + 1) || rest(a, i + 1) === rest(b, i) || rest(a, i) === rest(b, i + 1);
}
