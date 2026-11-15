// The format bar of a board (editor spec ES§45, board_format; panels start small). One Format button beside the tools.
// A press opens the looks an item may have: a colour, a line, a size of words and bold. Each is a button, pressed when
// every item chosen has that look. A press changes the items chosen, or the one in focus, as one change.
//
// The bar draws nothing by itself. It writes the change (board-format.ts) and the board draws what was written.
import { word, type Palette, type WordKey } from '@thoughtknot/core';

import type { Board } from '../../board.ts';
import type { BoardChange } from '../../board-edit.ts';
import { LINES, TEXT_SIZES, sharedFormat, type Format } from '../../board-format.ts';
import { STYLE } from '../../layout.ts';
import { STYLE_HUES } from '../../style-graph.ts';

/** What the bar needs of its board. */
export interface FormatBoard {
  /** Writes a change and draws what was written. */
  write: (change: BoardChange) => Promise<void>;
  say: (words: string) => void;
  board: () => Board;
  /** The items chosen, or none. */
  chosen: () => string[];
}

/** One look the bar offers: what a press sets, and how its button is named. */
interface Look {
  name: string;
  set: Partial<Format>;
  label: WordKey;
  /** The shorter words its button shows, when its name is long. */
  short?: WordKey;
  /** The hue a colour's button shows. */
  hue?: string;
}

/** The looks, in their groups, in the order shown. */
const GROUPS: readonly { label: WordKey; looks: readonly Look[] }[] = [
  {
    label: 'rules.colour',
    looks: [
      { name: 'colour-none', set: { colour: null }, label: 'board.format.plain' },
      ...STYLE_HUES.map((hue) => ({
        name: `colour-${hue}`,
        set: { colour: hue },
        label: `rules.colour.${hue}` as WordKey,
        hue,
      })),
    ],
  },
  {
    label: 'rules.line',
    looks: LINES.map((line) => ({ name: `line-${line}`, set: { line }, label: `rules.line.${line}` as const })),
  },
  {
    label: 'board.format.text',
    looks: [
      ...TEXT_SIZES.map((size) => ({
        name: `size-${size}`,
        set: { size },
        label: `board.format.size.${size}` as const,
        short: `board.format.size.${size}.short` as const,
      })),
      { name: 'bold', set: { bold: true }, label: 'board.format.bold' },
    ],
  },
];

/** Whether each board's bar was left open, by its host's key, for when it is drawn again. */
const opened = new Map<string, boolean>();
/** The items chosen and the button pressed just before a write, by the host's key, for a board drawn afresh. */
const carried = new Map<string, { ids: string[]; on: string; at: number }>();
/** How long after a write a board drawn afresh still takes these up, in milliseconds. */
const FRESH_MS = 3000;

/** The bar: its Format button, the looks under it, and the items a press changes. */
export class FormatBar {
  private readonly fold: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly looks = new Map<Look, HTMLButtonElement>();
  private readonly vp: HTMLElement;
  private readonly key: string;
  private readonly h: FormatBoard;
  private ids: string[] = [];

  /**
   * The bar is put above the viewport `vp`. `key` names the board in its host. `reselect` chooses again the items
   * that were chosen when the host drew the board afresh after a change of look.
   */
  constructor(
    el: HTMLElement,
    vp: HTMLElement,
    key: string,
    palette: Palette,
    h: FormatBoard,
    reselect: (ids: string[]) => void,
  ) {
    this.vp = vp;
    this.key = key;
    this.h = h;
    const bar = el.createDiv({ cls: ['thoughtknot-board-bar', 'thoughtknot-board-format'] });
    vp.parentElement?.insertBefore(bar, vp); // above the board
    this.fold = bar.createEl('button', { text: word('board.format'), attr: { type: 'button' } });
    this.fold.addEventListener('click', () => this.open(!this.isOpen()));
    this.panel = bar.createDiv({ cls: 'thoughtknot-board-format-looks' });
    for (const group of GROUPS) {
      const box = this.panel.createDiv({ attr: { role: 'group', 'aria-label': word(group.label) } });
      for (const look of group.looks) {
        const name = word(look.label);
        const b = box.createEl('button', {
          text: look.hue ? '' : look.short ? word(look.short) : name,
          attr: { type: 'button', 'aria-label': name, title: name, 'data-look': look.name },
        });
        if (look.hue) {
          b.classList.add('thoughtknot-board-swatch');
          b.setCssProps({
            '--thoughtknot-swatch': palette.fill(look.hue),
            '--thoughtknot-swatch-edge': palette.blend(look.hue, STYLE.line_mix),
          });
        }
        b.addEventListener('click', () => void this.press(look));
        this.looks.set(look, b);
      }
    }
    const was = carried.get(key);
    carried.delete(key);
    if (was && Date.now() - was.at < FRESH_MS) {
      if (was.ids.length) reselect(was.ids);
      // the press was on a button of the bar before this one: the keyboard goes back to the same button
      queueMicrotask(() => [...this.looks].find(([look]) => look.name === was.on)?.[1].focus());
    }
    this.paint();
  }

  /** Whether the looks are shown. */
  isOpen(): boolean {
    return this.fold.getAttribute('aria-expanded') === 'true';
  }

  /** The board was drawn: the bar is for the items chosen, or else the one in `focus`. */
  show(focus: string | null): void {
    const chosen = this.h.chosen();
    this.ids = chosen.length ? chosen : focus ? [focus] : [];
    this.paint();
  }

  private open(open: boolean): void {
    if (open && !this.ids.length) return this.h.say(word('board.format.none'));
    opened.set(this.key, open);
    this.paint();
  }

  /** Each button pressed when every item has its look; with nothing to change, the looks are put away. */
  private paint(): void {
    const some = this.ids.length > 0;
    const open = some && (opened.get(this.key) ?? false);
    this.fold.setAttribute('aria-expanded', String(open));
    this.fold.setAttribute('aria-disabled', String(!some));
    this.fold.setAttribute('title', word(some ? 'board.format.tip' : 'board.format.none'));
    this.panel.hidden = !open;
    const ids = new Set(this.ids);
    const shared = sharedFormat(this.h.board().items.filter((i) => ids.has(i.id)));
    for (const [look, b] of this.looks) b.setAttribute('aria-pressed', String(has(shared, look.set)));
  }

  /** A press sets the look; on a line or bold already set it takes it off again. */
  private async press(look: Look): Promise<void> {
    const before = this.h.board();
    const ids = new Set(this.ids);
    const on = has(sharedFormat(before.items.filter((i) => ids.has(i.id))), look.set);
    const set: Partial<Format> = !on
      ? look.set
      : 'bold' in look.set
        ? { bold: false }
        : 'line' in look.set
          ? { line: null }
          : look.set;
    // set before the write: the host may draw the board afresh at once, and the new bar picks these up
    carried.set(this.key, { ids: this.h.chosen(), on: look.name, at: Date.now() });
    await this.h.write({ kind: 'formats', ids: this.ids, set });
    if (!this.vp.isConnected) return; // drawn afresh: the new bar took these up
    carried.delete(this.key);
    if (this.h.board() !== before) this.h.say(word('board.format.done', { count: this.ids.length }));
  }
}

/** Whether the look the items share has all that `set` names. */
function has(shared: Partial<Format>, set: Partial<Format>): boolean {
  return (Object.keys(set) as (keyof Format)[]).every((k) => k in shared && shared[k] === set[k]);
}
