// Rooms opened like folders on the new rendering (editor spec §73, render_room_folders). Roger, 9 Nov 2026: the old way
// of going into a level was not intuitive. Now the first click on a room picks it: it is ringed, and the details list
// what is in it by name. Nothing moves. The second click, or Enter, opens it: the camera glides until the room fills
// the screen, near enough that what is in it shows named. The badge shows the way in, as "All › Core", and Back, or
// Backspace, goes up one room. A zoom or a pan only moves the camera: it never opens or shuts a room. Things stay put.
import type { Scene } from '../../render/render-scene.ts';
import type { Spot } from '../../render/render-rooms.ts';
import type { View } from '../../render/render-marks.ts';
import { centreOn } from '../../render/render-camera.ts';
import { scaleToOpen } from '../../render/render-detail.ts';
import { word } from '../../words.ts';

/** How much of the part of the screen left clear an open room fills. */
export const FILL = 0.85;

/** A room picked, as its details show it: its name, its level, a sentence, and what is in it, each a choice. */
export interface StageRoom {
  name: string;
  kind: string;
  said: string;
  parts: { name: string; go: () => void }[];
}

/** What the rooms ask of the card: open a thing, let the choice go, and show a room's details. */
export interface RoomHands {
  open: (key: string) => void;
  clear: () => void;
  room?: (r: StageRoom) => void;
}

/** What the rooms ask of the stage. */
export interface RoomsHost {
  scene: Scene;
  spots: Map<string, Spot>;
  sizes: readonly number[];
  view: () => View;
  hands: RoomHands | undefined;
  /** The whole drawing fitted, for going up from a top room; a glide; and a new frame. */
  stage: { fitted: () => View; glideTo: (to: View) => void; draw: () => void };
}

/**
 * The view that opens the room at `spot`, `depth` deep. It fills the part of the screen left clear, and is near
 * enough that the level in it shows, named.
 */
export function roomView(view: View, spot: Spot, sizes: readonly number[], depth: number): View {
  const c = view.clear ?? { left: 0, right: 0, top: 0, bottom: 0 };
  const side = Math.min(view.w - c.left - c.right, view.h - c.top - c.bottom);
  return centreOn(view, spot, Math.max((FILL * side) / (2 * spot.r || 1), scaleToOpen(sizes, depth + 1)));
}

/** The rooms `key` sits in, far to near, and then `key` itself. */
export function pathTo(scene: Scene, key: string): string[] {
  const path: string[] = [];
  for (let at: string | undefined = key; at !== undefined; at = scene.nodes.get(at)?.parent) path.unshift(at);
  return path;
}

/** The rooms of one stage: the one picked, and the one open. */
export class StageRooms {
  picked: string | null = null;
  open: string | null = null;
  private readonly host: RoomsHost;

  constructor(host: RoomsHost) {
    this.host = host;
  }

  /** Whether `key` is a room: a group, not an item. */
  isRoom(key: string): boolean {
    const node = this.host.scene.nodes.get(key);
    return !!node && node.depth < this.host.scene.depths.length - 1;
  }

  /** Whether `key` is the room open now or one it sits in: a click there is a click on its empty floor. */
  around(key: string): boolean {
    return !!this.open && pathTo(this.host.scene, this.open).includes(key);
  }

  /** A click on room `key`: the first picks it and lists what is in it; the second opens it. */
  clicked(key: string): void {
    if (this.picked === key) return this.enter(key);
    this.pick(key);
  }

  /** Picks room `key`: it is ringed and its details list what is in it. Nothing moves. */
  pick(key: string): void {
    const { scene, hands, stage } = this.host,
      node = scene.nodes.get(key);
    if (!node) return;
    hands?.clear();
    this.picked = key;
    const parts = node.children.map((k) => {
      const name = scene.nodes.get(k)?.name ?? k;
      return { name, go: () => (this.isRoom(k) ? this.pick(k) : ((this.picked = null), hands?.open(k), stage.draw())) };
    });
    const said = word('levels.room-said', { count: node.items.length });
    hands?.room?.({ name: node.name, kind: scene.depths[node.depth] ?? '', said, parts });
    stage.draw();
  }

  /** Opens room `key`: the camera glides until it fills the screen, with what is in it named. */
  enter(key: string): void {
    const spot = this.host.spots.get(key),
      node = this.host.scene.nodes.get(key);
    if (!spot || !node) return;
    this.open = key;
    this.picked = key;
    this.host.stage.glideTo(roomView(this.host.view(), spot, this.host.sizes, node.depth));
  }

  /** Opens the room picked, as Enter does; says whether there was one. */
  enterPicked(): boolean {
    if (!this.picked || this.picked === this.open) return false;
    this.enter(this.picked);
    return true;
  }

  /** Goes up one room, or out to the whole drawing from a top room; says whether a room was open. */
  up(): boolean {
    if (!this.open) return false;
    const parent = this.host.scene.nodes.get(this.open)?.parent;
    if (parent !== undefined) return (this.enter(parent), true);
    this.shut();
    this.host.stage.glideTo(this.host.stage.fitted());
    return true;
  }

  /** No room open or picked, as after a Fit. */
  shut(): void {
    this.open = this.picked = null;
  }

  /** A key pressed in the card: Enter opens the room picked, and Backspace or Escape goes up one. */
  key(e: KeyboardEvent): void {
    if (ownKey(e)) return;
    if (e.key === 'Enter' ? this.enterPicked() : (e.key === 'Backspace' || e.key === 'Escape') && this.up())
      e.preventDefault();
  }

  /** The way in, as the badge says it: "All", then "All › Core › Plans" as rooms open (Roger, 9 Nov 2026). */
  crumbs(): string {
    const names = this.open
      ? pathTo(this.host.scene, this.open).map((k) => this.host.scene.nodes.get(k)?.name ?? k)
      : [];
    return [word('levels.all'), ...names].join(word('levels.crumb-gap'));
  }
}

/** Whether a key pressed in the card is for its own field or button, not the drawing. */
const ownKey = (e: KeyboardEvent): boolean =>
  !!(e.target as HTMLElement | null)?.closest?.('button, input, textarea, select, [contenteditable]');
