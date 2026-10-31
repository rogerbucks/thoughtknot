// The graph's summary (editor spec §24, details_always_visible). The details panel shows it when it is kept open while
// nothing is chosen. It says how many things and links the graph has, of which kinds, and how many problems, as text.
import type { NoteReading } from '@thoughtknot/core';
import { sortedForReader, word } from '@thoughtknot/core';
import { recentVisits } from '../host';
import { button } from '../button';

/** The summary of graph `graph`, drawn into `body`. */
export function renderSummary(body: HTMLElement, reading: NoteReading, graph: string): void {
  const drawing = reading.graphs.get(graph),
    boxes = drawing?.boxes ?? [],
    problems = reading.problems.filter((p) => p.graph === graph).length;
  body.createEl('p', {
    cls: 'thoughtknot-summary-counts',
    text: word('summary.counts', {
      things: word('summary.things', { count: boxes.length }),
      links: word('summary.links', { count: drawing?.links.length ?? 0 }),
    }),
  });
  body.createEl('p', {
    cls: 'thoughtknot-summary-problems',
    text: problems ? word('bar.problems', { count: problems }) : word('bar.no-problems'),
  });
  // the kinds, most first
  const kinds = new Map<string, number>();
  for (const b of boxes) kinds.set(b.kind, (kinds.get(b.kind) ?? 0) + 1);
  if (kinds.size) {
    body.createEl('h4', { text: word('summary.kinds') });
    const ul = body.createEl('ul', { cls: 'thoughtknot-summary-kinds' });
    // the most common first; kinds as common as each other in the reader's order (a stable sort keeps it)
    for (const kind of sortedForReader([...kinds.keys()]).sort((a, b) => kinds.get(b)! - kinds.get(a)!))
      ul.createEl('li', { text: `${kind}: ${kinds.get(kind)}` });
  }
  renderRecent(body, reading);
}

/** The graphs and things last opened, newest first, each a button that goes back to it (risk NEURO-11). */
function renderRecent(body: HTMLElement, reading: NoteReading): void {
  const recent = recentVisits();
  const visits = recent?.list() ?? [];
  if (!recent || visits.length === 0) return;
  body.createEl('h4', { text: word('summary.recent') });
  const ul = body.createEl('ul', { cls: 'thoughtknot-summary-recent' });
  for (const v of visits) {
    const note = v.path.replace(/^.*\//, '').replace(/\.md$/, '');
    const thing =
      v.thing === undefined
        ? undefined
        : (reading.graphs.get(v.graph)?.boxes.find((b) => b.key === v.thing)?.text ?? v.thing);
    const text =
      thing === undefined
        ? word('summary.recent-graph', { graph: v.graph, note })
        : word('summary.recent-thing', { thing, graph: v.graph, note });
    button(ul.createEl('li'), text, 'file-text', () => recent.open(v), text);
  }
}
