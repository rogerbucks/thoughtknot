// The turn knob in the side rail (rail_turn_knob). Roger, 13 Nov 2026: "I don't understand in 3D view how to change the
// viewing angle". The turn buttons were in the View dock, which starts folded, and nothing on screen said how.
//
// So while the drawing is seen from an angle (2.5D, 3D or the globe), one more button shows under the four ways:
// - Its tooltip says every way to turn and tilt: two fingers on a trackpad, the mouse, the keys.
// - Dragging it turns the view, side to side, and tilts it, up and down. With it focused, the arrows do the same.
// - A press opens a small pad beside the rail: turn left and right, tilt up and down, and the same words.
// - The first time ever, the pad opens by itself, once. Escape, a press outside or its Got it button closes it.
import { word, type WordKey } from '../../words.ts';
import { button } from '../button.ts';
import { glyph } from './type-rail.ts';

/** How far one press of a pad button or arrow key turns, as a drag of this many pixels would. */
export const TURN_STEP_PX = 25;
/** How far the pointer must move on the knob before it is a drag, not a press, in pixels. */
const DRAG_PX = 4;
/** Where the browser keeps that the pad was once shown. */
const SEEN_KEY = 'thoughtknot-turn-hint';

/** The pad's buttons: what each is called, its icon, its arrow key and how far it turns and tilts. */
const PAD: readonly { word: WordKey; icon: string; key: string; by: [number, number] }[] = [
  { word: 'space.turn-left', icon: 'rotate-ccw', key: 'ArrowLeft', by: [-TURN_STEP_PX, 0] },
  { word: 'space.turn-right', icon: 'rotate-cw', key: 'ArrowRight', by: [TURN_STEP_PX, 0] },
  { word: 'space.tilt-up', icon: 'chevron-up', key: 'ArrowUp', by: [0, -TURN_STEP_PX] },
  { word: 'space.tilt-down', icon: 'chevron-down', key: 'ArrowDown', by: [0, TURN_STEP_PX] },
];

/**
 * How to turn and tilt, line by line. The view in space turns with a plain drag and the arrows. The new rendering
 * keeps those to move the drawing and walk from thing to thing, so it turns with Shift or the right button.
 */
export const turnHow = (inSpace: boolean): WordKey[] => [
  'turn.how-pad',
  inSpace ? 'turn.how-mouse-space' : 'turn.how-mouse',
  inSpace ? 'turn.how-keys-space' : 'turn.how-keys',
  'turn.how-knob',
];

/** What the knob asks of the card: to turn and tilt as a drag would, and whether the view in space is open. */
export interface TurnHands {
  turn: (dx: number, dy: number) => void;
  inSpace: () => boolean;
}

/** Whether the pad was shown before, marking it shown. Kept in the browser, and not at all where it cannot be. */
function seenBefore(win: Window): boolean {
  try {
    const seen = win.localStorage.getItem(SEEN_KEY) === 'seen';
    win.localStorage.setItem(SEEN_KEY, 'seen');
    return seen;
  } catch {
    return false;
  }
}

/**
 * Puts the knob in `ways`, the rail's group of four ways, and its pad in `rail`. Both are hidden until `shown(true)`.
 * Gives back how to show or hide them, as the drawing is seen from an angle or flat.
 */
export function railTurns(rail: HTMLElement, ways: HTMLElement, hands: TurnHands): { shown: (on: boolean) => void } {
  const knob = ways.createEl('button', {
    cls: ['thoughtknot-rail-button', 'thoughtknot-rail-turn'],
    attr: { type: 'button', 'aria-label': word('turn.name'), 'aria-haspopup': 'true', 'aria-expanded': 'false' },
  });
  glyph(knob, 'turn');
  knob.setAttribute('title', word('turn.name'));
  knob.hidden = true;
  const pad = rail.createDiv({ cls: 'thoughtknot-turn-pad' });
  pad.setAttribute('role', 'group');
  pad.setAttribute('aria-label', word('turn.name'));
  pad.hidden = true;
  const row = pad.createDiv({ cls: 'thoughtknot-turn-row' });
  for (const p of PAD) {
    const b = button(row, word(p.word), p.icon, () => hands.turn(...p.by));
    b.setAttribute('title', word(p.word));
  }
  const how = pad.createEl('ul', { cls: 'thoughtknot-turn-how' });
  const done = pad.createEl('button', {
    cls: 'thoughtknot-turn-done',
    text: word('turn.done'),
    attr: { type: 'button' },
  });

  // the tooltip and the pad say the ways that work in the view shown now
  const say = () => {
    const lines = turnHow(hands.inSpace()).map((k) => word(k));
    const name = [word('turn.name'), ...lines].join('\n'); // its name says how, read out and on hover alike
    knob.setAttribute('aria-label', name);
    knob.setAttribute('title', name);
    how.empty();
    for (const l of lines) how.createEl('li', { text: l });
  };
  const open = (on: boolean) => {
    if (on) say();
    pad.hidden = !on;
    knob.setAttribute('aria-expanded', String(on));
    if (on) besideKnob(pad, knob, rail);
  };
  knob.addEventListener('pointerenter', say); // the view in space may have opened since it showed
  knob.addEventListener('focus', say);
  done.addEventListener('click', () => (open(false), knob.focus()));

  // a drag on the knob turns as it goes; a press with no drag opens or closes the pad
  let drag: { id: number; x: number; y: number; moved: boolean } | null = null;
  let dragged = false;
  knob.addEventListener('pointerdown', (e: PointerEvent) => {
    knob.setPointerCapture?.(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    dragged = false;
  });
  knob.addEventListener('pointermove', (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    const [dx, dy] = [e.clientX - drag.x, e.clientY - drag.y];
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    drag = { ...drag, x: e.clientX, y: e.clientY, moved: true };
    hands.turn(dx, dy);
  });
  const letGo = (e: PointerEvent) => {
    if (drag?.id !== e.pointerId) return;
    dragged = drag.moved;
    drag = null;
  };
  knob.addEventListener('pointerup', letGo);
  knob.addEventListener('pointercancel', letGo);
  knob.addEventListener('click', () => {
    if (dragged) return void (dragged = false);
    open(pad.hidden !== false);
  });
  // focused, the arrows turn and tilt it, and never walk from thing to thing; Escape closes the pad
  rail.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !pad.hidden) {
      e.preventDefault();
      e.stopPropagation();
      open(false);
      return knob.focus();
    }
    const p = e.target === knob && PAD.find((x) => x.key === e.key);
    if (!p || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    hands.turn(...p.by);
  });
  const outside = (e: Event) => {
    if (!rail.isConnected) return rail.ownerDocument.removeEventListener('pointerdown', outside); // the card went
    const t = e.target as Node | null;
    if (!pad.hidden && !pad.contains(t) && !knob.contains(t)) open(false);
  };
  rail.ownerDocument.addEventListener('pointerdown', outside);

  return {
    shown: (on) => {
      const was = !knob.hidden;
      knob.hidden = !on;
      if (!on) return open(false);
      say();
      if (!was && !seenBefore(rail.win ?? window)) open(true); // the first time ever, it says how by itself
    },
  };
}

/** Puts the pad level with the knob: beside it down the rail, or below it across a phone's. Kept on the card. */
function besideKnob(pad: HTMLElement, knob: HTMLElement, rail: HTMLElement): void {
  const start = Math.max(0, Math.min(knob.offsetLeft, rail.clientWidth - pad.offsetWidth)),
    top = Math.max(0, Math.min(knob.offsetTop, rail.clientHeight - pad.offsetHeight));
  pad.setCssProps({ '--thoughtknot-list-top': `${top}px`, '--thoughtknot-list-start': `${start}px` });
}
