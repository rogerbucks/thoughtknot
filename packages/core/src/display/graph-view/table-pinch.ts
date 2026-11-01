// Two fingers on the table size its words, as a trackpad's pinch does (spec §15, table_grid_navigation). A browser
// sends a trackpad's pinch to the page as the wheel with Control, and the card's zoom sizes the table's words by it. A
// pinch on a touch screen is sent on the same way, so both size the words alike. One finger still scrolls the table.
// The touch events are read, not the pointer events: a browser that starts to scroll on one finger cancels its pointer.
import { WHEEL_RATE } from '../../zoom.ts';

/** Where two fingers are, and how far apart. */
const apart = (t: TouchList) => {
  const [a, b] = [t[0], t[1]];
  if (!a || !b) return null;
  return {
    d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
};

/** Binds the pinch of two fingers on `scroll`, sent to the card as the wheel with Control. */
export function bindPinch(scroll: HTMLElement): void {
  let last = 0;
  const start = (e: TouchEvent) => {
    last = e.touches.length === 2 ? (apart(e.touches)?.d ?? 0) : 0;
  };
  scroll.addEventListener('touchstart', start, { passive: true });
  scroll.addEventListener('touchend', start, { passive: true });
  scroll.addEventListener('touchcancel', start, { passive: true });
  scroll.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      const now = e.touches.length === 2 ? apart(e.touches) : null;
      if (!now || !last || !now.d) return;
      e.preventDefault(); // the two fingers size the words; the page neither scrolls nor zooms under them
      // the spread since the last move, as the wheel's travel that zooms as far: the zoom sizes the words by it
      const deltaY = -Math.log(now.d / last) / WHEEL_RATE;
      last = now.d;
      const at = { clientX: now.x, clientY: now.y, deltaY, deltaMode: 0, ctrlKey: true };
      scroll.dispatchEvent(new WheelEvent('wheel', { ...at, bubbles: true, cancelable: true }));
    },
    { passive: false },
  );
}
