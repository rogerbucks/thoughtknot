// The queries asked in words, drawn in the Filter panel's list (editor spec ES§75). Each holds its words, to change and
// ask again, beside the filter they became. It shows how it is shown, its lock, Step back, and its parts when merged.
// A bar below merges the chosen. What each does is the panel's, filter-query-list.ts.
import { word } from '@thoughtknot/core';
import { filterSaid } from '../../filter-ask.ts';
import { filterWords, querySaid } from '../../filter.ts';
import type { Query, QueryJoin, QueryShow } from '../../filter.ts';
import { button } from '../button.ts';
import { legendBadge } from './untangle-query-legend.ts';

/** Which query the rows show: a query listed, or one part of a merged one. */
export interface Target {
  id: string;
  part?: string;
}

/** What a person does to a query in the list. */
export interface QueryActs {
  ask: (t: Target, words: string) => void;
  pick: (t: Target) => void;
  shown: (q: Query, show: QueryShow) => void;
  lock: (q: Query) => void;
  back: (q: Query) => void;
  choose: (q: Query, on: boolean) => void;
  joinAs: (join: QueryJoin) => void;
  merge: () => void;
  joined: (q: Query, join: QueryJoin) => void;
  partOut: (q: Query, part: string) => void;
}

/** What the list draws: the queries, the one the rows show, those chosen to merge and how they would be joined. */
export interface ListView {
  qs: readonly Query[];
  current: Target | null;
  chosen: ReadonlySet<string>;
  join: QueryJoin;
}

/** A list to pick all of them or any of them, in `row`, named `name`. */
function joinPick(row: HTMLElement, name: string, join: QueryJoin, change: (join: QueryJoin) => void): void {
  const pick = row.createEl('select', { attr: { name, 'aria-label': word('filter.query.merge-as') } });
  pick.createEl('option', { text: word('filter.query.join-all'), attr: { value: 'all' } });
  pick.createEl('option', { text: word('filter.query.join-any'), attr: { value: 'any' } });
  pick.value = join;
  pick.addEventListener('change', () => change(pick.value === 'any' ? 'any' : 'all'));
}

/** The queries of `v` in `list`, each a query item, and below them a bar to merge the chosen, for two or more. */
export function queryList(list: HTMLElement, v: ListView, acts: QueryActs): void {
  list.empty();
  for (const q of v.qs) queryItem(list, q, v, acts);
  if (v.qs.length < 2) return;
  // a line of the list of its own, as a list holds only its lines
  const bar = list.createDiv({ cls: 'thoughtknot-query-merge', attr: { role: 'listitem' } });
  joinPick(bar, 'query-merge-join', v.join, acts.joinAs);
  const merge = button(bar, word('filter.query.merge'), 'layers', acts.merge, word('filter.query.merge'));
  merge.disabled = v.chosen.size < 2;
}

/**
 * The query `q` in `list`. It holds its words, to change and ask again, beside the filter they became. It says when
 * the words no longer match, and shows a lock mark while locked. Then come a box to choose it to merge and how it
 * is shown. A merged one says how its parts are joined. Last come the lock, Step back, and a button to work on it. A merged query lists
 * its parts below.
 */
function queryItem(list: HTMLElement, q: Query, v: ListView, acts: QueryActs): void {
  const item = list.createDiv({ cls: 'thoughtknot-query', attr: { role: 'listitem', 'data-query': q.id } });
  if (q.id === v.current?.id) item.addClass('is-current');
  if (v.qs.length > 1) {
    const box = item.createEl('label', { cls: 'thoughtknot-query-choose' });
    const named = word('filter.query.choose-one', { said: querySaid(q) });
    const choose = box.createEl('input', { attr: { name: 'query-choose', type: 'checkbox', 'aria-label': named } });
    box.createSpan({ text: word('filter.query.choose') });
    choose.checked = v.chosen.has(q.id);
    choose.addEventListener('change', () => acts.choose(q, choose.checked));
  }
  const words = item.createEl('input', {
    attr: { name: 'query-words', type: 'text', 'aria-label': word('filter.query.words') },
  });
  words.value = q.words;
  words.disabled = q.locked;
  words.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const said = words.value.trim();
    if (said) acts.ask({ id: q.id }, said);
  });
  const rule = [
    q.locked ? word('filter.query.lock-mark') : '',
    word('filter.query.became', { rule: q.parts ? filterWords(q) : filterSaid(q.draft) }),
    q.matches ? '' : word('filter.query.unmatched'),
  ];
  item.createDiv({ cls: 'thoughtknot-query-rule', text: rule.filter(Boolean).join(' ') });
  const row = item.createDiv({ cls: 'thoughtknot-query-acts' });
  const as = row.createEl('select', { attr: { name: 'query-show', 'aria-label': word('filter.query.show-as') } });
  as.createEl('option', { text: word('filter.query.as-filter'), attr: { value: 'filter' } });
  as.createEl('option', { text: word('filter.query.as-highlight'), attr: { value: 'highlight' } });
  as.value = q.show;
  as.addEventListener('change', () => acts.shown(q, as.value === 'highlight' ? 'highlight' : 'filter'));
  if (q.parts) joinPick(row, 'query-join', q.join ?? 'all', (join) => acts.joined(q, join));
  const lockLabel = word(q.locked ? 'filter.query.unlock' : 'filter.query.lock');
  const lock = button(row, lockLabel, 'lock', () => acts.lock(q)); // pressed while locked, as a board layer's
  lock.setAttribute('aria-pressed', String(q.locked));
  const back = button(row, word('filter.query.back'), 'undo-2', () => acts.back(q));
  back.disabled = q.locked || !q.back.length;
  const pick = button(row, word('filter.query.pick'), 'pencil', () => acts.pick({ id: q.id }));
  if (q.id === v.current?.id && !v.current.part) pick.setAttribute('aria-current', 'true');
  if (q.parts) partsOf(item, q, v, acts);
}

/** The parts of the merged `q` in `item`: each with its own mark, a button to work on it, and one to take it out. */
function partsOf(item: HTMLElement, q: Query, v: ListView, acts: QueryActs): void {
  const parts = item.createDiv({
    cls: 'thoughtknot-query-parts',
    attr: { role: 'list', 'aria-label': word('filter.query.parts') },
  });
  for (const p of q.parts ?? []) {
    const row = parts.createDiv({ cls: 'thoughtknot-query-part', attr: { role: 'listitem', 'data-part': p.id } });
    legendBadge(row, p.mark);
    row.createSpan({ cls: 'thoughtknot-query-part-said', text: querySaid(p) });
    const said = { said: querySaid(p) };
    const pick = button(row, word('filter.query.part-pick', said), 'pencil', () => acts.pick({ id: q.id, part: p.id }));
    if (v.current?.id === q.id && v.current.part === p.id) pick.setAttribute('aria-current', 'true');
    const out = button(row, word('filter.query.part-out', said), 'x', () => acts.partOut(q, p.id));
    out.disabled = q.locked;
  }
}
