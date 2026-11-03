// An intent shown over any view (editor spec §58, intent_overlay). A person picks one of the graph's intents. Each thing
// drawn is then marked by how it pulls on it: it supports it, contradicts it, pulls both ways, or is not linked. Each
// mark has a badge and a line of its own beside its colour, so it is never told by colour alone. The overlay only marks:
// it moves nothing and writes nothing.
// It gives the same marks a style rule gives (rule-looks.ts), so every view that draws rules draws it too.
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing } from './note-reading.ts';
import type { RuleLegendEntry, RuleMark, RulesShown } from './rule-looks.ts';
import type { Badge } from './rule-words.ts';
import type { LineStyle } from './style-graph.ts';
import { intentLinks, intentStanding } from './intents.ts';
import type { IntentStanding } from './intents.ts';
import { word } from './words.ts';

/** How a thing pulls on the intent shown. */
export type IntentPull = 'supports' | 'contradicts' | 'contested' | 'unlinked';

/** Each pull's mark: its style token, its badge, its line and, for all but not linked, its hue. */
export const INTENT_MARKS: Readonly<
  Record<IntentPull, { token: string; badge: Badge; line: LineStyle; hue?: string }>
> = {
  supports: { token: 'intent.supports', badge: 'up', line: 'bold', hue: 'green' },
  contradicts: { token: 'intent.contradicts', badge: 'down', line: 'dashed', hue: 'red' },
  contested: { token: 'intent.contested', badge: 'question', line: 'dotted', hue: 'orange' },
  unlinked: { token: 'intent.unlinked', badge: 'dot', line: 'solid' },
};

/** What a card may do with the graph's intents: each one to pick, the one shown, and how to pick another or none. */
export interface IntentAsk {
  choices: { id: string; says: string }[];
  chosen: string | null;
  /** The standing of the one shown, in words. */
  said?: string;
  /** Shows `intent` over the drawing, or none; only draws, never writes. */
  choose(intent: string | null): void;
}

/** The order the legend lists the pulls in. */
const PULLS: readonly IntentPull[] = ['supports', 'contradicts', 'contested', 'unlinked'];

/** What the overlay of one intent gives a drawing: each thing's mark, the legend, and the intent's standing. */
export interface IntentOverlay extends RulesShown {
  standing: IntentStanding;
}

/** The words of a pull, for the legend and a screen reader: `Supports: Out of the door by eight`. */
const meansOf = (pull: IntentPull, says: string): string => word(`intent.pull.${pull}`, { says });

/** How each thing pulls on `intent`, by its id: contested before either side, unlinked when it has no link. */
export function intentPulls(graph: Graph, intent: string): Map<string, IntentPull> {
  const standing = intentStanding(graph, intent);
  const pulls = new Map<string, IntentPull>();
  for (const l of intentLinks(graph, intent))
    if (!pulls.has(l.from)) pulls.set(l.from, l.contested ? 'contested' : l.side);
  for (const id of standing.unlinked) pulls.set(id, 'unlinked');
  return pulls;
}

/**
 * The overlay of `intent` on `drawing`: a mark for each thing drawn, by how it pulls on it. Its legend lists each pull
 * something drawn has. Links are left as they are, and nothing is moved.
 */
export function intentOverlay(graph: Graph, intent: string, drawing: Pick<GraphDrawing, 'boxes'>): IntentOverlay {
  const standing = intentStanding(graph, intent);
  const pulls = intentPulls(graph, intent);
  const things = new Map<string, RuleMark>();
  for (const box of drawing.boxes) {
    const pull = pulls.get(box.key);
    if (!pull) continue;
    const { token, badge, line, hue } = INTENT_MARKS[pull];
    things.set(box.key, {
      tokens: [token],
      badge,
      line,
      ...(hue ? { hue } : {}),
      means: [meansOf(pull, standing.says)],
    });
  }
  const shown = new Set([...things.keys()].map((k) => pulls.get(k)));
  const legend: RuleLegendEntry[] = PULLS.filter((p) => shown.has(p)).map((pull) => {
    const { token, badge, line, hue } = INTENT_MARKS[pull];
    return { token, badge, line, ...(hue ? { hue } : {}), means: meansOf(pull, standing.says) };
  });
  return { things, links: new Map(), legend, clashes: [], standing };
}

/**
 * The rules' looks with an intent's overlay on top. The overlay's badge, line and hue win where both set one, so the
 * intent shown is what a person reads first. Each keeps its tokens and meanings, the rules' first.
 */
export function withIntentOverlay(rules: RulesShown | undefined, overlay: RulesShown): RulesShown {
  if (!rules) return overlay;
  const things = new Map(rules.things);
  for (const [key, mark] of overlay.things) {
    const under = things.get(key);
    things.set(
      key,
      under
        ? { ...under, ...mark, tokens: [...under.tokens, ...mark.tokens], means: [...under.means, ...mark.means] }
        : mark,
    );
  }
  return { ...rules, things, legend: [...rules.legend, ...overlay.legend] };
}
