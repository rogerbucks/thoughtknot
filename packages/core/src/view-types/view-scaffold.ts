// Views as scaffolds (editor spec §36, views_as_scaffolds; provisional). A view can say what a complete version of it
// needs: the fields each thing should carry. The view is drawn from what is there. Each field a thing lacks is drawn
// as a prompt beside it. Filling a prompt writes that field into the graph, so filling the gaps is capture.
//
// It is a part of its own, so it can be replaced. A role's lens, such as finance or a work-back schedule, is one more
// list of needs.
//
// A key never holds a new line, so the ids this joins with one never meet a thing's key.
import type { DrawMark } from '../drawing-marks.ts';
import { setProperty, type Edit } from '../inspector.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import type { ShapeThing } from '../types-shape.ts';
import { word, type WordKey } from '../words.ts';
import { spanOf } from './plan-view.ts';
import type { ViewType } from './view-types.ts';

/** A field a complete view needs on each thing. `or` names fields that stand in for it, such as `due` for `end`. */
export interface ViewNeed {
  field: string;
  or?: string[];
  /** Only things of one of these kinds need it. Every thing does when it is left out. */
  kinds?: string[];
  /** Only things this says yes to need it, judged among all the things drawn. */
  when?: (t: ShapeThing, things: ShapeThing[]) => boolean;
  /** Another way the thing already has it, such as a date the view reads as its start. */
  met?: (t: ShapeThing) => boolean;
}

/** A field a thing lacks. */
export interface ViewGap {
  thing: string;
  field: string;
}

/**
 * Whether `t` is of a kind some dated thing is, so a person or a note in a plan is not asked for dates. When nothing
 * has a date yet, every thing is asked.
 */
function datedKind(t: ShapeThing, things: ShapeThing[]): boolean {
  const dated = things.filter((o) => o.date !== undefined);
  return !dated.length || dated.some((o) => o.kinds.some((k) => t.kinds.includes(k)));
}

/** Whether the plan reads `t` as more than one day, so it has an end. */
function longer(t: ShapeThing): boolean {
  const span = spanOf(t);
  return span !== null && span[0] !== span[1];
}

/** What each view type needs to be complete. A view type not listed needs nothing more than its things and links. */
export const VIEW_NEEDS: Partial<Record<ViewType, ViewNeed[]>> = {
  // as the plan reads its dates (spanOf): any date is a start, and a span of more than one day has an end
  plan: [
    { field: 'start', when: datedKind, met: (t) => spanOf(t) !== null },
    { field: 'end', or: ['due'], when: datedKind, met: longer },
  ],
};

/** What the plan says when nothing has a date yet. */
export const PLAN_EMPTY: ScaffoldEmpty = { says: 'scaffold.plan-empty', button: 'scaffold.add-dates' };

/** The size a prompt is drawn at. */
const PROMPT_SIZE = 10;

/** Whether `t` carries the field `f`, as a date or a number. */
const carries = (t: ShapeThing, f: string): boolean => !!(t.dates?.has(f) || t.numbers?.has(f));

/** The fields each thing lacks for `needs`, in the order of the things, then of the needs. */
export function gapsOf(things: ShapeThing[], needs: ViewNeed[]): ViewGap[] {
  return things.flatMap((t) =>
    needs
      .filter((n) => !n.kinds || n.kinds.some((k) => t.kinds.includes(k)))
      .filter((n) => !n.when || n.when(t, things))
      .filter((n) => !n.met?.(t) && ![n.field, ...(n.or ?? [])].some((f) => carries(t, f)))
      .map((n) => ({ thing: t.key, field: n.field })),
  );
}

/** What a view says when no thing has any field it needs: one line, and one button on its first thing. */
interface ScaffoldEmpty {
  says: WordKey;
  button: WordKey;
}

/**
 * Instead of a wall of prompts, when every thing lacks every field (plan_undated_calm): one line for the drawing, and
 * one button beside the first thing. The button is that thing's, so a tap opens it, where its fields are written.
 */
function emptyMarks(given: DiagramGiven, first: DrawMark | undefined, key: string, none: ScaffoldEmpty): DrawMark[] {
  const { width, height } = given.space;
  const says = word(none.says),
    add = word(none.button);
  const x = first && 'x' in first ? Math.min(first.x + ('width' in first ? first.width : 0) + 8, width) : 0;
  const y = first && 'y' in first ? Math.min(first.y + ('width' in first ? PROMPT_SIZE : 0), height) : PROMPT_SIZE;
  const wide = add.length * PROMPT_SIZE * 0.6 + 8;
  const common = { size: PROMPT_SIZE, anchor: 'start', z: 1 } as const;
  return [
    { id: 'prompt\nempty', kind: 'label', style: 'prompt.empty', x: 0, y: height, text: says, name: says, ...common },
    {
      id: `prompt\n${key}\nbutton.box`,
      kind: 'box',
      style: 'link.outline',
      of: key,
      x: Math.min(x, Math.max(width - wide, 0)),
      y: Math.max(y - PROMPT_SIZE, 0),
      width: wide,
      height: PROMPT_SIZE + 4,
      z: 1,
    },
    {
      id: `prompt\n${key}\nbutton`,
      kind: 'label',
      style: 'prompt.button',
      of: key,
      x: Math.min(x, Math.max(width - wide, 0)) + 4,
      y: Math.max(y - PROMPT_SIZE, 0) + PROMPT_SIZE,
      text: add,
      name: add,
      ...common,
    },
  ];
}

/**
 * The view's marks with a prompt for each gap. A prompt is a label beside the thing's mark. It sits at the bottom when
 * the view draws no mark for the thing. Each prompt names the field and the thing, for a screen reader too.
 */
export function scaffoldMarks(
  given: DiagramGiven,
  drawn: DrawMark[],
  needs: ViewNeed[],
  none?: ScaffoldEmpty,
): DrawMark[] {
  const things = given.shape.things;
  const gaps = gapsOf(things, needs);
  if (!gaps.length) return drawn;
  const text = new Map(things.map((t) => [t.key, t.text]));
  // the box a view draws for a thing, else its name's label
  const shown = new Map(drawn.filter((m) => m.id === m.of || m.id === `${m.of}\nlabel`).map((m) => [m.of, m]));
  if (none && things.length > 1 && gaps.length === things.length * needs.length)
    return [...drawn, ...emptyMarks(given, shown.get(things[0]?.key ?? ''), things[0]?.key ?? '', none)];
  const count = new Map<string, number>();
  let under = 0;
  const prompts = gaps.map((g): DrawMark => {
    const says = word('scaffold.prompt', { field: g.field, thing: text.get(g.thing) ?? g.thing });
    const n = count.get(g.thing) ?? 0;
    count.set(g.thing, n + 1);
    const m = shown.get(g.thing);
    // beside the thing, kept inside the space; else stacked up from the bottom
    const { width, height } = given.space;
    const at =
      m && 'x' in m && 'y' in m
        ? {
            x: Math.min(m.x + ('width' in m ? m.width : 0) + 4, width),
            // a box's y is its top, a label's its line
            y: Math.min(m.y + ('width' in m ? PROMPT_SIZE : 0) + n * PROMPT_SIZE, height),
          }
        : { x: 0, y: Math.max(height - under++ * PROMPT_SIZE, 0) };
    return {
      id: `prompt\n${g.thing}\n${g.field}`,
      kind: 'label',
      style: 'prompt',
      of: g.thing,
      ...at,
      text: says,
      size: PROMPT_SIZE,
      anchor: 'start',
      name: says,
      z: 1,
    };
  });
  return [...drawn, ...prompts];
}

/** The block with a gap filled: `gql` written as the thing's field. It is an edit like any other, undone as one. */
export function fillGap(block: string, graph: string, gap: ViewGap, gql: string): Edit {
  return setProperty(block, graph, { thing: gap.thing }, gap.field, gql);
}
