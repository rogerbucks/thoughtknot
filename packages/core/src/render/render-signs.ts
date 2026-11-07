// Signposts: part of layer L4 of the rendering spec (wiki/Rendering-spec.md; editor spec §68, level_regions). Where a
// road leaves the screen for a room off it, a card at the edge points the way. It names the room (Roger, 7 Nov 2026,
// from the mockup). They go to the one label placer with the other names. Host-free and pure.
import type { Scene } from './render-scene.ts';
import type { Spot } from './render-rooms.ts';
import type { Detail } from './render-detail.ts';
import { inkOf, type Look } from './render-look.ts';
import {
  ITEM_PX,
  LONGEST,
  crisp,
  inView,
  onScreen,
  onView,
  textWidth,
  type LabelAsk,
  type View,
} from './render-marks.ts';

/** The arrows a signpost points with, a turn of 45 degrees apart, clockwise from the right. */
const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

/** The arrow that points along `dx`, `dy` on the screen. */
export const arrowOf = (dx: number, dy: number): string =>
  ARROWS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8] as string;

/** How far in from the clear edge a signpost stands. */
const SIGN_INSET = 6;

/**
 * Signposts: where a road leaves the screen for a room off it, a card at the edge points the way. It names the room
 * (Roger, 7 Nov 2026, from the mockup). A road whose far end is on screen shows itself, so it has none. One signpost
 * for each room off screen; a click on it goes there, as on the room's own name.
 */
export function signsOf(
  scene: Scene,
  spots: Map<string, Spot>,
  detail: Detail,
  view: View,
  colours: Map<string, string>,
  look: Look,
): LabelAsk[] {
  const c = view.clear ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const last = scene.depths.length - 1;
  const signs = new Map<string, LabelAsk>();
  scene.roads.forEach((at, depth) => {
    // a signpost stands while its level shows at all, so zoomed deep into a room the ways out are still marked
    const alpha = crisp(detail.shown[depth] ?? 0);
    if (alpha < 0.05) return;
    for (const road of at) {
      const p = spots.get(road.a),
        q = spots.get(road.b);
      if (!p || !q || scene.nodes.get(road.a)?.parent !== scene.nodes.get(road.b)?.parent) continue;
      const [s, t] = [onScreen(p, view), onScreen(q, view)];
      for (const [near, far, key] of [
        [s, t, road.b],
        [t, s, road.a],
      ] as const) {
        // the far room's name is off screen, though the edge of its cloud may show
        if (!inView(near, view) || onView(far, view)) continue;
        const node = scene.nodes.get(key);
        if (!node) continue;
        const nx = Math.min(Math.max(near.x, c.left), view.w - c.right),
          ny = Math.min(Math.max(near.y, c.top), view.h - c.bottom);
        const dx = far.x - nx,
          dy = far.y - ny;
        const name = node.name.length > LONGEST ? `${node.name.slice(0, LONGEST - 1)}…` : node.name;
        const text = `${arrowOf(dx, dy)} ${name}`;
        const px = ITEM_PX,
          w = textWidth(text, px) + px,
          h = px * 1.6;
        const [left, right] = [c.left + w / 2 + SIGN_INSET, view.w - c.right - w / 2 - SIGN_INSET];
        const [top, bottom] = [c.top + h / 2 + SIGN_INSET, view.h - c.bottom - h / 2 - SIGN_INSET];
        if (left > right || top > bottom) continue;
        // how far along the way out the line meets the edge kept clear
        const k = Math.min(
          dx > 0 ? (right - nx) / dx : dx < 0 ? (left - nx) / dx : Infinity,
          dy > 0 ? (bottom - ny) / dy : dy < 0 ? (top - ny) / dy : Infinity,
        );
        if (!Number.isFinite(k) || k < 0) continue;
        const weight = (last - depth) * 1e6 - 5e5 + road.forward + road.back;
        if ((signs.get(key)?.weight ?? -Infinity) >= weight) continue;
        const fill = colours.get(key) ?? look.faint;
        signs.set(key, {
          key,
          text,
          x: Math.min(Math.max(nx + dx * k, left), right),
          y: Math.min(Math.max(ny + dy * k, top), bottom),
          px,
          fill: look.card,
          edge: fill,
          ink: inkOf(fill, look.card, look),
          alpha,
          weight,
        });
      }
    }
  });
  return [...signs.values()];
}
