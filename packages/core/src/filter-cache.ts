// The answers kept for queries asked in words (editor spec ES§75, ai_query_cache). Each answer is kept on this device,
// in a cache of its own for each vault, which the person can clear. Its key is the words, the rule being refined, and
// the note's kinds and property names. Never its content: no value of the note is in a key. A key already kept reuses
// its answer, with nothing sent. A kept answer is read again as untrusted before it fills anything.
//
// Host-free: the host gives the device's store.
import type { SendResult } from './ai.ts';
import { sha256 } from './ai-digest.ts';
import { filterOfRule } from './filter-ask.ts';
import type { Query } from './filter.ts';
import type { RuleChoices, RuleField } from './rule-builder.ts';
import { ruleRefusal } from './rule-write.ts';
import type { RuleWrite } from './rule-write.ts';

/** A store on this device, such as the host's local storage, holding texts by key. */
export interface DeviceStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

/** The answers kept for one vault: one found by its key, one kept, and all of them cleared. */
export interface QueryCache {
  answer(key: string): RuleWrite | null;
  keep(key: string, rule: RuleWrite): void;
  /** Clears this vault's answers, and no other's. How many there were. */
  clear(): number;
}

/** The rule `q` stands at, without its words: its kind and tests, or its parts and how they are joined. */
const ruleOf = (q: Query): unknown =>
  q.parts ? { join: q.join ?? 'all', parts: q.parts.map(ruleOf) } : { of: q.draft.of, tests: q.draft.tests };
const names = (fields: readonly RuleField[]) => fields.map((f) => f.name).sort();

/** The key of an answer: the words, the rule `refined` if any, and the note's kinds, types and property names. */
export function queryCacheKey(words: string, refined: Query | null, choices: RuleChoices): string {
  return JSON.stringify({
    words: words.trim().replace(/\s+/g, ' '),
    rule: refined ? ruleOf(refined) : null,
    kinds: [...choices.kinds].sort(),
    types: [...choices.types].sort(),
    things: names(choices.things),
    links: names(choices.links),
  });
}

/** What `f` gives, or `or` when the store throws: full, or turned off. A kept answer is never worth losing a send. */
function safely<T>(f: () => T, or: T): T {
  try {
    return f();
  } catch {
    return or;
  }
}

/** The cache of `vault` in `store`. Its entries are named by a digest of the vault and of each key. */
export function queryCache(store: DeviceStore, vault: string): QueryCache {
  const prefix = `thoughtknot.query-answers.${sha256(vault).slice(0, 16)}.`;
  return {
    answer(key) {
      const kept = safely(() => store.get(prefix + sha256(key)), null);
      const rule = safely<unknown>(() => (kept ? JSON.parse(kept) : null), null);
      // read again as untrusted: only a filter on things the builder reads back, with no fault
      if (!rule || typeof rule !== 'object') return null;
      const r = rule as RuleWrite;
      return typeof r.when === 'string' && filterOfRule(r) && !ruleRefusal(r) ? r : null;
    },
    keep(key, rule) {
      safely(() => store.set(prefix + sha256(key), JSON.stringify(rule)), undefined);
    },
    clear() {
      const mine = safely(() => store.keys(), []).filter((k) => k.startsWith(prefix));
      for (const k of mine) safely(() => store.remove(k), undefined);
      return mine.length;
    },
  };
}

/** An answer: a send's result, or a rule kept on this device. */
export type QueryAnswer = SendResult | { rule: RuleWrite };

/** The answer for `key`: the one kept, with nothing sent; or `send`'s, kept when it is a rule. Whether it was sent. */
export async function queryAnswerFor(
  cache: QueryCache | undefined,
  key: string,
  send: () => Promise<SendResult>,
): Promise<{ result: QueryAnswer; sent: boolean }> {
  const kept = cache?.answer(key);
  if (kept) return { result: { rule: kept }, sent: false };
  const result = await send();
  if ('rule' in result) cache?.keep(key, result.rule);
  return { result, sent: true };
}
