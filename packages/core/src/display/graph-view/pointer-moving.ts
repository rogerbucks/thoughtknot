// Adaptive hover (editor spec §68, hover_adaptive). Roger approved this from the UX review, 3 Nov 2026. A highlight
// opens as soon as the pointer stops on a thing. It waits only while the pointer is still passing over. So the
// drawing is marked `is-moving` while a mouse or pen has just moved. styles.css makes a highlight wait only then.
// Touch has no hover, so it never marks the drawing.

/** How long, in milliseconds, after its last move the pointer counts as stopped. */
export const MOVING_QUIET = 80;

/**
 * Marks `el` with `is-moving` while a mouse or pen moves over it, and takes the mark off once it has been still for
 * `quiet` milliseconds. Gives back a function that stops watching.
 */
export function watchMoving(
  el: Element,
  quiet = MOVING_QUIET,
  later: (fn: () => void, ms: number) => unknown = (fn, ms) => window.setTimeout(fn, ms),
  cancel: (timer: unknown) => void = (t) => window.clearTimeout(t as number),
): () => void {
  let timer: unknown = null;
  const still = () => {
    timer = null;
    el.classList.remove('is-moving');
  };
  const moved = (ev: Event) => {
    if ((ev as PointerEvent).pointerType === 'touch') return;
    el.classList.add('is-moving');
    if (timer !== null) cancel(timer);
    timer = later(still, quiet);
  };
  el.addEventListener('pointermove', moved);
  el.addEventListener('pointerleave', still);
  return () => {
    el.removeEventListener('pointermove', moved);
    el.removeEventListener('pointerleave', still);
    if (timer !== null) cancel(timer);
    still();
  };
}
