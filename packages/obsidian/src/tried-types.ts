// The diagram types looked at in reading view, never saved (spec §15, type_try_reading). One for each graph or view of
// each note, held until Obsidian closes, as the View menu's switches are. A card is drawn as the type held, if any. It
// says it is not saved, and where the note is edited offers to keep it. Choosing a type there saves it and forgets this.
// The rules tried in reading view are held the same way (§56, rule_look_try_save). A rule saved where the note is
// edited is written into the style graph, and the rules tried there are forgotten.
import { diagramFor, withTriedRules, word } from '@thoughtknot/core';
import type { DiagramWrite, GraphDrawing, NoteReading, RuleAsk, RuleWrite, StyleGraph } from '@thoughtknot/core';
import type ThoughtKnotPlugin from './main';
import { writeStyle } from './view-block';
import { pickedCentre, withTried } from '@thoughtknot/core/display/graph-view/type-strip';
import type { Trying, TypeLeftAt } from '@thoughtknot/core/display/graph-view/type-strip';
import type { Stay } from '@thoughtknot/core/display/graph-view/view-options';
import type { StayedAt } from '@thoughtknot/core/display/graph-view/type-place';

/** How long where a card was left waits for the card drawn as its new type: a type saved draws it once written. */
const LEFT_FOR_MS = 10_000;

/** Where a type is looked at: the note, its graph, and the view, if the card shows one. */
export interface TriedAt {
  path: string;
  graph: string;
  view?: string;
}

/** The types looked at, and the cards to draw again when one changes. */
export class TriedTypes {
  private readonly held = new Map<string, DiagramWrite>();
  private readonly watchers = new Set<(path: string) => void>();
  /** Where each card was left as its type changed, and when (§15, type_keeps_place). */
  private readonly left = new Map<string, { at: TypeLeftAt; when: number }>();
  /** Where each card was left as it went, and when, for the card drawn again in its place (NEURO-7). */
  private readonly stayed = new Map<string, { at: StayedAt; when: number }>();
  /** The rules tried where each card is, in the order tried (§56). */
  private readonly rules = new Map<string, RuleWrite[]>();

  constructor(private readonly plugin?: ThoughtKnotPlugin) {}

  private static key(at: TriedAt): string {
    return [at.path, at.graph, at.view ?? ''].join('\u0000');
  }

  /** The type looked at where `at` says, or undefined. */
  of(at: TriedAt): DiagramWrite | undefined {
    return this.held.get(TriedTypes.key(at));
  }

  /** Looks at `change` where `at` says, or, given null, goes back to the saved type; then draws its note's cards again. */
  set(at: TriedAt, change: DiagramWrite | null): void {
    if (change) this.held.set(TriedTypes.key(at), change);
    else if (!this.held.delete(TriedTypes.key(at))) return;
    for (const changed of [...this.watchers]) changed(at.path);
  }

  /** Tries `rule` where `at` says, after those tried there, or with none goes back to the saved rules; draws again. */
  tryRule(at: TriedAt, rule: RuleWrite | null): void {
    const key = TriedTypes.key(at),
      now = this.rules.get(key) ?? [];
    if (rule) this.rules.set(key, [...now.filter((r) => r.means !== rule.means), rule]);
    else if (!this.rules.delete(key)) return;
    for (const changed of [...this.watchers]) changed(at.path);
  }

  /** What a card at `at` may do with a rule: try it, save it where the note is edited, or go back to those saved. */
  private ruleAsk(at: TriedAt): RuleAsk {
    return {
      tried: this.rules.has(TriedTypes.key(at)),
      tryOut: (rule) => this.tryRule(at, rule),
      back: () => this.tryRule(at, null),
      save: (rule) => {
        this.rules.delete(TriedTypes.key(at)); // saved: no longer only tried
        if (this.plugin) void writeStyle(this.plugin, at.path, at.graph, { rule }, word('rules.saved'));
      },
    };
  }

  /** Forgets the type looked at where `at` says, drawing nothing again: for a type about to be saved. */
  forget(at: TriedAt): void {
    this.held.delete(TriedTypes.key(at));
  }

  /** Keeps where the card at `at` is, as its type changes, for the card drawn next. */
  leave(at: TriedAt, where: TypeLeftAt): void {
    this.left.set(TriedTypes.key(at), { at: where, when: Date.now() });
  }

  /** Where the card at `at` was left as its type changed, once, unless it waited too long for its card. */
  kept(at: TriedAt): TypeLeftAt | undefined {
    const key = TriedTypes.key(at),
      left = this.left.get(key);
    this.left.delete(key);
    return left && Date.now() - left.when <= LEFT_FOR_MS ? left.at : undefined;
  }

  /**
   * Where the card of a graph's block, its fence on `line`, is left as it goes. The card drawn again in its place, as
   * typing redraws it, stays there: its zoom, its camera in space, its boxes (NEURO-7, redraw_keeps_place).
   */
  stay(at: TriedAt, line: number): Stay {
    const key = `${TriedTypes.key(at)}\u0000${line}`;
    return {
      leave: (where) => this.stayed.set(key, { at: where, when: Date.now() }),
      kept: () => {
        const left = this.stayed.get(key);
        this.stayed.delete(key);
        return left && Date.now() - left.when <= LEFT_FOR_MS ? left.at : undefined;
      },
    };
  }

  /** Draws the cards of the note at `path` again, as a type looked at does. */
  drawAgain(path: string): void {
    for (const changed of [...this.watchers]) changed(path);
  }

  /** Calls `changed` with the note's path whenever a type is looked at or put back; gives what stops it. */
  watch(changed: (path: string) => void): () => void {
    this.watchers.add(changed);
    return () => this.watchers.delete(changed);
  }

  /**
   * The style to draw `drawing` with where `at` says: as saved, or with the type looked at and the rules tried. It
   * comes with how its card looks at a type, for `diagramShown`, and what it may do with a rule (§56).
   */
  styleFor(
    at: TriedAt,
    drawing: Pick<GraphDrawing, 'boxes' | 'links' | 'estimates'>,
    style: StyleGraph,
    g: NoteReading['world'][string] | undefined,
  ): { style: StyleGraph; trying: Trying; ask: RuleAsk } {
    const tried = this.of(at),
      saved = diagramFor(drawing, style, g, at.view).drawn,
      centre = saved === 'radial' ? pickedCentre(style, at.view) : undefined;
    return {
      style: withTriedRules(tried ? withTried(style, tried) : style, this.rules.get(TriedTypes.key(at)) ?? []),
      ask: this.ruleAsk(at),
      trying: {
        saved,
        ...(centre === undefined ? {} : { savedCentre: centre }),
        tried: !!tried,
        tryOut: (change) => this.set(at, change),
        leave: (where) => this.leave(at, where),
        kept: () => this.kept(at),
      },
    };
  }
}
