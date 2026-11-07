// Moving an item on the new rendering's stage by dragging it (editor spec, ES§2, layout_drag_saves; Roger, 7 Nov 2026,
// R16). The item follows the pointer over the ground, in 2D, 2.5D and 3D alike. Let go, its place is saved in the
// layout block, once. Nothing else moves, and the camera stays still (nodes stay put). Each place saved offers its
// undo, as every edit on a drawing does (move_undo): a toast, and Ctrl+Z or Cmd+Z, with redo.
import { pickAt } from '../../render/render-camera.ts';
import type { Mark, View } from '../../render/render-marks.ts';
import type { Spot } from '../../render/render-rooms.ts';
import type { Scene } from '../../render/render-scene.ts';
import { groundShift } from '../../render/render-tilt.ts';
import { word } from '../../words.ts';
import { MoveUndo } from './move-undo.ts';

/** What a write of the note gives: why nothing was written, or nothing when it was. */
type Wrote = Promise<string | null> | void;

/**
 * The places saved for a card's things, and how to save one; without `place`, nothing is moved by a drag. With the
 * graph's name and `forget`, each place saved can be undone.
 */
export interface PlacesHost {
  saved: ReadonlyMap<string, { x: number; y: number }>;
  place?: (key: string, x: number, y: number) => Wrote;
  forget?: (key: string) => Wrote;
  graph?: string;
}

/** What the mover reads of the stage. */
export interface MoverStage {
  viewport: HTMLElement;
  scene: Scene;
  spots: Map<string, Spot>;
  marks: () => readonly Mark[];
  view: () => View;
  draw: () => void;
}

/** One item held by the pointer, moved as it drags, and saved when let go. */
export class StageMover {
  private held: { key: string; from: Spot } | null = null;
  private moved = false;
  private readonly stage: MoverStage;
  private readonly host: PlacesHost;
  /** The things with a place in the layout block now, so an undo knows to forget a first place. */
  private readonly placed: Set<string>;
  private readonly undoes: MoveUndo | null;

  constructor(stage: MoverStage, host: PlacesHost) {
    this.stage = stage;
    this.host = host;
    this.placed = new Set(host.saved.keys());
    this.undoes = host.graph && host.forget ? new MoveUndo(stage.viewport, host.graph) : null;
    // heard first, so the card's other Ctrl+Z, on the same history, sees it taken and leaves it
    if (this.undoes) stage.viewport.addEventListener('keydown', this.onKey, { capture: true });
  }

  /** Takes the item drawn at `x`, `y` on the canvas, if there is one; says whether it took one. */
  grab(x: number, y: number): boolean {
    const key = pickAt(this.stage.marks(), x, y);
    const last = this.stage.scene.depths.length - 1;
    const from = key && this.stage.scene.nodes.get(key)?.depth === last ? this.stage.spots.get(key) : undefined;
    this.held = key && from ? { key, from: { ...from } } : null;
    this.moved = false;
    return this.held !== null;
  }

  /** Moves the item held by `dx`, `dy` screen pixels, over the ground however the camera looks. */
  drag(dx: number, dy: number): void {
    const spot = this.held ? this.stage.spots.get(this.held.key) : undefined;
    if (!this.held || !spot) return;
    const view = this.stage.view();
    const [gx, gy] = groundShift(view, dx, dy);
    this.stage.spots.set(this.held.key, { ...spot, x: spot.x + gx / view.scale, y: spot.y + gy / view.scale });
    this.moved = true;
    this.stage.draw();
  }

  /** Lets the item go: its place is saved, once, if it moved, and its undo offered. */
  drop(): void {
    const held = this.held,
      to = held && this.moved ? this.stage.spots.get(held.key) : undefined;
    this.held = null;
    this.moved = false;
    if (!held || !to) return;
    const had = this.placed.has(held.key);
    void this.put(held.key, { ...to });
    const name = this.stage.scene.nodes.get(held.key)?.name ?? held.key;
    // undone, a first place is forgotten, and the item goes back where the rooms put it
    this.undoes?.offer(
      word('layout.placed', { thing: name }),
      () => (had ? this.put(held.key, held.from) : this.unput(held.key, held.from)),
      () => this.put(held.key, { ...to }),
    );
  }

  /** Puts `key` at `at` on the stage and saves its place. Resolves to why it was not saved, or nothing. */
  private put(key: string, at: Spot): Wrote {
    this.stage.spots.set(key, at);
    this.placed.add(key);
    this.stage.draw();
    return this.host.place?.(key, at.x, at.y);
  }

  /** Puts `key` back at `at`, where the rooms put it, and forgets its place. */
  private unput(key: string, at: Spot): Wrote {
    this.stage.spots.set(key, at);
    this.placed.delete(key);
    this.stage.draw();
    return this.host.forget?.(key);
  }

  /** Ctrl+Z or Cmd+Z takes the last edit back; with Shift, or Ctrl+Y, redoes. A field typed in keeps its own. */
  private readonly onKey = (e: KeyboardEvent): void => {
    const typing = !!(e.target as Element | null)?.closest?.('input, textarea, [contenteditable="true"]');
    if (typing || e.defaultPrevented || !this.undoes?.key(e)) return;
    e.preventDefault();
  };

  /** The stage gone: the key no longer heard, and the history kept for the card drawn in its place. */
  unload(): void {
    this.stage.viewport.removeEventListener('keydown', this.onKey, { capture: true });
    this.undoes?.onunload();
  }
}
