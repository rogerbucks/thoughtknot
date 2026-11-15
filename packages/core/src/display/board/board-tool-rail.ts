// The tool rail of a board (editor spec §45, board_tools; panels start small). A small row of tools above the board.
// It starts folded to one button, which shows the tool in use; a press opens the rest. Each tool says its name as its
// tooltip. The arrow keys go from tool to tool, as in any toolbar, and Enter or Space picks one.
//
// The rail moves nothing by itself. The board asks it what a press does (board-tools.ts) and does that. A tool that
// makes an item goes back to Choose once it has made one, so the next press does not make another by surprise.
import { word } from '@thoughtknot/core';

import type { Board } from '../../board.ts';
import type { BoardChange } from '../../board-edit.ts';
import { BOARD_TOOLS, opensText, toolPress, type BoardTool } from '../../board-tools.ts';
import { button } from '../button.ts';
import { setIcon } from '../host.ts';

/** The icon each tool shows. */
const ICONS: Record<BoardTool, string> = {
  choose: 'mouse-pointer-2',
  hand: 'move',
  sticky: 'sticky-note',
  text: 'text',
  shape: 'square',
  frame: 'frame',
  view: 'network',
  connect: 'move-up-right',
};

/** What the rail needs of its board to act on a press. */
export interface RailBoard {
  write: (change: BoardChange) => Promise<void>;
  /** Puts the keyboard on an item, and opens its text when `edit`. */
  focus: (id: string, edit: boolean) => void;
}

/** The item just made whose text is to be opened, by the board's key, for a host that draws the board afresh. */
const toOpen = new Map<string, { id: string; at: number }>();
/** How long after a write a board drawn afresh still opens the text of the item made, in milliseconds. */
const FRESH_MS = 3000;

/** Whether each board's rail was left open, by its host's key, for when it is drawn again. */
const opened = new Map<string, boolean>();

/** The rail: which tool is in use, and the item a join started on. */
export class ToolRail {
  tool: BoardTool = 'choose';
  /** The item a Connect started on, waiting for the second. */
  from: string | null = null;
  private readonly fold: HTMLButtonElement;
  private readonly tools = new Map<BoardTool, HTMLButtonElement>();
  private readonly vp: HTMLElement;
  private readonly key: string;
  private readonly said: (words: string) => void;
  private readonly readOnly: boolean;

  /** The rail is put above the viewport `vp`. `key` names the board in its host; `said` speaks each pick. */
  constructor(el: HTMLElement, vp: HTMLElement, key: string, said: (words: string) => void, readOnly = false) {
    this.vp = vp;
    this.key = key;
    this.said = said;
    this.readOnly = readOnly;
    const rail = el.createDiv({
      cls: 'thoughtknot-board-tools',
      attr: { role: 'toolbar', 'aria-orientation': 'horizontal', 'aria-label': word('board.tools') },
    });
    vp.parentElement?.insertBefore(rail, vp); // above the board
    this.fold = button(rail, '', ICONS.choose, () => this.open(!this.isOpen()));
    this.fold.addClass('thoughtknot-board-tools-fold');
    for (const tool of BOARD_TOOLS) {
      if (readOnly && tool !== 'choose' && tool !== 'hand') continue;
      const b = button(rail, word(`board.tool.${tool}`), ICONS[tool], () => this.pick(tool));
      b.setAttribute('title', word(`board.tool.${tool}.tip`));
      b.setAttribute('data-tool', tool);
      this.tools.set(tool, b);
    }
    rail.addEventListener('keydown', (e: KeyboardEvent) => this.arrows(e));
    this.open(opened.get(key) ?? false);
  }

  /** Whether the rest of the tools are shown. */
  isOpen(): boolean {
    return this.fold.getAttribute('aria-expanded') === 'true';
  }

  /** Picks a tool; says it, so a screen reader hears what a press will now do. */
  pick(tool: BoardTool): void {
    this.tool = tool;
    this.from = null;
    this.paint();
    this.said(word('board.tool.picked', { tool: word(`board.tool.${tool}`) }));
  }

  /**
   * A press with the tool in use, on the item `on` or an empty spot, at the spot `at` of the board. 'pass' leaves the
   * press to the board, 'pan' has the board pan whatever is under it, and 'done' means the rail has acted on it.
   */
  press(board: Board, on: string | null, at: [number, number], to: RailBoard): 'pass' | 'pan' | 'done' {
    const step = toolPress(board, this.tool, on, at, this.from, this.readOnly);
    if (step.kind === 'pass' || step.kind === 'pan') return step.kind;
    if (step.kind === 'make') {
      const { item } = step;
      this.done();
      if (opensText(item.kind)) toOpen.set(this.key, { id: item.id, at: Date.now() });
      void to.write({ kind: 'add', item }).then(() => {
        if (!this.vp.isConnected) return; // drawn afresh: the new board opens the text (held)
        toOpen.delete(this.key);
        to.focus(item.id, opensText(item.kind));
      });
    } else if (step.kind === 'from') {
      this.from = step.id;
      to.focus(step.id, false);
      this.said(word('board.tool.from', { id: step.id }));
    } else if (step.kind === 'join') {
      this.from = null; // stays on Connect, for the next join
      void to.write({ kind: 'connect', from: step.from, to: step.to }).then(() => to.focus(step.to, false));
    } else {
      this.done();
      this.said(word('board.tool.stopped'));
    }
    return 'done';
  }

  /** Calls `open` with the item made just before this board was drawn afresh, whose text is still to be opened. */
  held(open: (id: string) => void): void {
    const was = toOpen.get(this.key);
    toOpen.delete(this.key);
    if (was && Date.now() - was.at < FRESH_MS) open(was.id);
  }

  /** Lets go of a tool other than Choose; whether there was one. */
  cancel(): boolean {
    if (this.tool === 'choose') return false;
    this.done();
    this.said(word('board.tool.picked', { tool: word('board.tool.choose') }));
    return true;
  }

  /** Back to Choose, quietly, after a tool has made its item or a join was let go. */
  done(): void {
    this.tool = 'choose';
    this.from = null;
    this.paint();
  }

  private open(open: boolean): void {
    opened.set(this.key, open);
    this.fold.setAttribute('aria-expanded', String(open));
    for (const b of this.tools.values()) b.hidden = !open;
    this.paint();
  }

  private paint(): void {
    for (const [tool, b] of this.tools) b.setAttribute('aria-pressed', String(tool === this.tool));
    const now = word(`board.tool.${this.tool}`);
    this.fold.setAttribute('aria-label', word(this.isOpen() ? 'board.tools.hide' : 'board.tools.show', { tool: now }));
    // folded, it shows the tool in use; open, the tools show that, and it shows the way to fold them
    const icon = this.isOpen() ? 'chevron-left' : ICONS[this.tool];
    if (this.fold.getAttribute('data-icon') !== icon) {
      this.fold.replaceChildren();
      setIcon(this.fold, icon);
    }
    this.fold.setAttribute('data-icon', icon);
    this.fold.setAttribute('data-tool', this.tool);
  }

  /** The arrow keys move between the buttons shown, as in a toolbar; Escape folds the rail. */
  private arrows(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.isOpen()) {
      e.preventDefault();
      this.open(false);
      return this.fold.focus();
    }
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const shown = [this.fold, ...this.tools.values()].filter((b) => !b.hidden);
    const at = shown.indexOf(e.target as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    shown[(at + step + shown.length) % shown.length]?.focus();
  }
}
