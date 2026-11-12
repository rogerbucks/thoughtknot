// Levels named by your AI or by you (editor spec §68, ai_levels). Roger, 3 Nov 2026: your AI names the subjects, areas
// and topics. Once a person keeps them, they are three plain properties of each thing: subject, area and topic. So
// they are saved in the note, undone in one step like any applied change, and held in the index.
//
// Where any thing has a subject, an area or a topic, the levels come from them instead of from the links. Each level
// groups the things by their names so far, so every group nests in one a level out. A thing with no name for a level
// goes in a group of its own. Nothing moves: levels only choose what is shown. Host-free and pure.
//
// Until then your AI's names stay in the note's AI block (ai-block.ts, ai_block_not_data). They are used only where
// no thing has a name of the person's own. Those levels are marked as named by AI, so they never read as the person's.
import { everyItem } from './detail-levels.ts';
import type { DetailLevel, LevelGroup } from './detail-levels.ts';
import type { GraphShape } from './types-shape.ts';
import { word } from './words.ts';

/** The properties that name the levels, far to near. */
export const ALTITUDES = ['subject', 'area', 'topic'] as const;
/** The name of the level each property makes. */
const LEVEL_WORDS = ['levels.subjects', 'levels.areas', 'levels.topics'] as const;

/**
 * The levels the names of `shape`'s things make, far to near, the last where every item shows. Null when no thing has
 * a name for any level, so the levels found from the links are shown.
 */
export function namedLevels(shape: GraphShape): DetailLevel[] | null {
  const own = levelsNamed(shape);
  if (own || !shape.aiLevels?.size) return own;
  const ai = shape.aiLevels;
  const things = shape.things.map((t) => ({
    ...t,
    texts: new Map(Object.entries(ai.get(t.key) ?? {}).filter((e): e is [string, string] => !!e[1])),
  }));
  const levels = levelsNamed({ ...shape, things });
  if (!levels) return null;
  return levels.map((l, i) =>
    i < levels.length - 1 ? { ...l, name: word('levels.by-ai', { name: l.name }), byAi: true } : l,
  );
}

/** The levels the person's own names make, as `namedLevels` gives them; null when no thing has one. */
function levelsNamed(shape: GraphShape): DetailLevel[] | null {
  const named = ALTITUDES.map((a, i) => [a, i] as const).filter(([a]) =>
    shape.things.some((t) => !!t.texts?.get(a)?.trim()),
  );
  if (!named.length) return null;
  const path = new Map(shape.things.map((t) => [t.key, '']));
  const levels: DetailLevel[] = named.map(([a, i]) => {
    const groups = new Map<string, LevelGroup>();
    const name = word(LEVEL_WORDS[i] as (typeof LEVEL_WORDS)[number]);
    for (const t of shape.things) {
      const value = t.texts?.get(a)?.trim() ?? '',
        parent = path.get(t.key) ?? '',
        key = `${parent}|${a}=${value}`;
      const g = groups.get(key) ?? {
        key,
        name: value || word('levels.none', { name: a }),
        things: [],
        ...(parent ? { parent } : {}),
      };
      g.things.push(t.key);
      groups.set(key, g);
      path.set(t.key, key);
    }
    return { name, groups: [...groups.values()] };
  });
  return [...levels, { name: everyItem(), groups: [] }];
}
