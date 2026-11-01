// The earlier versions of notes the editor changed, kept by the host with its own data (editor spec §41,
// changes_view_obsidian; risk NEURO-2). Someone who accepted a drag, a proposal or typing a week ago can compare the
// note now with how it was before. Each version is the note's text just before the editor changed it. A burst of
// changes keeps one version, the text before the burst, so typing does not fill the list. It is host-free and pure.

/** One earlier version of a note: its whole text, and when it was kept, as an ISO time. */
export interface NoteVersion {
  text: string;
  at: string;
}

/** The earlier versions kept of each note, by its path, newest first. */
export type NoteHistory = Record<string, NoteVersion[]>;

/** How many versions of one note are kept. */
export const VERSIONS_KEPT = 10;
/** How many notes have versions kept: the note changed longest ago gives way first. */
export const NOTES_KEPT = 30;
/** The largest note kept, in characters: a bigger one is never copied into the host's data. */
export const VERSION_MOST = 256_000;
/** Changes closer together than this are one burst, which keeps one version: the text before it. */
export const BURST_MS = 5 * 60_000;

/**
 * `history` with `before`, the text of the note at `path` just before a change made `at`, kept. It is not kept when it is
 * too large or the very text kept last. Nor is it kept when the last version kept is part of the same burst.
 */
export function withVersion(history: NoteHistory, path: string, before: string, at: Date): NoteHistory {
  const kept = history[path] ?? [];
  const last = kept[0];
  if (before.length > VERSION_MOST || last?.text === before) return history;
  if (last && at.getTime() - Date.parse(last.at) < BURST_MS) return history;
  const versions = [{ text: before, at: at.toISOString() }, ...kept].slice(0, VERSIONS_KEPT);
  const others = Object.entries(history).filter(([p]) => p !== path);
  // the notes changed most recently first, and only so many of them
  const newest = (vs: NoteVersion[]) => vs[0]?.at ?? '';
  others.sort((a, b) => newest(b[1]).localeCompare(newest(a[1])));
  return Object.fromEntries([[path, versions], ...others.slice(0, NOTES_KEPT - 1)]);
}

/** The history in what was saved: each version kept when it has its text and time, else dropped. */
export function historyFrom(saved: unknown): NoteHistory {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
  const out: NoteHistory = {};
  for (const [path, list] of Object.entries(saved as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const versions = (list as unknown[]).flatMap((v) => {
      const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
      return typeof o.text === 'string' && typeof o.at === 'string' && !Number.isNaN(Date.parse(o.at))
        ? [{ text: o.text, at: o.at }]
        : [];
    });
    if (versions.length) out[path] = versions.slice(0, VERSIONS_KEPT);
  }
  return out;
}

/** The history with the versions of the note at `from` kept under `to` instead, as when the note is renamed. */
export function historyMoved(history: NoteHistory, from: string, to: string): NoteHistory {
  const moved = history[from];
  if (!moved) return history;
  const { [from]: _gone, ...rest } = history;
  return { ...rest, [to]: moved };
}
