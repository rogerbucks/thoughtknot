// The people and the clashes of a shared board, under the picture (editor spec §45, board_presence,
// board_offline_merge). One list says who else is here, with a button to go to where each is. Another lists each clash
// the merge flagged, with a button to settle it. Both are plain buttons the keyboard reaches, and each is drawn again
// only when its words change, so the focus stays where it was. Going to a person moves the view once, when asked.
import { word } from '@thoughtknot/core';
import { clashOf, clashed, settled } from '../../board-clash.ts';
import type { Board, BoardItem } from '../../board.ts';
import { followSpot, others } from '../../board-presence.ts';
import type { Peer } from '../../board-presence.ts';
import { boardOutline } from '../../board-svg.ts';
import { presenceSvg } from '../../board-together.ts';
import type { Together } from '../../board-together.ts';
import type { Palette } from '@thoughtknot/core';

/** What the lists need of the board view. */
export interface PeopleHooks {
  board(): Board;
  /** The seat at the shared board. */
  together: Together;
  palette: Palette;
  /** Makes the SVG element of a picture written as text. */
  parse(svg: string): SVGSVGElement;
  /** Whether this person may change the board, so may settle a clash. */
  mayEdit: boolean;
  /** Brings a spot of the board into view. */
  show(spot: [number, number]): void;
  /** Settles a clash by writing the item without its flag. */
  settle(item: BoardItem): void;
  say(words: string): void;
}

/** The lists, kept up to date with the board and the people. */
export class BoardPeople {
  private readonly people: HTMLElement;
  private readonly clashes: HTMLElement;
  private shown = ['', ''];
  private told = 0;

  private readonly hooks: PeopleHooks;

  constructor(root: HTMLElement, hooks: PeopleHooks) {
    this.hooks = hooks;
    this.people = root.createDiv({ cls: 'thoughtknot-board-people' });
    this.clashes = root.createDiv({ cls: 'thoughtknot-board-clashes' });
    this.refresh();
  }

  /** Draws each list again if, and only if, what it says has changed. */
  refresh(): void {
    const { together } = this.hooks;
    const board = () => this.hooks.board();
    const here = others(together.peers(), together.me, Date.now());
    const lines = boardOutline(board());
    const said = (id: string) => lines.find((l) => l.id === id)?.said ?? id;
    this.list(
      0,
      this.people,
      here.length ? word('board.people.title') : '',
      here.map((p) => [p.id, p.name, word('board.people.go', { name: p.name }), () => this.go(p)]),
    );
    const flagged = clashed(board());
    this.list(
      1,
      this.clashes,
      flagged.length ? word('board.clash.title') : '',
      flagged.map((i) => [
        i.id,
        word('board.clash.line', { item: said(i.id), other: said(clashOf(i) ?? '') }),
        this.hooks.mayEdit ? word('board.clash.settle-item', { item: said(i.id) }) : '',
        () => {
          this.hooks.say(word('board.clash.settled', { item: said(i.id) }));
          this.hooks.settle(settled(i));
        },
      ]),
    );
  }

  /** The others drawn over the board's picture, in place of any drawn before. */
  paint(svg: SVGSVGElement): void {
    const { together, palette } = this.hooks;
    const board = () => this.hooks.board();
    svg.querySelector('.thoughtknot-presence')?.remove();
    const wrap = this.hooks.parse(
      `<svg xmlns="http://www.w3.org/2000/svg">${presenceSvg(board(), together.peers(), together.me, palette, Date.now())}</svg>`,
    );
    const layer = wrap.querySelector('.thoughtknot-presence');
    if (layer) svg.appendChild(layer);
  }

  /** Tells the others where this person is: a pointer at most every 80 ms, and what is in focus. */
  tell(pointer: [number, number] | undefined, focus: string | null, force = false): void {
    const now = Date.now();
    if (!force && pointer && now - this.told < 80) return;
    this.told = now;
    this.hooks.together.announce({ ...(pointer ? { pointer } : {}), selection: focus ? [focus] : [] });
  }

  /** The view goes to where `peer` is, once; or it is said that they have nothing to show. */
  private go(peer: Peer): void {
    const spot = followSpot(this.hooks.board(), peer);
    if (!spot) return this.hooks.say(word('board.people.nothing', { name: peer.name }));
    this.hooks.show(spot);
    this.hooks.say(word('board.people.went', { name: peer.name }));
  }

  /** One list: a heading and a line for each row, with a button when the row has a label for it. */
  private list(at: number, el: HTMLElement, title: string, rows: [string, string, string, () => void][]): void {
    const key = JSON.stringify([title, rows.map((r) => r.slice(0, 3))]);
    if (key === this.shown[at]) return;
    this.shown[at] = key;
    const focus = el.querySelector('button:focus')?.getAttribute('data-row');
    el.empty();
    el.hidden = !rows.length;
    if (!rows.length) return;
    el.createEl('p', { cls: 'thoughtknot-board-list-title', text: title });
    const ul = el.createEl('ul');
    for (const [id, said, label, act] of rows) {
      const li = ul.createEl('li');
      li.createSpan({ text: said });
      if (!label) continue;
      const b = li.createEl('button', {
        text: at ? word('board.clash.settle') : label,
        attr: { 'data-row': id, 'aria-label': label },
      });
      b.addEventListener('click', act);
      if (focus === id) b.focus({ preventScroll: true });
    }
  }
}
