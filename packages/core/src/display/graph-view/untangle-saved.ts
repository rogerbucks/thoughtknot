// The queries saved by name, listed in the Filter panel (editor spec ES§75). Each shows its name, its prompts, and why it
// no longer fits or is broken (ai_query_stale, ai_query_saved). Open runs its rule on the graph as it is now, with
// nothing sent. Ask again sends its prompts again after the person says yes (ai_query_replay). Where the note is edited,
// it can be renamed in place, or removed after a yes. A button clears the answers kept on this device (ai_query_cache).
// The phone sheet and the board are given the same `SavedQueries` (AQ6).
import { word } from '@thoughtknot/core';
import type { RuleChoices } from '@thoughtknot/core';
import type { SavedQueries, SavedQuery } from '../../filter-manage.ts';
import { queryStale } from '../../filter-stale.ts';
import { button } from '../button.ts';

/** What the person does to a saved query: open it, or ask it again. The rest is the host's. */
export interface SavedActs {
  open: (s: SavedQuery) => void;
  again?: (s: SavedQuery) => void;
  tell: (said: string) => void;
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
