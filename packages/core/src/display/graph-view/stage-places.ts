// Moving an item on the new rendering's stage by dragging it (editor spec, ES§2, layout_drag_saves; Roger, 7 Nov 2026,
// R16). The item follows the pointer over the ground, in 2D, 2.5D and 3D alike. Let go, its place is saved in the
// layout block, once. Nothing else moves, and the camera stays still (nodes stay put).
import { pickAt } from '../../render/render-camera.ts';
import type { Mark, View } from '../../render/render-marks.ts';
import type { Spot } from '../../render/render-rooms.ts';
import type { Scene } from '../../render/render-scene.ts';
import { groundShift } from '../../render/render-tilt.ts';

/** The places saved for a card's things, and how to save one; without `place`, nothing is moved by a drag. */
export interface PlacesHost {
  saved: ReadonlyMap<string, { x: number; y: number }>;
  place?: (key: string, x: number, y: number) => void;
}

/** What the mover reads of the stage. */
export interface MoverStage {
  scene: Scene;
  spots: Map<string, Spot>;
  marks: () => readonly Mark[];
  view: () => View;
  draw: () => void;
}

/** One item held by the pointer, moved as it drags, and saved when let go. */
export class StageMover {
  private held: string | null = null;
  private moved = false;
  private readonly stage: MoverStage;
  private readonly save: (key: string, x: number, y: number) => void;

  constructor(stage: MoverStage, save: (key: string, x: number, y: number) => void) {
    this.stage = stage;
    this.save = save;
  }

  /** Takes the item drawn at `x`, `y` on the canvas, if there is one; says whether it took one. */
  grab(x: number, y: number): boolean {
    const key = pickAt(this.stage.marks(), x, y);
    const last = this.stage.scene.depths.length - 1;
    this.held = key && this.stage.scene.nodes.get(key)?.depth === last ? key : null;
    this.moved = false;
    return this.held !== null;
  }

  /** Moves the item held by `dx`, `dy` screen pixels, over the ground however the camera looks. */
  drag(dx: number, dy: number): void {
    const spot = this.held ? this.stage.spots.get(this.held) : undefined;
    if (!this.held || !spot) return;
    const view = this.stage.view();
    const [gx, gy] = groundShift(view, dx, dy);
    this.stage.spots.set(this.held, { ...spot, x: spot.x + gx / view.scale, y: spot.y + gy / view.scale });
    this.moved = true;
    this.stage.draw();
  }

  /** Lets the item go: its place is saved, once, if it moved. */
  drop(): void {
    const spot = this.held && this.moved ? this.stage.spots.get(this.held) : undefined;
    if (this.held && spot) this.save(this.held, spot.x, spot.y);
    this.held = null;
    this.moved = false;
  }
}
