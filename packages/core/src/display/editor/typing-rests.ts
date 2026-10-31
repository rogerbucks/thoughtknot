// The block editor's waits after typing (spec §4). What is typed is written once typing rests: in the pane well inside
// the spec's third of a second, and in place longer. The drawing is redrawn a little after it. A write made at once
// clears the write waiting. The editor going clears both, as this is its child component, so no timer outlives it.
// With Redraw while typing set to Done (redraw_while_typing, NEURO-7), the redraw is held instead. It is made once the
// text is left, so nothing in the picture moves while the person is still thinking.
import { Lifecycle } from '../lifecycle.ts';
import type { Layout } from './editor-layout';

/** How long typing rests before it is written: in the pane well inside the spec's third of a second; in place longer. */
const WRITE_AFTER_MS: Record<Layout, number> = { pane: 150, inline: 700 };
const DRAW_AFTER_MS = 250;

/** What is done as typing rests: the write and the redraw. And whether the redraw is held until the text is left. */
interface Rests {
  write: () => void;
  draw: () => void;
  held?: () => boolean;
}

/** The two waits after typing in one block editor: the write as typing rests, and the redraw. */
export class TypingRests extends Lifecycle {
  private readonly layout: Layout;
  private readonly on: Rests;
  private writeTimer: number | null = null;
  private drawTimer: number | null = null;
  /** Whether a redraw is held, to be made once the text is left. */
  private drawHeld = false;

  constructor(layout: Layout, on: Rests) {
    super();
    this.layout = layout;
    this.on = on;
  }

  /** The text changed: the write and the redraw each wait again from now. */
  typed(): void {
    const w = window;
    if (this.writeTimer !== null) w.clearTimeout(this.writeTimer);
    this.writeTimer = w.setTimeout(() => {
      this.writeTimer = null;
      this.on.write();
    }, WRITE_AFTER_MS[this.layout]);
    if (this.drawTimer !== null) w.clearTimeout(this.drawTimer);
    this.drawTimer = null;
    this.drawHeld = !!this.on.held?.();
    if (this.drawHeld) return;
    this.drawTimer = w.setTimeout(() => {
      this.drawTimer = null;
      this.on.draw();
    }, DRAW_AFTER_MS);
  }

  /** The text is left: a redraw held is made now. */
  left(): void {
    if (!this.drawHeld) return;
    this.drawHeld = false;
    this.on.draw();
  }

  /** The write waiting is not needed, as one is made now. */
  noWrite(): void {
    if (this.writeTimer !== null) window.clearTimeout(this.writeTimer);
    this.writeTimer = null;
  }

  /** The editor goes, and this with it: neither wait outlives it. */
  override onunload(): void {
    super.onunload();
    if (this.writeTimer !== null) window.clearTimeout(this.writeTimer);
    if (this.drawTimer !== null) window.clearTimeout(this.drawTimer);
    this.writeTimer = this.drawTimer = null;
  }
}
