// The explore sidebar (editor spec §71, explore_controls_on_screen). Roger, 31 Oct 2026: the controls to adjust the
// view sit on screen as dials, in a sidebar, with no menu to open. It also has a quick search, to find any thing and
// start the tree from it.
//
// It shows only while the card explores. At its top is the search: choosing a thing makes it the centre. Under it are
// the six shapes, the depth and per-branch dials, and Back, Next and the whole graph again. Where the note is edited,
// Save writes it into the style graph. On a wide card it is a
// column at the start of the drawing; on a narrow one, a strip across it (styles.css).
//
// Each dial is one control: its minus and plus buttons, and a value the arrow keys, Home, End and the wheel change. It
// says its value to a screen reader (explore_controls_accessible). Every target is 44 px.
import { word } from '@thoughtknot/core';
import type { Found } from '@thoughtknot/core';
import { BRANCH_RANGE, DEPTH_MOST } from '../../explore-map.ts';
import type { ExploreSession } from '../../explore-session.ts';
import { EXPLORE_SHAPES } from '../../layouts/explore-shapes.ts';
import type { ExploreActs } from './explore-controls';
import { renderFind } from './untangle-find';

/** What the sidebar asks of its card, as well as the controls' own asks. */
export interface SidebarActs extends ExploreActs {
  /** The things that match what was typed in its search. */
  search: (query: string) => Found[];
  /** Makes the thing found the centre of the exploration. */
  centre: (key: string) => void;
  /** Whether it offers to save the exploration: only where the note is edited (explore_saved). */
  saving: boolean;
}

/** The sidebar of one card, and how to bring it up to date with its exploration (none hides it). */
export interface ExploreSidebar {
  el: HTMLElement;
  show: (s: ExploreSession | null) => void;
}

/** How many things a press of the per-branch dial adds or takes away. */
const BRANCH_STEP = 2;

/** Builds the sidebar in `root`, hidden until the card explores. */
export function renderSidebar(root: HTMLElement, acts: SidebarActs): ExploreSidebar {
  const el = root.createDiv({
    cls: 'thoughtknot-explore-sidebar',
    attr: { role: 'region', 'aria-label': word('explore.sidebar') },
  });
  el.hidden = true;
  let s: ExploreSession | null = null;
  const run = (change: (s: ExploreSession) => boolean) => () => {
    if (s && change(s)) acts.changed();
  };
  const find = renderFind(el, {
    search: acts.search,
    choose: (f) => acts.centre(f.key),
    close: () => undefined,
  });
  // its own search, always open, styled as the bar's but not taken for it
  find.el.hidden = false;
  find.el.removeClass('thoughtknot-find');
  find.el.addClass('thoughtknot-explore-find');
  const shapes = el.createDiv({
    cls: 'thoughtknot-explore-shapes',
    attr: { role: 'group', 'aria-label': word('explore.shapes') },
  });
  const shapeButtons = EXPLORE_SHAPES.map((shape) => {
    const b = shapes.createEl('button', { text: word(`explore.shape.${shape}`), attr: { type: 'button' } });
    b.addEventListener(
      'click',
      run((s) => s.setShape(shape)),
    );
    return [shape, b] as const;
  });
  const depth = dial(el, word('explore.depth'), [1, DEPTH_MOST], 1, (to) => run((s) => s.toDepth(to))());
  const branch = dial(el, word('explore.per-branch'), BRANCH_RANGE, BRANCH_STEP, (to) =>
    run((s) => s.setPerBranch(to))(),
  );
  const moves = el.createDiv({ cls: 'thoughtknot-explore-moves' });
  const back = moves.createEl('button', { text: word('explore.back'), attr: { type: 'button' } });
  back.addEventListener(
    'click',
    run((s) => s.back()),
  );
  const next = moves.createEl('button', { text: word('explore.next'), attr: { type: 'button' } });
  next.addEventListener(
    'click',
    run((s) => s.next()),
  );
  moves
    .createEl('button', { text: word('explore.stop'), attr: { type: 'button' } })
    .addEventListener('click', () => acts.stop());
  // saved as one line in the style graph, so the note opens on it again (explore_saved)
  if (acts.saving && acts.save) {
    const save = acts.save;
    moves
      .createEl('button', {
        text: word('explore.save'),
        attr: { type: 'button', 'aria-label': word('explore.save.label') },
      })
      .addEventListener('click', () => save());
  }
  return {
    el,
    show: (now) => {
      s = now;
      el.hidden = !now;
      if (!now) return;
      for (const [shape, b] of shapeButtons) b.setAttribute('aria-pressed', String(shape === now.shape));
      depth(now.depth);
      branch(now.perBranch);
      back.disabled = !now.canBack;
      next.disabled = !now.canNext;
    },
  };
}

/**
 * A dial named `name` from `range[0]` to `range[1]`, moved by `step`: its minus and plus buttons and its value between.
 * It asks `to` for each new value, and gives back how to show the value it has now.
 */
function dial(
  root: HTMLElement,
  name: string,
  [least, most]: readonly [number, number],
  step: number,
  to: (value: number) => void,
): (value: number) => void {
  const row = root.createDiv({ cls: 'thoughtknot-explore-dial' });
  row.createSpan({ cls: 'thoughtknot-explore-dial-name', text: name });
  let now = least;
  const go = (value: number) => {
    const clamped = Math.max(least, Math.min(most, value));
    if (clamped !== now) to(clamped);
  };
  const fewer = row.createEl('button', {
    text: '−',
    attr: { type: 'button', 'aria-label': word('explore.less', { name }) },
  });
  const value = row.createSpan({
    cls: 'thoughtknot-explore-dial-value',
    attr: {
      role: 'spinbutton',
      tabindex: '0',
      'aria-label': name,
      'aria-valuemin': String(least),
      'aria-valuemax': String(most),
    },
  });
  const more = row.createEl('button', {
    text: '+',
    attr: { type: 'button', 'aria-label': word('explore.more', { name }) },
  });
  fewer.addEventListener('click', () => go(now - step));
  more.addEventListener('click', () => go(now + step));
  value.addEventListener('keydown', (e: KeyboardEvent) => {
    const by: Record<string, number> = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step };
    const target = e.key in by ? now + (by[e.key] ?? 0) : e.key === 'Home' ? least : e.key === 'End' ? most : null;
    if (target === null) return;
    e.preventDefault();
    go(target);
  });
  // the wheel turns the dial: up for more, down for fewer, a step a notch
  row.addEventListener('wheel', (e: WheelEvent) => {
    if (!e.deltaY) return;
    e.preventDefault();
    go(now + (e.deltaY < 0 ? step : -step));
  });
  return (v) => {
    now = v;
    value.setText(String(v));
    value.setAttribute('aria-valuenow', String(v));
    fewer.disabled = v <= least;
    more.disabled = v >= most;
  };
}
