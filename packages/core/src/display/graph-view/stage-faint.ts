// The View panel's Faint roads switch for the new rendering (editor spec §73, render_faint_roads). Zoomed in, the
// roads between bigger groups fade away. With it on, they stay faintly in sight (Roger, 7 Nov 2026). It is off unless
// the reader turns it on, and it changes only how the roads are drawn.
import { word } from '../../words.ts';
import { viewMenuOf } from './level-legend.ts';

/** How strong a faint road is. */
export const FAINT = 0.2;

/** The Faint roads switch of one stage: on or off, shown in its view's View panel once there is one. */
export class FaintRoads {
  on = false;
  private button: HTMLButtonElement | null = null;
  private readonly viewport: () => HTMLElement;
  private readonly changed: () => void;

  /** The switch for the stage drawn in `viewport`, which calls `changed` when it is turned. */
  constructor(host: { viewport: () => HTMLElement; changed: () => void }) {
    this.viewport = host.viewport;
    this.changed = host.changed;
  }

  /** Puts the switch in the View panel, if the view has one and it is not there yet. */
  place(): void {
    if (this.button?.isConnected) return;
    const menu = viewMenuOf(this.viewport());
    if (!menu) return;
    // laid out as the panel's other switches: its name, a hint under it, and a toggle that says its state
    const b = menu.createEl('button', {
      cls: ['thoughtknot-switch', 'thoughtknot-faint-roads'],
      attr: { type: 'button', role: 'switch', title: word('levels.faint-roads-hint') },
    });
    const words = b.createSpan({ cls: 'thoughtknot-switch-words' });
    words.createSpan({ cls: 'thoughtknot-switch-name', text: word('levels.faint-roads') });
    words.createSpan({ cls: 'thoughtknot-switch-hint', text: word('levels.faint-roads-hint') });
    b.createSpan({ cls: 'thoughtknot-switch-track', attr: { 'aria-hidden': 'true' } });
    b.createSpan({ cls: 'thoughtknot-switch-state', attr: { 'aria-hidden': 'true' } });
    b.addEventListener('click', () => this.turn(!this.on));
    this.button = b;
    this.show();
  }

  /** Turns the switch on or off, and draws again. */
  turn(on: boolean): void {
    this.on = on;
    this.show();
    this.changed();
  }

  /**
   * The least a road shows, for the detail the stage draws with: none while the switch is off. The switch joins the
   * View panel here too, as the panel may come after the stage.
   */
  drawn(): number {
    this.place();
    return this.on ? FAINT : 0;
  }

  /** Takes the switch out of the View panel. */
  remove(): void {
    this.button?.remove();
    this.button = null;
  }

  private show(): void {
    this.button?.setAttribute('aria-checked', String(this.on));
    this.button
      ?.querySelector<HTMLElement>('.thoughtknot-switch-state')
      ?.setText(word(this.on ? 'view.on' : 'view.off'));
  }
}
