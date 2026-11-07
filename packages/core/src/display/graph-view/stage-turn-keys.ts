// Turning and tipping the new rendering's tilted camera by keys and buttons (ES§25, controls_keys; ES§53,
// space_turns_round_pick). A drag with Shift or the right button already turns it. Not everyone can drag, so Shift
// with the arrow keys turns and tips it too. The card's dock shows four buttons that do the same, while the view is
// tilted. Flat 2D shows none, and leaves the keys to the card. Plain arrows still walk from thing to thing.
import { word, type WordKey } from '../../words.ts';
import { button } from '../button.ts';

/** How far one key press or button turns the camera, as a drag of this many pixels would. */
const STEP_PX = 25;

/** What the controls ask of the stage: turn and tip it, saying whether it could, as only a tilted one can. */
export interface Turnable {
  turnBy: (dx: number, dy: number) => boolean;
}

/** The turns each control and key gives, as a drag across and up or down would. */
const TURNS: readonly { word: WordKey; icon: string; key: string; by: [number, number] }[] = [
  { word: 'space.turn-left', icon: 'rotate-ccw', key: 'ArrowLeft', by: [-STEP_PX, 0] },
  { word: 'space.turn-right', icon: 'rotate-cw', key: 'ArrowRight', by: [STEP_PX, 0] },
  { word: 'space.tilt-up', icon: 'chevron-up', key: 'ArrowUp', by: [0, -STEP_PX] },
  { word: 'space.tilt-down', icon: 'chevron-down', key: 'ArrowDown', by: [0, STEP_PX] },
];

/**
 * The turn buttons in the view dock of `root`, and Shift with the arrows on `viewport`, for `stage`. `shown` says
 * whether the view is tilted now; `unload` takes the buttons and keys away with the stage.
 */
export function turnControls(
  root: HTMLElement,
  viewport: HTMLElement,
  stage: Turnable,
): { shown: (on: boolean) => void; unload: () => void } {
  const body = root.querySelector<HTMLElement>('.thoughtknot-view-dock .thoughtknot-dock-body');
  const buttons = body
    ? TURNS.map((t) => {
        const b = button(body, word(t.word), t.icon, () => stage.turnBy(...t.by));
        b.setAttribute('title', `${word(t.word)} (Shift + ${t.key.replace('Arrow', '')})`);
        b.hidden = true;
        return b;
      })
    : [];
  const onKey = (e: KeyboardEvent): void => {
    const typing = !!(e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
    const t = TURNS.find((x) => x.key === e.key);
    if (!t || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || typing || e.defaultPrevented) return;
    if (stage.turnBy(...t.by)) e.preventDefault();
  };
  viewport.addEventListener('keydown', onKey);
  return {
    shown: (on) => buttons.forEach((b) => (b.hidden = !on)),
    unload: () => {
      buttons.forEach((b) => b.remove());
      viewport.removeEventListener('keydown', onKey);
    },
  };
}
