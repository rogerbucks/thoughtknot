// Grouping a drawing by what its things say (editor spec §25, untangle_group_by). Roger, 24 Oct 2026: "Group by" a
// property, or none, in 2D and 3D alike. A card groups its things as written or found from their links, until the
// person picks another way from the View menu. They can pick no groups at all, or one group for each value of a
// property its things share, kind among them. The 3D view reads the groups from the 2D drawing, so both show the same.
import { propertiesOf } from './inspector.ts';
import type { GraphDrawing, NoteReading } from './note-reading.ts';

/** How a card groups its things: none (null), or by each thing's value of one choice (`groupChoices`), by thing. */
export type GroupBy = null | { by: string; values: ReadonlyMap<string, string> };

/** The choice that groups things by their kind: no property is named so. */
export const BY_KIND = ':kind';

/** The most groups a property may make and still be offered. Past it, its values name things rather than sort them. */
const MOST_GROUPS = 12;

/** Each thing's property values of drawing `d`, by property, then by thing. */
function valuesOf(reading: NoteReading, d: GraphDrawing): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const b of d.boxes)
    for (const p of propertiesOf(reading, d.graph, { thing: b.key })) {
      const of = out.get(p.key) ?? new Map<string, string>();
      of.set(b.key, p.value);
      out.set(p.key, of);
    }
  return out;
}

/** Whether `values` sort things into groups: two to MOST_GROUPS of them, and some value two things share. */
function sorts(values: Iterable<string>): boolean {
  const count = new Map<string, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  return count.size >= 2 && count.size <= MOST_GROUPS && [...count.values()].some((n) => n > 1);
}

/** What drawing `d`'s things can be grouped by: kind first, where it sorts them, then each property that does, by name. */
export function groupChoices(reading: NoteReading, d: GraphDrawing): string[] {
  const kinds = sorts(d.boxes.map((b) => b.kind)) ? [BY_KIND] : [];
  const props = [...valuesOf(reading, d)].filter(([, of]) => sorts(of.values())).map(([key]) => key);
  return [...kinds, ...props.sort()];
}

/** Each thing of drawing `d`'s value of the choice `by`: its kind, or its property of that name where it has one. */
export function groupValues(reading: NoteReading, d: GraphDrawing, by: string): Map<string, string> {
  if (by === BY_KIND) return new Map(d.boxes.map((b) => [b.key, b.kind]));
  return valuesOf(reading, d).get(by) ?? new Map<string, string>();
}

/** The groups `by` makes of `keys`, as drawnGroups gives them: each value in the order first met, with its things. */
export function groupsBy(by: Exclude<GroupBy, null>, keys: readonly string[]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  for (const k of keys) {
    const v = by.values.get(k);
    if (v !== undefined && v !== '') groups.set(v, [...(groups.get(v) ?? []), k]);
  }
  return [...groups];
}
