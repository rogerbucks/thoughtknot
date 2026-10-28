// Layouts a plug-in adds (editor spec §68, layout_plugins). Roger, 25 Oct 2026: "plug-and-play layouts". A layout:
// - is named under its plug-in's id, as a diagram type is (style-graph.ts, `pluginTypeOf`): `acme.shapes.circle`;
// - is given the graph's shape, last time's spots, the person's layout options and each box's size, all frozen copies;
// - gives back a spot for each thing, across and down, in its own units. It draws nothing.
// The core checks the spots: every thing given has one, and each is two finite numbers. Then our own engine scales them
// to the drawing, pushes apart boxes that overlap and draws the links (own-engine.ts). So it shows in every view the
// flat drawing does. In 2.5D it is lifted, and in 3D each thing keeps its spot across and down.
import type { GraphShape } from './types-shape.ts';
import type { LayoutOptions } from './layouts/layout-options.ts';
import type { PluginCalls, PluginResult } from './plugin-calls.ts';
import { pluginTypeOf } from './style-graph.ts';
import { word } from './words.ts';

/** A thing's spot, across and down, by its key. */
export type GivenSpots = Readonly<Record<string, readonly [number, number]>>;

/** What a layout is given: the shape, last time's spots, the options and each box's size, frozen. */
export interface LayoutGiven {
  shape: GraphShape;
  /** Each thing's spot from last time, for a warm start; empty, laid out afresh. */
  previous: GivenSpots;
  options: LayoutOptions;
  /** Each box's width and height, where the drawing has measured it; a layout may leave room by them. */
  sizes: GivenSpots;
}

/** A layout a plug-in adds, such as things round a circle. */
export interface PluginLayout {
  /** Its name, under its plug-in's own id, as a style graph and the View menu choose it: `acme.shapes.circle`. */
  id: string;
  /** What it is called in the View menu, in the host's language. */
  title: string;
  /** How many dimensions its spots have: two, across and down. In 3D each thing keeps them, its depth laid out. */
  dims: 2;
  /** Each thing of `given.shape` placed: its spot by its key, as an object or a map. */
  place: (given: LayoutGiven) => LayoutPlaced | Promise<LayoutPlaced>;
}

/** What a layout gives back: each thing's spot by its key. */
export type LayoutPlaced = Readonly<Record<string, readonly number[]>> | ReadonlyMap<string, readonly number[]>;

/** Why a layout the plug-in `pluginId` adds is refused, or null when it is accepted. */
export function layoutProblem(l: PluginLayout, pluginId: string, taken: Map<string, string>): string | null {
  if (pluginTypeOf(l.id)?.plugin !== pluginId) return `the layout "${l.id}" is not named ${pluginId}.<word>`;
  if (taken.has(l.id)) return `the layout "${l.id}" is added already`;
  if (typeof l.title !== 'string' || !l.title.trim() || /[\r\n]/.test(l.title))
    return `the layout "${l.id}" has no title on one line`;
  if (l.dims !== 2) return `the layout "${l.id}" does not place things in two dimensions`;
  if (typeof l.place !== 'function') return `the layout "${l.id}" places nothing`;
  return null;
}

/** A frozen copy of `value`, all the way down, so a plug-in cannot change what it was given. */
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) frozen(v);
    Object.freeze(value);
  }
  return value;
}

/** What a layout is given: copies of each, frozen. */
export function layoutGiven(given: LayoutGiven): LayoutGiven {
  const pairs = (spots: GivenSpots) =>
    Object.fromEntries(Object.entries(spots).map(([k, [x, y]]): [string, [number, number]] => [k, [x, y]]));
  return frozen({
    shape: {
      things: given.shape.things.map((t) => ({ ...t, kinds: [...t.kinds] })),
      links: given.shape.links.map((l) => ({ ...l })),
    },
    previous: pairs(given.previous),
    options: { ...given.options },
    sizes: pairs(given.sizes),
  });
}

/** The spots a layout gave back for `shape`, as plain pairs, or why they are refused. */
export function spotsOf(raw: unknown, shape: GraphShape): Record<string, [number, number]> | string {
  const entries =
    raw instanceof Map
      ? [...(raw as Map<unknown, unknown>)]
      : raw && typeof raw === 'object' && !Array.isArray(raw)
        ? Object.entries(raw)
        : null;
  if (!entries) return 'it gave back no spots';
  const keys = new Set(shape.things.map((t) => t.key));
  const out: Record<string, [number, number]> = {};
  for (const [k, v] of entries) {
    if (typeof k !== 'string' || !keys.has(k)) return `it gave a spot to ${JSON.stringify(k)}, which it was not given`;
    const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
    if (!Array.isArray(v) || v.length !== 2 || !finite(v[0]) || !finite(v[1]))
      return `the spot of ${JSON.stringify(k)} is not two numbers`;
    out[k] = [v[0] as number, v[1] as number];
  }
  const missing = [...keys].find((k) => !Object.hasOwn(out, k));
  return missing === undefined ? out : `it gave no spot to ${JSON.stringify(missing)}`;
}

/** A layout found by its id, and the plug-in that adds it. */
type Found = { l: PluginLayout; plugin: string } | undefined;

/** The registry's way to place a graph by a plug-in's layout, each call timed and its spots checked (plugins.ts). */
export function layoutPlacing(find: (id: string) => Found, awaited: PluginCalls['awaited']) {
  return {
    async placeBy(id: string, given: LayoutGiven): Promise<PluginResult<Record<string, [number, number]>>> {
      const found = find(id);
      if (!found) return { ok: false, plugin: '', message: word('plugins.none.layout', { name: id }) };
      const { l, plugin } = found;
      const what = word('plugins.what.layout', { title: l.title });
      const copy = layoutGiven(given);
      const r = await awaited(plugin, what, () => l.place(copy));
      if (!r.ok) return r;
      const spots = spotsOf(r.value, copy.shape);
      if (typeof spots === 'string')
        return { ok: false, plugin, message: word('plugins.layout.not-placed', { what, plugin, why: spots }) };
      return { ok: true, value: spots };
    },
  };
}
