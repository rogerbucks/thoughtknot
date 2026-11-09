// A fetched data set kept in a local cache (editor spec §52, data_set_cache). The cache records where the copy came
// from, when, and its digest. The drawing shows how old the copy is. So a graph still opens offline, and says when its
// data is old or missing (gql_file_missing).
// Host-free and pure: the host keeps the entries and does the fetching.
import { sha256 } from './ai-digest.ts';
import { word } from './words.ts';

/** One cached copy: its place, its text, the digest of the text and when it was fetched (ms since 1970). */
export interface CachedSet {
  place: string;
  text: string;
  digest: string;
  at: number;
}

/** What a data set reads as: its text and the words saying how old it is, or that it is missing. */
export type SetRead =
  | { state: 'fresh' | 'cached' | 'old'; text: string; said: string; entry: CachedSet }
  | { state: 'missing'; said: string };

/** The cache entry for `text`, fetched from `place` at `at`. */
export function cacheEntry(place: string, text: string, at: number): CachedSet {
  return { place, text, digest: sha256(text), at };
}

/** How long ago `at` was, at `now`, in words: minutes, hours or days. */
export function ageWords(at: number, now: number): string {
  const minutes = Math.max(1, Math.floor((now - at) / 60_000));
  if (minutes < 60) return word('reading.table.age-minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return word('reading.table.age-hours', { count: hours });
  return word('reading.table.age-days', { count: Math.floor(hours / 24) });
}

/**
 * What the data set at `place` reads as. `fetched` is its text fetched now, null when the fetch failed, or undefined
 * when it was not fetched. `entry` is its cached copy, if any. A new fetch makes a new entry.
 */
export function readSet(
  place: string,
  fetched: string | null | undefined,
  entry: CachedSet | undefined,
  now: number,
): SetRead {
  if (typeof fetched === 'string') {
    return {
      state: 'fresh',
      text: fetched,
      said: word('reading.table.fetched-now', { place }),
      entry: cacheEntry(place, fetched, now),
    };
  }
  if (!entry) return { state: 'missing', said: word('reading.table.fetch-missing', { place }) };
  const age = ageWords(entry.at, now);
  const key = fetched === null ? 'reading.table.fetch-failed' : 'reading.table.fetched-ago';
  return { state: fetched === null ? 'old' : 'cached', text: entry.text, said: word(key, { place, age }), entry };
}
