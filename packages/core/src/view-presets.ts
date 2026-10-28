// View presets by need (editor spec §69). It builds view_presets_saved, view_presets_by_need and view_presets_floor.
// It builds view_presets_os_wins, view_presets_scoped and view_presets_portable too.
//
// Roger, 25 Oct 2026: "all of the items in this chain could be saved as a setting for future recall".
//
// A preset is one choice for each link of a view's chain: ordering, layout, projection, detail, formatting, motion,
// text and keys. It also gives the settings it turns, so picking it sets them all at once. Each stays a setting of
// its own after. Starters are named by need, never by diagnosis: the research is on wiki/View-presets-design.md.
// WCAG 2.2 AA is a floor no preset goes below, and the device's own settings win. Host-free and pure.
import type { GraphDrawing } from './note-reading.ts';
import type { Settings } from './settings.ts';
import { word } from './words.ts';
import type { WordKey } from './words.ts';

/** One choice for each link of a view's chain. */
export interface ViewChain {
  ordering: 'flow' | 'hubs' | 'fixed' | 'name' | 'kind';
  layout: 'best' | 'rows' | 'pinned' | 'grid' | 'groups';
  projection: 'network' | 'grid' | 'matrix' | 'zoom';
  /** How far round the selected thing is shown in full, and what happens to the rest. */
  detail: { reach: 1 | 2; rest: 'shown' | 'blurred'; labels: 'by-zoom' | 'all' };
  formatting: { contrast: 'AA' | 'AAA'; palette: 'standard' | 'muted' | 'soft'; nonColourCue: true };
  motion: { mode: 'device' | 'off'; glideMs: number };
  text: { wordSpacing: number; lineHeight: number; mostLabel: number };
  keys: { trail: boolean; previewChange: boolean; layoutOnlyAsked: boolean };
}

/** A preset: its id, its name, the one line saying what it does, its chain, and the settings it turns. */
export interface ViewPreset {
  id: string;
  name: string;
  sentence: string;
  chain: ViewChain;
  settings: Partial<Settings>;
}

/** The settings a preset may turn: those a person sees in the Drawing section. */
export const PRESET_SETTINGS = [
  'direction',
  'focusDepth',
  'labelsByZoom',
  'foldHubs',
  'foldGroups',
  'mergeLinks',
  'detailsOpen',
  'miniMap',
] as const satisfies readonly (keyof Settings)[];

/** WCAG 2.2 AA spacing at least (1.4.12), with the longest label a box shows before its words are cut. */
const PLAIN_TEXT = { wordSpacing: 0.16, lineHeight: 1.5, mostLabel: 60 };
const DEFAULT_CHAIN: ViewChain = {
  ordering: 'flow',
  layout: 'best',
  projection: 'network',
  detail: { reach: 1, rest: 'shown', labels: 'by-zoom' },
  formatting: { contrast: 'AA', palette: 'standard', nonColourCue: true },
  motion: { mode: 'device', glideMs: 300 },
  text: PLAIN_TEXT,
  keys: { trail: false, previewChange: false, layoutOnlyAsked: false },
};
const DEFAULT_TURNS: Partial<Settings> = {
  direction: 'best',
  focusDepth: 'one',
  labelsByZoom: 'on',
  foldHubs: 'off',
  foldGroups: 'off',
  mergeLinks: 'off',
  detailsOpen: 'off',
  miniMap: 'auto',
};

/** A starter: its words from the catalogue, the default chain and settings changed where it says. */
const starter = (id: string, chain: Partial<ViewChain>, settings: Partial<Settings>): ViewPreset => ({
  id,
  name: word(`settings.view-preset.${id}` as WordKey),
  sentence: word(`settings.view-preset.${id}.sentence` as WordKey),
  chain: { ...DEFAULT_CHAIN, ...chain },
  settings: { ...DEFAULT_TURNS, ...settings },
});

/** The six starter presets, in the order the settings page shows them. */
export const STARTERS: readonly ViewPreset[] = [
  starter('default', {}, {}),
  starter(
    'focus',
    {
      ordering: 'hubs',
      detail: { reach: 2, rest: 'blurred', labels: 'by-zoom' },
      formatting: { contrast: 'AA', palette: 'muted', nonColourCue: true },
      motion: { mode: 'off', glideMs: 0 },
      keys: { trail: true, previewChange: false, layoutOnlyAsked: false },
    },
    { focusDepth: 'two', mergeLinks: 'on' },
  ),
  starter(
    'calm',
    {
      ordering: 'fixed',
      layout: 'pinned',
      detail: { reach: 1, rest: 'shown', labels: 'all' },
      formatting: { contrast: 'AA', palette: 'muted', nonColourCue: true },
      motion: { mode: 'off', glideMs: 0 },
      keys: { trail: false, previewChange: true, layoutOnlyAsked: true },
    },
    { direction: 'LR', labelsByZoom: 'off', mergeLinks: 'on' },
  ),
  starter(
    'detail',
    {
      ordering: 'name',
      layout: 'grid',
      projection: 'matrix',
      detail: { reach: 1, rest: 'shown', labels: 'all' },
      motion: { mode: 'off', glideMs: 0 },
    },
    { labelsByZoom: 'off', detailsOpen: 'on' },
  ),
  starter(
    'big-picture',
    { ordering: 'kind', layout: 'groups', projection: 'zoom' },
    { foldGroups: 'on', foldHubs: 'on', miniMap: 'always' },
  ),
  starter(
    'reading',
    { ordering: 'kind', text: { wordSpacing: 0.25, lineHeight: 1.5, mostLabel: 40 } },
    { direction: 'LR', detailsOpen: 'on' },
  ),
];

/** The starter of `id`, else the default. */
export const starterOf = (id: string): ViewPreset => STARTERS.find((p) => p.id === id) ?? (STARTERS[0] as ViewPreset);

/** Whether the view preset of `s` keeps everything still: nothing glides or plays, whatever the device says. */
export const holdsStill = (s: Pick<Settings, 'viewPreset'>): boolean =>
  starterOf(s.viewPreset).chain.motion.mode === 'off';

/** The classes a card takes from its view preset `id` (§69): `thoughtknot-blur-rest` blurs what focus fades. */
export const presetClasses = (id = 'default'): string[] =>
  starterOf(id).chain.detail.rest === 'blurred' ? ['thoughtknot-blur-rest'] : [];

/** Whether the view preset `id` keeps a trail of recent picks in the drawing, to go back along (view_focus_support). */
export const keepsTrail = (id = 'default'): boolean => starterOf(id).chain.keys.trail;

/** The class the host puts on the page's body while the view preset is for reading: plain words, spaced wider (§69). */
export const READING_CLASS = 'thoughtknot-reading';

/** Whether the view preset of `s` is for reading: its words spaced wider than the floor, so the host marks the page. */
export const readsPlain = (s: Pick<Settings, 'viewPreset'>): boolean =>
  starterOf(s.viewPreset).chain.text.wordSpacing > PLAIN_TEXT.wordSpacing;

/** `text` cut to at most `most` characters, at a word where one is near, and marked as cut; else as it is. */
export function shortLabel(text: string, most: number): string {
  if (text.length <= most) return text;
  const cut = text.slice(0, most - 1),
    space = cut.lastIndexOf(' ');
  return `${(space > most / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * `d` as the view preset of `s` draws it (view_reading_support). A box's words are cut short where the preset's labels
 * are shorter than the default's. The full words stay in the details, the outline and what is read aloud, which
 * read the graph, not the drawing. The default keeps every word. Every layout and every view draws the same boxes.
 */
export function labelsFor(d: GraphDrawing, s: Pick<Settings, 'viewPreset'>): GraphDrawing {
  const most = floored(starterOf(s.viewPreset).chain).text.mostLabel;
  if (most >= PLAIN_TEXT.mostLabel || !d.boxes.some((b) => b.text.length > most)) return d;
  return { ...d, boxes: d.boxes.map((b) => (b.text.length > most ? { ...b, text: shortLabel(b.text, most) } : b)) };
}

/** The settings picking `id` sets: the preset's name, and every setting it turns. */
export const presetChange = (id: string): Partial<Settings> => {
  const p = starterOf(id);
  return { viewPreset: p.id, ...p.settings };
};

/** `chain` raised to the floor no preset goes below: WCAG 2.2 AA contrast and spacing, colour never alone. */
export function floored(chain: ViewChain): ViewChain {
  return {
    ...chain,
    formatting: {
      ...chain.formatting,
      contrast: chain.formatting.contrast === 'AAA' ? 'AAA' : 'AA',
      nonColourCue: true,
    },
    text: {
      wordSpacing: Math.max(PLAIN_TEXT.wordSpacing, chain.text.wordSpacing),
      lineHeight: Math.max(PLAIN_TEXT.lineHeight, chain.text.lineHeight),
      mostLabel: Math.max(12, chain.text.mostLabel),
    },
    motion: { ...chain.motion, glideMs: Math.max(0, Math.min(chain.motion.glideMs, 500)) },
  };
}

/** What the device asks for, read by the host from its own settings. */
export interface DeviceAsks {
  reducedMotion?: boolean;
  moreContrast?: boolean;
  forcedColours?: boolean;
}

/** `chain` with the device's own settings winning, and one line for each, to show beside the drawing. */
export function deviceWins(chain: ViewChain, device: DeviceAsks): { chain: ViewChain; lines: string[] } {
  const out = floored(chain),
    lines: string[] = [];
  if (device.reducedMotion && (out.motion.mode !== 'off' || out.motion.glideMs)) {
    out.motion = { mode: 'off', glideMs: 0 };
    lines.push(word('view-preset.less-motion'));
  }
  if ((device.moreContrast || device.forcedColours) && out.formatting.contrast !== 'AAA') {
    out.formatting = { ...out.formatting, contrast: 'AAA', palette: 'standard' };
    lines.push(word('view-preset.more-contrast'));
  }
  return { chain: out, lines };
}

/** The preset that applies: the graph's own, else the vault's or workspace's, else the one for everything. */
export const presetFor = (chosen: { graph?: string; vault?: string; everywhere?: string }): ViewPreset =>
  starterOf(chosen.graph ?? chosen.vault ?? chosen.everywhere ?? 'default');

/** The format a preset file says it is in. */
const FILE_FORMAT = 'thoughtknot-view-preset@1';

/** A preset as one small file's text, to move it between hosts. */
export const presetFile = (p: ViewPreset): string =>
  `${JSON.stringify({ format: FILE_FORMAT, id: p.id, name: p.name, sentence: p.sentence, chain: p.chain, settings: p.settings }, null, 2)}\n`;

/** One of `allowed` when `v` is, else `fallback`. */
const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/**
 * The preset in a file's text, read as untrusted: every unknown key dropped, every value kept only when in range,
 * and the floor applied. Gives the problems instead when it is not a preset file.
 */
export function presetFrom(text: string): ViewPreset | { problems: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { problems: [word('view-preset.not-json')] };
  }
  const r = obj(raw);
  if (r.format !== FILE_FORMAT) return { problems: [word('view-preset.not-preset', { format: FILE_FORMAT })] };
  const c = obj(r.chain),
    d = DEFAULT_CHAIN;
  const detail = obj(c.detail),
    formatting = obj(c.formatting),
    motion = obj(c.motion),
    words = obj(c.text),
    keys = obj(c.keys);
  const chain: ViewChain = floored({
    ordering: pick(c.ordering, ['flow', 'hubs', 'fixed', 'name', 'kind'], d.ordering),
    layout: pick(c.layout, ['best', 'rows', 'pinned', 'grid', 'groups'], d.layout),
    projection: pick(c.projection, ['network', 'grid', 'matrix', 'zoom'], d.projection),
    detail: {
      reach: pick(detail.reach, [1, 2] as const, d.detail.reach),
      rest: pick(detail.rest, ['shown', 'blurred'] as const, d.detail.rest),
      labels: pick(detail.labels, ['by-zoom', 'all'] as const, d.detail.labels),
    },
    formatting: {
      contrast: pick(formatting.contrast, ['AA', 'AAA'] as const, 'AA'),
      palette: pick(formatting.palette, ['standard', 'muted', 'soft'] as const, d.formatting.palette),
      nonColourCue: true,
    },
    motion: { mode: pick(motion.mode, ['device', 'off'] as const, d.motion.mode), glideMs: num(motion.glideMs, 0) },
    text: {
      wordSpacing: num(words.wordSpacing, 0),
      lineHeight: num(words.lineHeight, 0),
      mostLabel: num(words.mostLabel, d.text.mostLabel),
    },
    keys: {
      trail: keys.trail === true,
      previewChange: keys.previewChange === true,
      layoutOnlyAsked: keys.layoutOnlyAsked === true,
    },
  });
  // only the settings a preset may turn, each as a string; the host's own reading of settings checks their range
  const s = obj(r.settings);
  const settings = Object.fromEntries(
    PRESET_SETTINGS.filter((k) => typeof s[k] === 'string').map((k) => [k, s[k]]),
  ) as Partial<Settings>;
  const line = (v: unknown, most: number) => (typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').slice(0, most) : '');
  return {
    id: line(r.id, 40) || 'imported',
    name: line(r.name, 60) || word('view-preset.imported'),
    sentence: line(r.sentence, 200),
    chain,
    settings,
  };
}
