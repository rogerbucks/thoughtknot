// What the new rendering's stage asks of its card (editor spec §73, render_switch): render-stage.ts.
import type { OwnColour } from '../../render/render-marks.ts';
import type { StageRoom } from './stage-rooms.ts';

/** What a click on the stage does in its card: choose a thing (its details open), or clear the choice. */
export interface StageHands {
  open: (key: string) => void;
  clear: () => void;
  /** The thing chosen now, by its key. */
  selected: () => string | null;
  /** Whether another view shows in the card now, as in space, so the stage leaves the pointer and wheel to it. */
  away?: () => boolean;
  /** Told after each drawing, so the level badge and its colour key say the level shown now. */
  drawn?: () => void;
  /** The colour each subject was given on the colour key, if any, so the drawing and its key agree. */
  own?: OwnColour;
  /** A room picked: its details list what is in it (render_room_folders). */
  room?: (r: StageRoom) => void;
}
