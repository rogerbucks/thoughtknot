// A drawing's bar (spec §3). In sight are Find a thing, View (§25), Diagram type (§15), 2D (§53), Fit and Full screen.
// Then come More and last the problems badge (bar_kept_short). More opens the rest: zoom out and zoom in,
// Filter by kind or link and Export. Where the note is edited, it holds Edit here and Edit in pane; in reading view,
// Source. The badge is calm unless there is an error. Each control says what it is in words as well as by its icon.
import { button } from '../button';
import { setIcon } from '../host';
import { parkedCount, word } from '@thoughtknot/core';
import type { ViewOptions } from './view-options';

/** A number of things, in words: "1 problem", "2 problems". */
export const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

/** How the badge says what is parked for later (§8): ", 2 parked, 1 overdue", or nothing when nothing is. */
const parkedWords = (count: { parked: number; overdue: number } | undefined): string[] =>
  count?.parked
    ? [
        word('bar.parked', { count: count.parked }),
        ...(count.overdue ? [word('bar.overdue', { count: count.overdue })] : []),
      ]
    : [];

/** What the bar's buttons do. */
export interface BarActions {
  /** The badge: shows or hides the problems behind it, and says which. */
  toggleProblems: (badge: HTMLButtonElement) => void;
  fit: () => void;
  zoomOut: () => void;
  zoomIn: () => void;
  /** Find a thing: opens or closes the search row, and says which (§25). */
  find: (b: HTMLButtonElement) => void;
  /** Filter by kind or link: opens or closes the legend that untangles, and says which (§25). */
  legend: (b: HTMLButtonElement) => void;
  /** View: opens or closes the View menu's switches, and says which (§25). */
  view: (b: HTMLButtonElement) => void;
  fullScreen: () => void;
  /** 2D, 2.5D or 3D: shows the drawing the next way, flat or in space (§53, space-switch.ts). */
  space: () => void;
  editHere: () => void;
  toggleSource: (b: HTMLButtonElement) => void;
  /** Export: shows or hides the Export form. */
  export: () => void;
}

/** The bar's buttons that depend on where the card is: the edit buttons, and Source. */
export interface BarPlaced {
  /** Edit here, which shows whether the card is being edited. */
  editButton: HTMLButtonElement | null;
  /** The buttons that edit, taken away in reading view. */
  editing: HTMLElement[];
  /** Source, taken away where the note is edited. */
  source: HTMLButtonElement | null;
  /** 2D, 2.5D or 3D, which says how the drawing is shown now; none for a table. */
  space: HTMLButtonElement | null;
  /** Where the type strip puts Diagram type in the bar: before 2D, 2.5D or 3D, or before Full screen (§15). */
  types: { bar: HTMLElement; before: HTMLElement };
}

/** The badge: problems and gaps counted, and what is parked (§8). Calm unless one is an error (bar_kept_short). */
function badgeOf(bar: HTMLElement, o: ViewOptions, on: BarActions): void {
  const { problems } = o;
  const gaps = o.completeness?.gaps ?? 0;
  // a hint only offers a fix, so it is listed behind the badge but never counted in it
  const counted = problems.filter((p) => p.severity !== 'hint').length;
  // things parked for later are counted apart from problems, and those past their revisit date as overdue (§8)
  const found = [
    ...(counted ? [word('bar.problems', { count: counted })] : []),
    ...(gaps ? [word('bar.gaps', { count: gaps })] : []),
  ];
  const label = [
    ...(found.length ? found : [word('bar.no-problems')]),
    ...parkedWords(o.parked && parkedCount(o.parked)),
  ].join(', ');
  const errors = problems.some((p) => p.severity === 'error');
  const icon = errors ? 'alert-triangle' : counted || gaps ? 'info' : 'check-circle';
  const badge = button(bar, label, icon, () => on.toggleProblems(badge), label);
  badge.addClass('thoughtknot-badge', errors ? 'is-error' : 'is-calm');
  badge.setAttribute('aria-expanded', 'false');
}

/** More in the bar, and the list it opens: hidden until pressed, closed by Escape or once a control in it is chosen. */
function moreMenu(bar: HTMLElement): HTMLElement {
  const wrap = bar.createDiv({ cls: 'thoughtknot-bar-more' });
  const list = wrap.createDiv({ cls: 'thoughtknot-bar-more-list', attr: { role: 'group' } });
  const toggle = button(wrap, word('bar.more'), 'more-horizontal', () => shut(list.hidden !== false));
  wrap.insertBefore(toggle, list);
  list.setAttribute('aria-label', word('bar.more'));
  const shut = (open = false) => {
    list.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  shut();
  list.addEventListener('click', (e: Event) => {
    if ((e.target as Element | null)?.closest?.('button')) shut();
  });
  wrap.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || list.hidden) return;
    e.preventDefault();
    shut();
    toggle.focus();
  });
  return list;
}

/** Builds the bar of a drawing at the top of its card. */
export function renderBar(root: HTMLElement, o: ViewOptions, on: BarActions): BarPlaced {
  const { mode } = o;
  const bar = root.createDiv({
    cls: 'thoughtknot-bar',
    attr: { role: 'toolbar', 'aria-label': word('bar.name', { graph: o.graph }) },
  });
  // finding a thing and filtering by kind only change the picture, never the note. So they are offered wherever it is
  // (§25). A graph drawn as a table (§15) has nothing to fade or hide, so there it is found but never filtered
  const find = button(bar, word('bar.find'), 'search', () => on.find(find));
  find.setAttribute('aria-expanded', 'false');
  // the View menu's switches change the drawing alone, so it is offered wherever the drawing is (§25)
  if (o.switches) {
    const view = button(bar, word('bar.view'), 'layers', () => on.view(view));
    view.setAttribute('aria-expanded', 'false');
  }
  // the view in space only looks, so it is offered wherever the drawing is; a table has no depth to show (§53)
  const space = o.diagram?.table
    ? null
    : button(bar, word('bar.space'), 'box', () => on.space(), word('bar.space-flat'));
  button(bar, word('bar.fit'), 'maximize', () => on.fit());
  const full =
    mode === 'full'
      ? button(bar, word('bar.close-full-screen'), 'minimize', () => o.onClose?.())
      : button(bar, word('bar.full-screen'), 'expand', () => on.fullScreen());
  // the rest, used less, wait behind More, which opens over the drawing and closes once one is chosen
  const more = moreMenu(bar);
  button(more, word('bar.zoom-out'), 'zoom-out', () => on.zoomOut(), word('bar.zoom-out'));
  button(more, word('bar.zoom-in'), 'zoom-in', () => on.zoomIn(), word('bar.zoom-in'));
  if (!o.diagram?.table) {
    const legend = button(more, word('bar.filter'), 'filter', () => on.legend(legend), word('bar.filter'));
    legend.setAttribute('aria-expanded', 'false');
  }
  // Export writes a new file, never the note, so it is offered wherever the drawing is (spec §16)
  if (o.exporting) button(more, word('bar.export'), 'download', () => on.export(), word('bar.export'));
  const editing: HTMLElement[] = [];
  let editButton: HTMLButtonElement | null = null;
  if (mode !== 'pane' && o.onEditHere) {
    editButton = button(more, word('bar.edit-here'), 'pencil', () => on.editHere(), word('bar.edit-here'));
    editing.push(editButton);
  }
  const pane = word('bar.edit-in-pane');
  if (mode !== 'pane') editing.push(button(more, pane, 'panel-right-open', () => o.onEdit(), pane));
  const source: HTMLButtonElement | null =
    mode === 'note'
      ? button(more, word('bar.show-source'), 'code', () => source && on.toggleSource(source), word('bar.show-source'))
      : null;
  badgeOf(bar, o, on);
  return { editButton, editing, source, space, types: { bar, before: space ?? full } };
}

/** The panels the bar opens, by their class: each lies over the drawing (panels_over_drawing). */
const OVER = [
  'thoughtknot-problems',
  'thoughtknot-view-menu',
  'thoughtknot-find',
  'thoughtknot-filter',
  'thoughtknot-type-list',
  'thoughtknot-view-list',
];

/**
 * Puts the panels the bar opens in one layer just above the card's drawing, `viewport`. Export opens there too
 * (export-form.ts). It stops watching the drawing's size as the `card` goes. The layer takes no room, so a panel opened moves nothing. It lies over the drawing, and
 * scrolls inside it when longer (Roger, 25 Oct 2026: "Suggest panels overlay the main view and do not move other
 * elements around"). Gives back the drawing.
 */
export function overDrawing(
  root: HTMLElement,
  viewport: HTMLElement,
  card: { register: (stop: () => void) => void },
): HTMLElement {
  const layer = root.createDiv({ cls: 'thoughtknot-over' });
  root.insertBefore(layer, viewport);
  const panels = layer.createDiv({ cls: 'thoughtknot-over-panels' });
  for (const el of Array.from(root.children))
    if (OVER.some((cls) => el.classList.contains(cls))) panels.appendChild(el);
  // as tall as the drawing at most, kept as it changes size
  const room = () =>
    viewport.clientHeight > 0 && layer.setCssProps({ '--thoughtknot-room': `${viewport.clientHeight}px` });
  room();
  if (typeof ResizeObserver !== 'undefined') {
    const watch = new ResizeObserver(room);
    watch.observe(viewport);
    card.register(() => watch.disconnect());
  }
  return viewport;
}

/** The edit button as the card stands: a pencil to edit here, or, while edited (`on`), a view icon to finish (§4). */
export function editButtonAs(b: HTMLElement, on: boolean): void {
  b.empty();
  setIcon(b, on ? 'book-open' : 'pencil');
  b.setAttribute('aria-label', word(on ? 'bar.done-editing' : 'bar.edit-here'));
  b.createSpan({ cls: 'thoughtknot-badge-text', text: b.getAttribute('aria-label') ?? '' }); // named in More
}
