// Where the thing picked in 2.5D, 3D or on the globe is on the screen (editor spec §72, edit_every_view). The editor
// beside a selected thing sits beside it as the view shows it. So the view tells its card where the picked thing is
// as the view turns. A frame where it stays still tells nothing.
import { middleOf, projectPoint } from '../../space-view.ts';
import type { Block } from '../../space-view.ts';

/** The event the view sends as the picked thing moves on the screen: its key and its pixel, or none out of sight. */
export const SPACE_PICKED_AT = 'thoughtknot-space-picked-at';

/** Where the picked thing is on the screen, in the view's pixels. */
export interface PickedAt {
  key: string;
  x: number;
  y: number;
}

/** What each view told last, by the frame it sits in, so a frame where nothing moved tells nothing. */
const told = new WeakMap<HTMLElement, string>();

/** Tells the card round `root` where `picked` is now, seen by the camera's `matrix` on a `width` by `height` view. */
export function tellPickedAt(
  root: HTMLElement,
  picked: Block | null,
  matrix: Float32Array,
  width: number,
  height: number,
): void {
  const p = picked?.of === undefined ? null : projectPoint(matrix, middleOf(picked), width, height);
  const at: PickedAt | null =
    picked?.of !== undefined && p ? { key: picked.of, x: Math.round(p.x), y: Math.round(p.y) } : null;
  const now = at ? `${at.key}\n${at.x}\n${at.y}` : '';
  if (now === (told.get(root) ?? '')) return;
  told.set(root, now);
  root.dispatchEvent(new CustomEvent<PickedAt | null>(SPACE_PICKED_AT, { detail: at, bubbles: true }));
}
