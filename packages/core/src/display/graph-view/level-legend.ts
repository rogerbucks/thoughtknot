// The legend of subjects, under the level badge (editor spec §68, level_colours). Roger, 3 Nov 2026: the legend is the
// spotlight and a filter. Each subject has a chip with its colour and name:
// - pointing at a chip, or at a cloud, puts that subject in the spotlight while the pointer stays;
// - clicking a chip keeps it in the spotlight, and clicking it again lets it go;
// - the chip's colour button picks the subject's next colour, and its clouds take it at once.
// The chips are buttons, so the keyboard reaches them, and each says what it does. Nothing moves. While AI is on, a
// button asks your AI to name the levels (ai_levels).
import type { DetailLevel } from '../../detail-levels.ts';
import { word } from '../../words.ts';
import { hueOf, nextHue, spotlight } from './level-colours.ts';
import type { GraphDrawing } from '../../note-reading.ts';
import { chooseOwnLevel, ownChoicesOf, ownLevelOf } from './level-clouds-svg.ts';
import { CloudCard, type CloudCardHost } from './cloud-card.ts';

/** What the legend needs from its card. */
export interface LevelLegendHost {
  /** The card's viewport, where the pointer is followed over the clouds. */
  viewport: HTMLElement;
  svg: () => SVGSVGElement | null;
  /** Draws the clouds again, after a colour or a level is picked. */
  redraw: () => void;
  /** The drawing shown, whose own level is chosen here (own_levels). */
  drawing: () => GraphDrawing | undefined;
  /** What asks your AI to name the levels, while AI is on; null while it is off (ai_levels). */
  nameLevels?: () => (() => void) | null;
  /** How a group's things are written, while the note can be written; null while it is only read (cloud_edit). */
  editGroup?: () => CloudCardHost['edit'] | null;
  /** The colour the drawing gives a subject, where it paints its own (the new rendering), so the chip shows it. */
  colourOf?: (key: string) => string | undefined;
}

/** The legend of one card's subjects. */
export class LevelLegend {
  private readonly el: HTMLElement;
  private readonly host: LevelLegendHost;
  private levels: readonly DetailLevel[] | null = null;
  /** The subject kept in the spotlight by a click, if any. */
  private kept: string | null = null;
  /** The chips' row, and the row that chooses your own level: what groups it, and a button to swap it down or up. */
  private readonly chips: HTMLElement;
  private readonly pick: HTMLSelectElement;
  /** The drawing whose choices the picker lists. */
  private listed: GraphDrawing | undefined;
  /** The button that asks your AI to name the levels, shown only while AI is on. */
  private readonly ai: HTMLElement;
  /** The card that renames, merges or takes apart a named group (cloud_edit). */
  private readonly card: CloudCard;

  /** Made inside `parent`, the badge. */
  constructor(parent: HTMLElement, host: LevelLegendHost) {
    this.host = host;
    this.el = parent.createDiv({ cls: 'thoughtknot-level-legend', attr: { role: 'group' } });
    const own = this.el.createDiv({ cls: 'thoughtknot-level-own' });
    this.pick = own.createEl('select', { attr: { 'aria-label': word('levels.own-label') } });
    this.pick.addEventListener('change', () => this.choose(this.pick.value || null));
    const swap = own.createEl('button', { cls: 'thoughtknot-level-swap', text: '⇅', attr: { type: 'button' } });
    swap.setAttribute('aria-label', word('levels.own-swap'));
    swap.addEventListener('click', () => this.swap());
    this.ai = own.createEl('button', {
      cls: 'thoughtknot-level-ai',
      text: word('levels.ai'),
      attr: { type: 'button' },
    });
    this.ai.setAttribute('aria-label', word('levels.ai-label'));
    this.ai.addEventListener('click', () => host.nameLevels?.()?.());
    this.chips = this.el.createDiv({ cls: 'thoughtknot-level-chips' });
    this.chips.setAttribute('aria-label', word('levels.legend-label'));
    // pointing at a cloud spotlights its subject too, for as long as the pointer stays on it
    host.viewport.addEventListener('pointerover', (e: Event) => this.pointed(e.target));
    // right-clicking a named cloud opens its card (cloud_edit)
    this.card = new CloudCard(host.viewport, { edit: (...a) => host.editGroup?.()?.(...a) });
    host.viewport.addEventListener('contextmenu', (e: Event) => {
      const unit = (e.target as Element | null)?.closest?.('g.thoughtknot-cloud-unit');
      const key = unit?.getAttribute('data-cloud');
      if (key && this.edit(key)) e.preventDefault();
    });
  }

  /** Shows the chips of `levels`' subjects; none for a drawing of one level. */
  show(levels: readonly DetailLevel[] | null): void {
    if (levels === this.levels) return this.respot();
    this.levels = levels;
    this.kept = null;
    this.chips.empty();
    this.listChoices();
    this.ai.toggleClass('is-hidden', !this.host.nameLevels?.());
    const subjects = levels && levels.length > 1 ? (levels[0]?.groups ?? []) : [];
    const drawing = this.host.drawing();
    this.el.toggleClass('is-hidden', !subjects.length && !(drawing && ownLevelOf(drawing)));
    for (const g of subjects) {
      const chip = this.chips.createEl('button', {
        cls: 'thoughtknot-level-chip',
        attr: { type: 'button', 'data-subject': g.key, 'aria-pressed': 'false' },
      });
      const swatch = chip.createSpan({
        cls: 'thoughtknot-level-swatch',
        attr: { 'data-hue': String(hueOf(levels ?? [], g.key)) },
      });
      this.paintSwatch(swatch, g.key);
      chip.createSpan({ text: g.name });
      chip.addEventListener('pointerenter', () => this.spot(g.key));
      chip.addEventListener('pointerleave', () => this.spot(this.kept));
      chip.addEventListener('focus', () => this.spot(g.key));
      chip.addEventListener('blur', () => this.spot(this.kept));
      chip.addEventListener('click', () => this.keep(g.key));
      const colour = this.chips.createEl('button', {
        cls: 'thoughtknot-level-colour',
        text: '◐',
        attr: { type: 'button', 'aria-label': word('levels.colour-label', { name: g.name }) },
      });
      colour.addEventListener('click', () => this.recolour(g.key));
      if (!CloudCard.edits(g) || !this.host.editGroup?.()) continue;
      const edit = this.chips.createEl('button', {
        cls: 'thoughtknot-level-edit',
        text: word('levels.edit'),
        attr: { type: 'button', 'aria-label': word('levels.edit-label', { name: g.name }) },
      });
      edit.addEventListener('click', () => this.edit(g.key));
    }
  }

  /** Opens the card of the named group `key`, at whichever level it is. Says whether it opened. */
  edit(key: string): boolean {
    if (!this.host.editGroup?.()) return false;
    for (const level of this.levels ?? []) {
      const g = level.groups.find((x) => x.key === key);
      if (g && CloudCard.edits(g)) {
        this.card.open(g, level.groups);
        return true;
      }
    }
    return false;
  }

  /** Keeps the subject `key` in the spotlight, or lets it go when it was kept already. */
  keep(key: string): void {
    this.kept = this.kept === key ? null : key;
    for (const chip of Array.from(this.chips.querySelectorAll('.thoughtknot-level-chip')))
      chip.setAttribute('aria-pressed', String(chip.getAttribute('data-subject') === this.kept));
    this.spot(this.kept);
  }

  /** Gives the subject `key` its next colour, on its chip and its clouds. */
  recolour(key: string): void {
    if (!this.levels) return;
    const hue = nextHue(this.levels, key);
    const swatch = this.el.querySelector<HTMLElement>(
      `.thoughtknot-level-chip[data-subject="${key}"] .thoughtknot-level-swatch`,
    );
    swatch?.setAttribute('data-hue', String(hue));
    this.host.redraw();
    if (swatch) this.paintSwatch(swatch, key);
  }

  /** The levels whose chips show now, if any. */
  shown(): readonly DetailLevel[] | null {
    return this.levels;
  }

  /** Gives a chip the drawing's own colour for its subject, where the drawing paints its own. */
  private paintSwatch(swatch: HTMLElement, key: string): void {
    const colour = this.host.colourOf?.(key);
    if (!colour) return;
    swatch.addClass('has-own');
    swatch.setCssProps({ '--thoughtknot-swatch': colour });
  }

  /** Lists what the drawing's own level could group by, once for each drawing. */
  private listChoices(): void {
    const drawing = this.host.drawing();
    if (!drawing || drawing === this.listed) return;
    this.listed = drawing;
    this.pick.empty();
    this.pick.createEl('option', { text: word('levels.own-found'), attr: { value: '' } });
    for (const by of ownChoicesOf(drawing))
      this.pick.createEl('option', { text: by === 'kind' ? word('levels.kind') : by, attr: { value: by } });
    this.pick.value = ownLevelOf(drawing)?.by ?? '';
  }

  /** Groups the top level by `by`, or goes back to the levels found from the links (null). */
  choose(by: string | null): void {
    const drawing = this.host.drawing();
    if (!drawing) return;
    chooseOwnLevel(drawing, by ? { by, at: ownLevelOf(drawing)?.at ?? 0 } : null);
    this.pick.value = by ?? '';
    this.host.redraw();
  }

  /** Swaps your own level with the one below it, or back to the top. */
  swap(): void {
    const drawing = this.host.drawing(),
      own = drawing && ownLevelOf(drawing);
    if (!drawing || !own) return;
    chooseOwnLevel(drawing, { by: own.by, at: own.at === 0 ? 1 : 0 });
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
