// One-line hints and the arrow legend, in the level badge (editor spec §68, level_hints). The UX review, 3 Nov 2026:
// tips four lines long are not read. So each level gets one short hint, shown the first time it shows, then gone. While
// roads show, the badge also says what their arrows mean: → out, ← in, ⇄ both.
import { word } from '../../words.ts';

/** The hint for each kind of level: the farthest, one between, and the last, where every item shows. */
const HINTS = { far: 'levels.hint-far', mid: 'levels.hint-mid', near: 'levels.hint-near' } as const;

/** The hints already shown, once each while the app runs. */
const said = new Set<string>();

/** Lets every hint show again, as when the app starts. */
export const forgetHints = (): void => said.clear();

/** The hint and the arrow legend of one card's badge. */
export class LevelHints {
  private readonly hint: HTMLElement;
  private readonly arrows: HTMLElement;
  /** The level the hint was shown for, so it goes once the level changes. */
  private shownFor: string | null = null;

  /** Made inside `parent`, the badge. */
  constructor(parent: HTMLElement) {
    this.hint = parent.createDiv({ cls: 'thoughtknot-level-hint is-hidden', attr: { role: 'status' } });
    this.arrows = parent.createDiv({ cls: 'thoughtknot-level-arrows is-hidden', text: word('levels.arrows') });
  }

  /** The level shown now, `at` of `count`, or none: its hint the first time, and the arrows while roads show. */
  show(shown: { at: number; count: number } | null): void {
    const roads = !!shown && shown.at < shown.count - 1;
    this.arrows.toggleClass('is-hidden', !roads);
    const kind = !shown ? null : !roads ? 'near' : shown.at === 0 ? 'far' : 'mid';
    if (kind === this.shownFor) return;
    this.shownFor = kind;
    const fresh = !!kind && !said.has(kind);
    if (fresh) said.add(kind);
    this.hint.setText(fresh ? word(HINTS[kind]) : '');
    this.hint.toggleClass('is-hidden', !fresh);
  }
}
