// Your own level of detail (editor spec §68, own_levels). Roger, 3 Nov 2026: a level of your own, such as status, sits
// on top of the found ones (Status, then Subjects, then items). A button swaps the order, and a level that splits
// nothing is left out.
//
// The own level groups things by one of their values: their kind, or a property such as status. It goes in at a place
// among the found levels (detail-levels.ts), first by default. Each found group below it splits by that value, so every
// group still nests in one a level out. A thing with no value goes in a group of its own. Nothing moves: levels only
// choose what is shown. Host-free and pure.
import type { DetailLevel, LevelGroup } from './detail-levels.ts';
import type { GraphShape } from './types-shape.ts';

/** The value that groups things by their kind rather than a property. */
export const BY_KIND = 'kind';

/** Which own level to add: the value it groups by, and its place among the levels, 0 for first. */
export interface OwnLevel {
  by: string;
  at: number;
}

/** The value of `by` on each thing of `shape`: its first kind, or its property's text; empty where it has none. */
function valuesOf(shape: GraphShape, by: string): Map<string, string> {
  return new Map(shape.things.map((t) => [t.key, (by === BY_KIND ? t.kinds[0] : t.texts?.get(by)) ?? '']));
}

/** The values the things of `shape` take for `by`, each once, in the order first met. */
export function ownValues(shape: GraphShape, by: string): string[] {
  return [...new Set(valuesOf(shape, by).values())];
}

/** The properties of `shape`'s things that could make a level: kind, then each text property, in the order met. */
export function ownChoices(shape: GraphShape): string[] {
  const names = new Set<string>([BY_KIND]);
  for (const t of shape.things) for (const k of t.texts?.keys() ?? []) names.add(k);
  return [...names];
}

/**
 * `levels` with the own level `own` put in, grouping `shape`'s things by its value. `name` names the level, and
 * `none` names the group of things with no value. The levels as they were when the value splits nothing.
 */
export function withOwnLevel(
  levels: readonly DetailLevel[],
  shape: GraphShape,
  own: OwnLevel,
  name: string,
  none: string,
): DetailLevel[] {
  const value = valuesOf(shape, own.by);
  if (new Set(value.values()).size < 2) return [...levels];
  const at = Math.max(0, Math.min(own.at, levels.length - 1));
  const piece = (key: string, v: string) => `${key}|=${v}`;
  // each group split by value: its pieces keep its name, under the piece of its parent with the same value
  const split = (g: LevelGroup): LevelGroup[] => {
    const by = new Map<string, string[]>();
    for (const t of g.things) by.set(value.get(t) ?? '', [...(by.get(value.get(t) ?? '') ?? []), t]);
    return [...by].map(([v, things]) => ({
      key: piece(g.key, v),
      name: g.name,
      things,
      parent: piece(g.parent ?? '', v),
    }));
  };
  // the own level: the things of each group one level out, split by value, or all the things for the first level
  const above =
    at === 0 ? [{ key: '', name: '', things: shape.things.map((t) => t.key) }] : (levels[at - 1]?.groups ?? []);
  const ownGroups = above.flatMap((g) => {
    const by = new Map<string, string[]>();
    for (const t of g.things) by.set(value.get(t) ?? '', [...(by.get(value.get(t) ?? '') ?? []), t]);
    return [...by].map(([v, things]): LevelGroup => ({
      key: piece(g.key, v),
      name: v || none,
      things,
      ...(at === 0 ? {} : { parent: g.key }),
    }));
  });
  return [
    ...levels.slice(0, at),
    { name, groups: ownGroups },
    ...levels.slice(at).map((l) => ({ name: l.name, groups: l.groups.flatMap(split) })),
  ];
}
