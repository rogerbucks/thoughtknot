// The statements a file breaks into, kept by the file's hash (ES§63, connector_derived_kept_apart).
// - They are derived data (ES§11): rebuilt from the file and its mapping, never written into the note.
// - A file read again with the same bytes, the same mapping and the same shared schemas gives the very read kept
//   before. So a big workbook or database is not broken up again each time its card is drawn.
// - Any change to the file or its mapping is a new hash, so it is read afresh. A refusal is never kept.
// - It holds at most a few reads, the oldest dropped first, so it never grows without end.
// Host-free and pure, apart from the reads it holds.
import { sha256, sha256Bytes } from './ai-digest.ts';
import { connect } from './connectors.ts';
import type { Connected } from './connectors.ts';
import { placeKey } from './sources.ts';
import type { Fetched, Source, SourceRefusal } from './sources.ts';

/** The most reads a cache holds. */
export const CONNECT_CACHE_MOST = 32;

/** A cache of reads by file hash, and how many times it was asked and found one. */
export interface ConnectCache {
  /** The read of `source` from `fetched`: the one kept, when the file and mapping are unchanged, or a new one. */
  connect(source: Source, fetched: Fetched, shared?: string[]): Connected | SourceRefusal;
  /** How many reads it holds. */
  readonly size: number;
  /** How many asks it answered with a read it held. */
  readonly hits: number;
}

/** The hash a read is kept by: the place, the file's bytes or text, its mapping and the shared schemas. Or null. */
export function cacheKey(source: Source, fetched: Fetched, shared: readonly string[] = []): string | null {
  const file = 'bytes' in fetched ? sha256Bytes(fetched.bytes) : 'text' in fetched ? sha256(fetched.text) : null;
  if (file === null) return null;
  const mapping = 'mapping' in fetched && fetched.mapping !== undefined ? sha256(fetched.mapping) : '';
  return sha256(JSON.stringify([source.kind ?? '', source.graph, placeKey(source), file, mapping, shared]));
}

/** A new, empty cache holding at most `most` reads. */
export function connectCache(most = CONNECT_CACHE_MOST): ConnectCache {
  const kept = new Map<string, Connected>();
  let hits = 0;
  return {
    connect(source, fetched, shared = []) {
      const key = cacheKey(source, fetched, shared);
      const held = key === null ? undefined : kept.get(key);
      if (key !== null && held) {
        hits++;
        // the newest used goes last, so the oldest is dropped first
        kept.delete(key);
        kept.set(key, held);
        return held;
      }
      const read = connect(source, fetched, shared);
      if (key === null || 'refused' in read) return read;
      kept.set(key, read);
      for (const old of kept.keys()) {
        if (kept.size <= most) break;
        kept.delete(old);
      }
      return read;
    },
    get size() {
      return kept.size;
    },
    get hits() {
      return hits;
    },
  };
}
