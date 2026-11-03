// The legend of subjects, under the level badge (editor spec §68, level_colours). Roger, 3 Nov 2026: the legend is the
// spotlight and a filter. Each subject has a chip with its colour and name:
// - pointing at a chip, or at a cloud, puts that subject in the spotlight while the pointer stays;
// - clicking a chip keeps it in the spotlight, and clicking it again lets it go;
// - the chip's colour button picks the subject's next colour, and its clouds take it at once.
// The chips are buttons, so the keyboard reaches them, and each says what it does. Nothing moves.
import type { DetailLevel } from '../../detail-levels.ts';
import { word } from '../../words.ts';
import { hueOf, nextHue, spotlight } from './level-colours.ts';

/** What the legend needs from its card. */
export interface LevelLegendHost {
  /** The card's viewport, where the pointer is followed over the clouds. */
  viewport: HTMLElement;
  svg: () => SVGSVGElement | null;
  /** Draws the clouds again, after a colour is picked. */
  redraw: () => void;
}

/** The legend of one card's subjects. */
export class LevelLegend {
  private readonly el: HTMLElement;
  private readonly host: LevelLegendHost;
  private levels: readonly DetailLevel[] | null = null;
  /** The subject kept in the spotlight by a click, if any. */
  private kept: string | null = null;

  /** Made inside `parent`, the badge. */
  constructor(parent: HTMLElement, host: LevelLegendHost) {
    this.host = host;
    this.el = parent.createDiv({ cls: 'thoughtknot-level-legend', attr: { role: 'group' } });
    this.el.setAttribute('aria-label', word('levels.legend-label'));
    // pointing at a cloud spotlights its subject too, for as long as the pointer stays on it
    host.viewport.addEventListener('pointerover', (e: Event) => this.pointed(e.target));
  }

  /** Shows the chips of `levels`' subjects; none for a drawing of one level. */
  show(levels: readonly DetailLevel[] | null): void {
    if (levels === this.levels) return this.respot();
    this.levels = levels;
    this.kept = null;
    this.el.empty();
    const subjects = levels && levels.length > 1 ? (levels[0]?.groups ?? []) : [];
    this.el.toggleClass('is-hidden', !subjects.length);
    for (const g of subjects) {
      const chip = this.el.createEl('button', {
        cls: 'thoughtknot-level-chip',
        attr: { type: 'button', 'data-subject': g.key, 'aria-pressed': 'false' },
      });
      chip.createSpan({ cls: 'thoughtknot-level-swatch', attr: { 'data-hue': String(hueOf(levels ?? [], g.key)) } });
      chip.createSpan({ text: g.name });
      chip.addEventListener('pointerenter', () => this.spot(g.key));
      chip.addEventListener('pointerleave', () => this.spot(this.kept));
      chip.addEventListener('focus', () => this.spot(g.key));
      chip.addEventListener('blur', () => this.spot(this.kept));
      chip.addEventListener('click', () => this.keep(g.key));
      const colour = this.el.createEl('button', {
        cls: 'thoughtknot-level-colour',
        text: '◐',
        attr: { type: 'button', 'aria-label': word('levels.colour-label', { name: g.name }) },
      });
      colour.addEventListener('click', () => this.recolour(g.key));
    }
  }

  /** Keeps the subject `key` in the spotlight, or lets it go when it was kept already. */
  keep(key: string): void {
    this.kept = this.kept === key ? null : key;
    for (const chip of Array.from(this.el.querySelectorAll('.thoughtknot-level-chip')))
      chip.setAttribute('aria-pressed', String(chip.getAttribute('data-subject') === this.kept));
    this.spot(this.kept);
  }

  /** Gives the subject `key` its next colour, on its chip and its clouds. */
  recolour(key: string): void {
    if (!this.levels) return;
    const hue = nextHue(this.levels, key);
    this.el
      .querySelector(`.thoughtknot-level-chip[data-subject="${key}"] .thoughtknot-level-swatch`)
      ?.setAttribute('data-hue', String(hue));
    this.host.redraw();
  }

  /** The clouds were drawn again: the spotlight kept goes back on. */
  private respot(): void {
    if (this.kept) this.spot(this.kept);
  }

  /** The pointer is over `target`: a cloud spotlights its subject, anything else the one kept. */
  private pointed(target: EventTarget | null): void {
    if (!this.levels) return;
    const unit = (target as Element | null)?.closest?.('g.thoughtknot-cloud-unit');
    this.spot(unit?.getAttribute('data-subject') ?? this.kept);
  }

  private spot(key: string | null): void {
    const svg = this.host.svg();
    if (svg && this.levels) spotlight(svg, this.levels, key);
  }
}
