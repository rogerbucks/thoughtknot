// Fetching an outside data set (editor spec §52, data_set_access). The one gate every fetch of a linked data set goes
// through, whatever host does the fetching:
// - nothing is fetched until the person asks for it, never as a note opens or is drawn;
// - only the sources the person picked are reached, and only over https (no byte travels unencrypted);
// - the host signs in its own way. A password or token is never part of the place a note keeps, and a place that
//   holds one is refused before anything is sent;
// - data above the classification the note allows is refused, saying why, and never kept.
// Host-free: the host gives the fetch itself, which uses the host's sign-in. A refused fetch never reaches it.
import gs from '@thoughtknot/graph-spec';
import { classificationOf } from './claude-gate.ts';
import { word } from './words.ts';

/** What the host's fetch gives back: the text, and the classification its source labels it with, if any. */
export interface Fetched {
  text: string;
  classification?: string;
}

/** The host's own fetch of one https address, signed in its own way. It is reached only through `fetchDataSet`. */
export type HostFetch = (url: string) => Promise<Fetched>;

/** Who may be reached, and what the note may hold. */
export interface DataSetAccess {
  /** The sources the person picked: each an https origin, such as `https://data.example.org`. */
  picked: readonly string[];
  /** The classifications a note may carry, lowest first (settings). */
  levels: readonly string[];
  /** The note's own classification; none, it counts as `unlabelled`. */
  note: string | null;
  /** The level a note with none counts as. */
  unlabelled: string;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
// the host's URL, as ai-reviewers.ts reads it: the core has no DOM, so only the parts read here are declared
declare const URL: new (input: string) => {
  protocol: string;
  username: string;
  password: string;
  origin: string;
};
type Address = InstanceType<typeof URL>;

const rank = (levels: readonly string[], level: string) => levels.findIndex((l) => same(l, level));

/** `place` with its trailing slashes taken off, by counting back, so a long run of them costs no more than its length. */
function trimmedSlashes(place: string): string {
  let end = place.length;
  while (end > 0 && place[end - 1] === '/') end -= 1;
  return place.slice(0, end);
}

/** The origin of an https address, or why it may not be reached; a place holding a secret is refused first. */
export function placeProblem(place: string, picked: readonly string[]): string | { origin: string } {
  if (gs.secretsIn(place).length) return word('data-access.secret');
  let url: Address;
  try {
    url = new URL(place);
  } catch {
    return word('data-access.not-address', { place });
  }
  if (url.username || url.password) return word('data-access.secret');
  if (url.protocol !== 'https:') return word('data-access.not-https', { place });
  const origin = url.origin;
  if (!picked.some((p) => same(trimmedSlashes(p), origin))) return word('data-access.not-picked', { origin });
  return { origin };
}

/** The level data comes in at: the source's label, or the classification in its front matter; null when neither. */
function levelOfData(got: Fetched): string | null {
  if (got.classification?.trim()) return got.classification.trim();
  const c = classificationOf(got.text);
  return c.kind === 'given' ? c.level : c.kind === 'unknown' ? '' : null;
}

/**
 * The data set at `place`, fetched by the host, or why not. `asked` is whether the person asked for this fetch now:
 * without it, nothing is reached. Data labelled above the note's classification, or labelled with a level the
 * settings do not know, is refused and not kept.
 */
export async function fetchDataSet(
  place: string,
  asked: boolean,
  access: DataSetAccess,
  fetch: HostFetch,
): Promise<{ text: string } | { refused: string }> {
  if (!asked) return { refused: word('data-access.not-asked') };
  const where = placeProblem(place, access.picked);
  if (typeof where === 'string') return { refused: where };
  let got: Fetched;
  try {
    got = await fetch(place);
  } catch (e) {
    return { refused: word('data-access.failed', { origin: where.origin, why: String(e) }) };
  }
  const level = levelOfData(got);
  if (level !== null) {
    const allowed = rank(access.levels, access.note ?? access.unlabelled);
    const at = rank(access.levels, level);
    if (at < 0 || allowed < 0) return { refused: word('data-access.level-unknown', { level: level || '?' }) };
    if (at > allowed)
      return {
        refused: word('data-access.above', { level, note: access.levels[allowed] ?? access.unlabelled }),
      };
  }
  return { text: got.text };
}
