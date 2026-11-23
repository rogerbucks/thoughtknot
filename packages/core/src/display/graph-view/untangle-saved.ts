// The queries saved by name, listed in the Filter panel (editor spec ES§75). Each shows its name, its prompts, and why it
// no longer fits or is broken (ai_query_stale, ai_query_saved). Open runs its rule on the graph as it is now, with
// nothing sent. Ask again sends its prompts again after the person says yes (ai_query_replay). Where the note is edited,
// it can be renamed in place, or removed after a yes. A button clears the answers kept on this device (ai_query_cache).
// The phone sheet and the board are given the same `SavedQueries` (AQ6).
import { word } from '@thoughtknot/core';
import type { Graph } from '@thoughtknot/graph-spec';
import type { RuleChoices, RuleDraft } from '@thoughtknot/core';
import { filterSaid } from '../../filter-ask.ts';
import { querySaid } from '../../filter.ts';
import type { Query } from '../../filter.ts';
import { savedQueryFrom } from '../../filter-manage.ts';
import type { SavedQueries, SavedQuery } from '../../filter-manage.ts';
import type { NamedFilterSave } from '../../filter-named.ts';
import { askedAgain, savedQueryOpened } from '../../filter-replay.ts';
import { queryStale } from '../../filter-stale.ts';
import { button } from '../button.ts';
import type { QueryPanel } from './filter-query-list.ts';

/** What the person does to a saved query: open it, or ask it again. The rest is the host's. */
export interface SavedActs {
  open: (s: SavedQuery) => void;
  again?: (s: SavedQuery) => void;
  tell: (said: string) => void;
}

/** What saving by name needs: the query worked on, the saves, the rows, and how to ask for the name. */
export interface SaveByName {
  held: Query | null;
  qs: SavedQueries | undefined;
  saving: ((f: NamedFilterSave) => void) | undefined;
  draft: RuleDraft;
  tell: (said: string) => void;
  prompt: (said: string, save: (name: string) => void) => void;
}

/**
 * Asks for the name to save by. A query worked on is saved whole, with its prompts, look and lock. Else the rows are
 * saved as a filter, unless a saved query holds that name: its filter line is its own.
 */
export function saveByName(d: SaveByName): void {
  const { held, saving } = d;
  const savingQuery = d.qs?.save;
  if (held && savingQuery) return d.prompt(querySaid(held), (name) => savingQuery(savedQueryFrom(name, held)));
  if (!saving) return;
  d.prompt(filterSaid(d.draft), (name) =>
    d.qs?.saved.some((q) => q.name === name.trim())
      ? d.tell(word('filter.saved-query.taken', { name }))
      : saving({ name, draft: d.draft }),
  );
}

/** What the saved queries need of the Filter panel: its queries, the graph as it is now, and how it tells the person. */
export interface SavedPanel {
  queries: QueryPanel;
  graph: Graph;
  choices: RuleChoices;
  tell: (said: string) => void;
  byAi: (on: boolean) => void;
  /** Whether an AI can be asked here, so Ask again is offered. */
  asks: boolean;
}

/** The saved queries of `qs` listed in `root`: opened in the panel with nothing sent, or asked again after a yes. */
export function savedQueriesIn(root: HTMLElement, qs: SavedQueries, p: SavedPanel): void {
  const open = (s: SavedQuery) => {
    const o = savedQueryOpened(s, p.queries.fresh(), p.choices);
    if ('broken' in o) return p.tell(o.broken);
    p.byAi(false);
    p.queries.adopt(o.query);
    p.tell(o.stale ?? word('filter.saved-query.opened', { name: s.name }));
  };
  const again = async (s: SavedQuery) => {
    const deps = { now: p.graph, choices: p.choices, confirm: qs.confirm, ask: p.queries.asker() };
    const out = await askedAgain(s, p.queries.fresh(), { ...deps, ...(qs.answers && { cache: qs.answers }) });
    if (!('query' in out)) return p.tell('failed' in out ? out.failed : out.declined);
    p.byAi(true);
    p.queries.adopt(out.query);
    p.tell(word('filter.ask.filled'));
  };
  savedQueryList(root, qs, p.choices, { open, tell: p.tell, ...(p.asks && { again: (s) => void again(s) }) });
}

/** Why `s` cannot be opened, or no longer fits a note of `choices`, in words; or null. */
export function savedWhy(s: SavedQuery, choices: RuleChoices): string | null {
  return s.broken ?? queryStale(s, choices);
}

/** The saved queries of `qs` in `root`, each a line of the list; none, nothing. */
export function savedQueryList(root: HTMLElement, qs: SavedQueries, choices: RuleChoices, acts: SavedActs): void {
  root.empty();
  if (!qs.saved.length && !qs.answers) return;
  const list = root.createDiv({
    cls: 'thoughtknot-saved-queries',
    attr: { role: 'list', 'aria-label': word('filter.saved-query.list') },
  });
  for (const s of qs.saved) savedItem(list, s, qs, choices, acts);
  const answers = qs.answers;
  if (answers)
    button(root, word('filter.cache.clear'), 'eraser', () => {
      answers.clear();
      acts.tell(word('filter.cache.cleared'));
    });
}

/** The saved query `s` in `list`: its name, to rename in place, its prompts, why it no longer fits, and its acts. */
function savedItem(list: HTMLElement, s: SavedQuery, qs: SavedQueries, choices: RuleChoices, acts: SavedActs): void {
  const item = list.createDiv({ cls: 'thoughtknot-saved-query', attr: { role: 'listitem', 'data-saved': s.name } });
  const name = item.createEl('input', {
    attr: { name: 'saved-query-name', type: 'text', 'aria-label': word('filter.saved-query.rename') },
  });
  name.value = s.name;
  const rename = qs.rename;
  name.disabled = !rename;
  const renamed = () => {
    const to = name.value.trim();
    if (rename && to && to !== s.name) rename(s.name, to);
  };
  name.addEventListener('change', renamed);
  name.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    renamed();
  });
  item.createDiv({ cls: 'thoughtknot-saved-query-words', text: s.words.join(' → ') });
  const why = savedWhy(s, choices);
  if (why) item.createDiv({ cls: 'thoughtknot-saved-query-why', text: why, attr: { role: 'note' } });
  const row = item.createDiv({ cls: 'thoughtknot-query-acts' });
  const open = button(row, word('filter.saved-query.open'), 'eye', () => acts.open(s));
  open.disabled = !!s.broken;
  const again = acts.again;
  if (again) {
    const b = button(row, word('filter.saved-query.again'), 'refresh-cw', () => again(s));
    b.disabled = !!s.broken || s.locked;
  }
  const remove = qs.remove;
  if (remove) button(row, word('filter.saved-query.remove'), 'trash-2', () => remove(s.name));
}
