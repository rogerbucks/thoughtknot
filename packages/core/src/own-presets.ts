// A person's own view presets, kept as a list (editor spec ES§69, view_presets_own_list).
// The list is one small text, kept as a setting. Each item is a preset file, read as untrusted when the list is read.
// Host-free and pure: every change gives the new text and keeps the old one as it was.
import { presetFrom, setOwnList } from './view-presets.ts';
import type { ViewPreset } from './view-presets.ts';

/** The format the list says it is in. */
const LIST_FORMAT = 'thoughtknot-own-presets@1';
/** The id of every own preset starts with this, so none is ever taken for a starter. */
export const OWN_PREFIX = 'own:';
/** The most presets a person may keep, so one bad file cannot grow the settings without end. */
export const MOST_OWN = 30;
const MOST_NAME = 60;
const FILE_FORMAT = 'thoughtknot-view-preset@1';

/** The items in a list's text, as the plain things they hold; none when it is not a list. */
function itemsOf(text: string): unknown[] {
  try {
    const raw: unknown = JSON.parse(text);
    const items = raw && typeof raw === 'object' ? (raw as { format?: unknown; items?: unknown }) : {};
    return items.format === LIST_FORMAT && Array.isArray(items.items) ? items.items : [];
  } catch {
    return [];
  }
}

/** `list` as its text. */
function textOf(list: readonly ViewPreset[]): string {
  const items = list.slice(0, MOST_OWN).map((p) => ({
    format: FILE_FORMAT,
    id: p.id,
    name: p.name,
    sentence: p.sentence,
    chain: p.chain,
    settings: p.settings,
  }));
  return JSON.stringify({ format: LIST_FORMAT, items });
}

/** The presets the text holds, each read as untrusted and raised to the floor; those that are not presets are left out. */
export function readOwnList(text: string): ViewPreset[] {
  const out: ViewPreset[] = [];
  const taken = new Set<string>();
  for (const item of itemsOf(text).slice(0, MOST_OWN)) {
    if (!item || typeof item !== 'object') continue;
    const read = presetFrom(JSON.stringify(item));
    if ('problems' in read) continue;
    let id = read.id.startsWith(OWN_PREFIX) ? read.id : `${OWN_PREFIX}${read.id}`;
    for (let n = 2; taken.has(id); n++) id = `${OWN_PREFIX}${read.id.replace(OWN_PREFIX, '')}-${n}`;
    taken.add(id);
    out.push({ ...read, id });
  }
  return out;
}

/** The name `given` as it is kept: one line, cut short; else `fallback` when there is none. */
const nameOf = (given: string, fallback: string): string =>
  given.replace(/\s+/g, ' ').trim().slice(0, MOST_NAME) || fallback;

/** The list text with a copy of `preset` added under `name`, as its own. Full lists take no more. */
export function addOwn(text: string, preset: ViewPreset, name: string): string {
  const list = readOwnList(text);
  if (list.length >= MOST_OWN) return textOf(list);
  const base = (preset.id.replace(OWN_PREFIX, '') || 'preset').replace(/[^a-z0-9-]/gi, '').slice(0, 20) || 'preset';
  const id = `${OWN_PREFIX}${base}-${Date.now().toString(36)}${list.length}`;
  return textOf([...list, { ...preset, id, name: nameOf(name, preset.name), sentence: preset.sentence }]);
}

/** The list text with the preset `id` named `name`; the rest as they were. */
export function renameOwn(text: string, id: string, name: string): string {
  return textOf(readOwnList(text).map((p) => (p.id === id ? { ...p, name: nameOf(name, p.name) } : p)));
}

/** The list text without the preset `id`. */
export function deleteOwn(text: string, id: string): string {
  return textOf(readOwnList(text).filter((p) => p.id !== id));
}

/** Takes the list in `text` as the person's own, for every host that reads the settings. Gives the list kept. */
export function adoptOwnList(text: string): { list: ViewPreset[]; text: string } {
  const list = readOwnList(text);
  setOwnList(list);
  return { list, text: list.length ? textOf(list) : '' };
}

/** The id `v` when it names a preset of `list`; `fallback` when it names one of the own kind that is gone; else none. */
export function ownPick(v: unknown, list: readonly ViewPreset[], fallback: string): string | undefined {
  if (typeof v !== 'string' || !v.startsWith(OWN_PREFIX)) return undefined;
  return list.some((p) => p.id === v) ? v : fallback;
}
