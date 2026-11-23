// A query saved by name (editor spec ES§75, ai_query_saved). Roger, 22 Nov 2026: a SavedQuery line keeps the words of a
// query, each prompt in order, how it is shown and its lock. It points to its NamedFilter line, which holds the filter:
//
//   (named_1:NamedFilter {name: 'Late', kind: 'Task', when: 'status == "late"'}),
//   (query_1:SavedQuery {name: 'Late', filter: 'Late', words: '["late tasks"]', show: 'highlight', locked: false})
//
// A merged query has no NamedFilter line. It holds each part's words, rule and mark itself, in `parts`. So taking out
// another saved query never breaks it. A SavedQuery whose filter line is gone reads as broken, with the reason.
// What saving, renaming and removing do to the note is filter-manage-note.ts.
//
// Host-free and pure.
import { QUERY_MARKS } from './filter.ts';
import type { Query, QueryJoin, QueryMark, QueryShow } from './filter.ts';
import { namedFilterThing } from './filter-named.ts';
import type { NamedFilterSave } from './filter-named.ts';
import type { Problem } from './note-reading.ts';
import { testsOf, whenOf } from './rule-builder.ts';
import type { RuleDraft } from './rule-builder.ts';
import type { RuleWrite } from './rule-write.ts';
import { BADGES } from './rule-words.ts';
import type { RawThing, StyledNames } from './style-checks.ts';
import type { StyleAt } from './style-graph.ts';
import { reader } from './style-reader.ts';
import { word } from './words.ts';

/** The style graph's kind for a query saved by name. */
export const SAVED_QUERY = 'SavedQuery';

/** One part of a merged query, saved whole: its prompts in order, its filter and its mark. */
export interface SavedPart {
  words: string[];
  draft: RuleDraft;
  mark: QueryMark;
}

/** A query to save: its name, its prompts in order, how it is shown, its lock, and its filter or its parts. */
export interface SavedQuerySave {
  name: string;
  words: string[];
  show: QueryShow;
  locked: boolean;
  /** The filter, kept in the NamedFilter line of the same name. None for a merged query. */
  draft?: RuleDraft;
  join?: QueryJoin;
  parts?: SavedPart[];
}

/** A query saved, read back: broken, with the reason, when its filter cannot be found or read. */
export interface SavedQuery extends SavedQuerySave {
  at: StyleAt;
  broken?: string;
}

/** A SavedQuery line read, before its filter line is found: the name of that line, if any. */
export type SavedQueryRead = Omit<SavedQuery, 'draft'> & { filter?: string };

/**
 * What the Filter panel is given for saved queries: those saved, and how to save, rename or remove one where the note
 * is edited. `confirm` asks the person before anything is sent again. `answers` are kept on this device.
 */
export interface SavedQueries {
  saved: readonly SavedQuery[];
  save?: (s: SavedQuerySave) => void;
  rename?: (from: string, to: string) => void;
  /** Asks the person first, and takes out only the query's own lines. */
  remove?: (name: string) => void;
  confirm: (said: string) => boolean | Promise<boolean>;
  answers?: { answer(key: string): RuleWrite | null; keep(key: string, rule: RuleWrite): void; clear(): number };
}

/** The prompts of `q` in order: those it was opened with, then each asked since, the same words once. */
export function queryPrompts(q: Query): string[] {
  const all = [...(q.asked ?? []), ...q.back.map((s) => s.words), q.words].filter(Boolean);
  return all.filter((w, i) => w !== all[i - 1]);
}

/** What `q` saves as `name`: its prompts, how it is shown, its lock, and its filter or each part whole. */
export function savedQueryFrom(name: string, q: Query): SavedQuerySave {
  const kept = { name, words: queryPrompts(q), show: q.show, locked: q.locked };
  if (!q.parts) return { ...kept, draft: q.draft };
  const parts = q.parts.map((p) => ({ words: queryPrompts(p), draft: p.draft, mark: p.mark }));
  return { ...kept, join: q.join ?? 'all', parts };
}

/** A change to the style graph saved by name: a filter (ES§25, untangle_filter_saved), or a query. */
export type SavedChange = { named: NamedFilterSave } | { query: SavedQuerySave };

/** The NamedFilter or SavedQuery line `change` writes, or why it cannot be written. */
export function savedThing(change: SavedChange) {
  return 'named' in change ? namedFilterThing(change.named) : savedQueryThing(change.query);
}

/** The SavedQuery line `s` writes, changed in place for the same name. */
export function savedQueryThing(s: SavedQuerySave) {
  const parts = s.parts?.map((p) => ({ ...p.mark, words: p.words, kind: p.draft.of, when: whenOf(p.draft) }));
  return {
    kind: SAVED_QUERY,
    props: [
      ['name', s.name.trim()],
      ['filter', s.parts ? undefined : s.name.trim()],
      ['words', JSON.stringify(s.words)],
      ['show', s.show],
      ['locked', s.locked],
      ['join', s.parts ? s.join : undefined],
      ['parts', parts ? JSON.stringify(parts) : undefined],
    ] as [string, string | boolean | undefined][],
    match: [['name', s.name.trim()]] as [string, string][],
  };
}

const texts = (v: unknown): v is string[] => Array.isArray(v) && v.every((w) => typeof w === 'string');
const json = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

/** One part of `parts` read back, or null when it is not one. Its tests are read by the builder, so no text is run. */
function partOf(p: unknown): SavedPart | null {
  if (!p || typeof p !== 'object') return null;
  const { words, kind, when, badge, colour } = p as Record<string, unknown>;
  const tests = typeof when === 'string' ? testsOf(when) : null;
  // only a mark's own colour is taken: any other the drawing has no hue for
  const ok = texts(words) && typeof kind === 'string' && tests && QUERY_MARKS.some((m) => m.colour === colour);
  if (!ok || !(BADGES as readonly unknown[]).includes(badge)) return null;
  return {
    words,
    draft: { on: 'things', of: kind, tests },
    mark: { badge: badge as QueryMark['badge'], colour: colour as string },
  };
}

/** A SavedQuery line, read and checked. A line with no name is a problem and left out; one that cannot be read is broken. */
export function savedQueryOf(raw: RawThing, names: StyledNames, out: Problem[]): SavedQueryRead | null {
  const r = reader(raw, names, out);
  const name = r.text('name')?.trim();
  if (!name) {
    r.missing(word('filter.saved-query.name'), word('filter.saved-query.name.fix'));
    return null;
  }
  const words = json(r.text('words') ?? '[]');
  const show = r.word('show', ['filter', 'highlight'] as const, word('filter.saved-query.show')) ?? 'filter';
  const kept = { name, words: texts(words) ? words : [], show, locked: raw.props.locked === true, at: raw.at };
  const filter = r.text('filter');
  if (filter !== undefined) return { ...kept, filter };
  const read = json(r.text('parts') ?? '');
  const parts = Array.isArray(read) ? read.map(partOf) : [];
  const join = r.text('join') === 'any' ? 'any' : 'all';
  if (parts.length < 2 || parts.some((p) => !p)) return { ...kept, broken: word('filter.saved-query.parts', { name }) };
  return { ...kept, join, parts: parts as SavedPart[] };
}

/**
 * The queries saved, each with its filter found by name among the NamedFilter lines written. A line not found, or
 * not read, leaves the query broken with the reason: it is listed still, never dropped.
 */
export function savedQueriesResolved(
  reads: readonly SavedQueryRead[],
  written: ReadonlyMap<string, { kind?: string; when?: string }>,
): SavedQuery[] {
  return reads.map(({ filter, ...s }) => {
    if (filter === undefined || s.broken) return s;
    const line = written.get(filter);
    if (!line) return { ...s, broken: word('filter.saved-query.gone', { name: s.name, filter }) };
    const tests = line.when === undefined ? null : testsOf(line.when);
    if (!tests) return { ...s, broken: word('filter.saved-query.unread', { name: s.name, filter }) };
    return { ...s, draft: { on: 'things', of: line.kind ?? '', tests } };
  });
}
