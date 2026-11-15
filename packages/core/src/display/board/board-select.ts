// The items chosen on a board (editor spec §45, board_arranged_by_graph). Shift-click, Ctrl-click or Cmd-click adds an
// item or takes it out, and Esc clears them. They are drawn ringed. A chosen item is only a mark on the screen.
// Nothing is written to the note, and nothing moves, until the person asks for something to be done to them.
// A host may draw a board afresh after each write. So the chosen items are kept by the host's key, and the new board
// rings what the old one had.
const chosen = new Map<string, Set<string>>();

export class BoardSelection {
  private ids = new Set<string>();

  /** `changed` is told how many are chosen whenever that changes. */
  constructor(private readonly changed: (count: number) => void) {}

  /** Takes up the items chosen on the board that `key` names, and shares what is chosen with a board drawn after. */
  at(key: string): void {
    this.ids = chosen.get(key) ?? this.ids;
    chosen.set(key, this.ids);
  }

  /** The chosen items, in the order chosen. */
  list(): string[] {
    return [...this.ids];
  }

  /** Whether a press adds or takes out an item, rather than does what it does alone. */
  static is(e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean {
    return e.shiftKey || e.ctrlKey || e.metaKey;
  }

  /** An item added, or taken out when it is there. */
  toggle(id: string): void {
    if (!this.ids.delete(id)) this.ids.add(id);
    this.changed(this.ids.size);
  }

  /** These items chosen, and no others, as after a paste. */
  set(ids: readonly string[]): void {
    this.ids.clear();
    for (const id of ids) this.ids.add(id);
    this.changed(this.ids.size);
  }

  /** None chosen; whether any were. */
  clear(): boolean {
    const had = this.ids.size > 0;
    this.ids.clear();
    if (had) this.changed(0);
    return had;
  }

  /** Rings the chosen items of a picture just drawn; an item that is gone from the board is let go. */
  paint(svg: Element, items: readonly { id: string }[]): void {
    const here = new Set(items.map((i) => i.id));
    for (const id of [...this.ids]) if (!here.has(id)) this.ids.delete(id);
    for (const g of Array.from(svg.querySelectorAll('[data-item]')))
      g.toggleClass('is-chosen', this.ids.has(g.getAttribute('data-item') ?? ''));
    this.changed(this.ids.size);
  }
}
