// The View menu (editor spec §25, view_switches), under the bar's View button. It opens on the ladder of detail and
// the switch that hides labels too small to read. The switches the ladder turns, and the layout sliders, fold away
// under More. Each switch starts as the settings hold it (view_switch_defaults), and turning one redraws the graph.
// Nothing here reaches the note, so it works in reading view too (view_switch_view_only).
import {
  BY_KIND,
  LAYOUT_OPTION_RANGE,
  OPTIONS,
  SWITCH_SETTINGS,
  VIEW_SWITCHES,
  edgesOf,
  foldsHiding,
  groupChoices,
  groupValues,
  labelsHidden,
  optionSaid,
  switchName,
  word,
} from '@thoughtknot/core';

/** A switch's name in the person's language: its setting's, which the settings page says too. */
const nameOf = (s: ViewSwitch, o = OPTIONS.find((x) => x.key === SWITCH_SETTINGS[s])): string =>
  o ? optionSaid(o).name : switchName(s);
import type {
  Drawn,
  GraphDrawing,
  Kept,
  LayoutOptions,
  NoteReading,
  ViewState,
  ViewSwitch,
  WordKey,
} from '@thoughtknot/core';
import type { SwitchesShown } from './view-options';
import { DETAIL_LEVELS, type DetailLevel } from '../../view-switches.ts';
import { trunkCount } from '../../untangle-fold.ts';
import { PICK_ATTRIBUTE, pickSaid, pickShownOf } from '../../layouts/fingerprint.ts';

/** A card's View menu, hidden until the bar's button opens it. */
export interface ViewMenu {
  el: HTMLElement;
  /** Opens or closes it, as the bar's button `b` does, and says which on the button. */
  toggle: (b: HTMLElement) => void;
  /** Draws each switch as the state now stands. */
  refresh: () => void;
  /** Says how the last turn went, such as why the drawing could not be redrawn; empty, nothing. */
  say: (words: string) => void;
}

/** The line under each switch saying in plain words what it does (F9 of the UX review, 25 Oct 2026). */
const HINTS = {
  labels: 'view.hint.labels',
  hubs: 'view.hint.hubs',
  groups: 'view.hint.groups',
  merge: 'view.hint.merge',
  lanes: 'view.hint.lanes',
} as const satisfies Record<Exclude<ViewSwitch, 'engine'>, WordKey>;
/** How many hints have been drawn, so each has an id of its own its switch is described by. */
let hints = 0;

/** The View menu's choice of what to group by: as written or found, none, or one of `groupChoices` (untangle_group_by). */
const AUTO = '',
  NONE = ':none';

/** The View menu's layout sliders, and how far one step moves each, in every view (§53, layout_saved_with_view). */
const LAYOUT_SLIDERS = [
  ['spacing', 'view.layout.spacing', 0.25],
  ['linkLength', 'view.layout.link-length', 0.25],
  ['groupPull', 'view.layout.group-pull', 0.1],
] as const satisfies readonly (readonly [keyof LayoutOptions, string, number])[];

/** What the menu's Group by needs: the choices the drawing offers now, and what picking one does. */
export interface Grouping {
  choices: () => string[];
  pick: (choice: string) => void;
}

/**
 * Builds the menu at the end of what `root` holds so far: a switch for each of the four, which `turned` acts on. With
 * `grouping`, a Group by list follows them, filled with the drawing's choices each time the menu opens. With `spaced`,
 * a slider for each layout option follows, which `spaced` acts on as one is let go.
 */
export function renderViewMenu(
  root: HTMLElement,
  state: ViewState,
  turned: (s: ViewSwitch, on: boolean) => void,
  grouping?: Grouping,
  spaced?: (k: keyof LayoutOptions, v: number) => void,
  stepped?: (level: DetailLevel) => void,
): ViewMenu {
  const el = root.createDiv({ cls: 'thoughtknot-view-menu', attr: { role: 'group', 'aria-label': word('bar.view') } });
  el.hidden = true;
  // the ladder of detail first: one choice for what the three switches under it fold (cluster_detail_ladder)
  const ladderHint = `thoughtknot-switch-hint-${++hints}`;
  const ladder = stepped
    ? el.createDiv({
        cls: 'thoughtknot-detail',
        attr: { role: 'radiogroup', 'aria-label': word('view.detail'), 'aria-describedby': ladderHint },
      })
    : null;
  ladder?.createSpan({ cls: 'thoughtknot-detail-name', text: word('view.detail'), attr: { 'aria-hidden': 'true' } });
  const rungs = (ladder ? DETAIL_LEVELS : []).map((level) => {
    const b = (ladder as HTMLElement).createEl('button', {
      cls: 'thoughtknot-detail-rung',
      text: word(`view.detail.${level}`),
      attr: { type: 'button', role: 'radio' },
    });
    b.addEventListener('click', () => stepped?.(level));
    return { level, b };
  });
  ladder?.createSpan({ cls: 'thoughtknot-switch-hint', text: word('view.hint.detail'), attr: { id: ladderHint } });
  const pickLine = el.createDiv({ cls: 'thoughtknot-layout-said' }); // the engine's pick, said (layout_pick_said)
  const switches: { s: ViewSwitch; b: HTMLButtonElement; says: HTMLElement }[] = [];
  // with the ladder, the switches it turns and the layout sliders fold away under More (cluster_menu_plain)
  let more: HTMLElement | null = null;
  const holder = (s?: ViewSwitch): HTMLElement => {
    if (!ladder || s === 'labels') return el;
    const d = more ? null : el.createEl('details', { cls: 'thoughtknot-view-more' });
    d?.createEl('summary', { text: word('view.more') });
    return (more ??= (d as HTMLElement).createDiv({ cls: 'thoughtknot-view-more-body' }));
  };
  for (const s of VIEW_SWITCHES) {
    if (s === 'engine') continue; // which engine lays out is the settings page's alone (Roger, 25 Oct 2026)
    const hint = `thoughtknot-switch-hint-${++hints}`;
    const b = holder(s).createEl('button', {
      cls: 'thoughtknot-switch',
      attr: { type: 'button', role: 'switch', 'aria-describedby': hint },
    });
    // the name is the switch's name, and its hint under it says what it does. The toggle and its words show its state,
    // which aria-checked says to a screen reader
    const words = b.createSpan({ cls: 'thoughtknot-switch-words' });
    words.createSpan({ cls: 'thoughtknot-switch-name', text: nameOf(s) });
    words.createSpan({
      cls: 'thoughtknot-switch-hint',
      text: word(HINTS[s]),
      attr: { id: hint, 'aria-hidden': 'true' },
    });
    b.createSpan({ cls: 'thoughtknot-switch-track', attr: { 'aria-hidden': 'true' } });
    const says = b.createSpan({ cls: 'thoughtknot-switch-state', attr: { 'aria-hidden': 'true' } });
    b.addEventListener('click', () => turned(s, !state.switches[s]));
    switches.push({ s, b, says });
  }
  const label = grouping && el.createEl('label', { cls: 'thoughtknot-group-by', text: word('view.group-by') });
  const list = label?.createEl('select');
  list?.addEventListener('change', () => grouping?.pick(list.value));
  const sliders = (spaced ? LAYOUT_SLIDERS : []).map(([k, says, step]) => {
    const [least, most] = LAYOUT_OPTION_RANGE[k];
    const row = holder().createEl('label', { cls: 'thoughtknot-layout-option', text: word(says) });
    const input = row.createEl('input', {
      attr: { type: 'range', min: String(least), max: String(most), step: String(step) },
    });
    input.addEventListener('change', () => spaced?.(k, Number(input.value)));
    return { k, input };
  });
  const status = el.createDiv({ cls: 'thoughtknot-quiet', attr: { role: 'status' } });
  const fill = () => {
    const shown = pickShownOf(root.querySelector(`svg[${PICK_ATTRIBUTE}]`)?.getAttribute(PICK_ATTRIBUTE));
    [pickLine.hidden, pickLine.textContent] = [!shown, shown ? pickSaid(shown) : ''];
    if (!list || !grouping) return;
    const said = (c: string) => (c === BY_KIND ? word('view.group-by.kind') : c);
    const choices: [string, string][] = [
      [AUTO, word('view.group-by.auto')],
      [NONE, word('view.group-by.none')],
      ...grouping.choices().map((c): [string, string] => [c, said(c)]),
    ];
    list.replaceChildren();
    for (const [value, text] of choices) list.createEl('option', { text, attr: { value } });
    list.value = state.groupBy === undefined ? AUTO : state.groupBy === null ? NONE : state.groupBy.by;
  };
  const refresh = () => {
    for (const { level, b } of rungs) b.setAttribute('aria-checked', String(state.detail === level));
    for (const { s, b, says } of switches) {
      b.setAttribute('aria-checked', String(state.switches[s]));
      says.setText(word(state.switches[s] ? 'view.on' : 'view.off'));
    }
    for (const { k, input } of sliders) input.value = String(state.layout[k]);
    fill();
  };
  refresh();
  return {
    el,
    toggle: (b) => {
      el.hidden = !el.hidden;
      if (!el.hidden) fill();
      b.setAttribute('aria-expanded', String(!el.hidden));
    },
    refresh,
    say: (words) => status.setText(words),
  };
}

/** What turning a switch needs of its card. */
export interface SwitchingHost {
  /** The graph as drawn, unfolded: what its folds are found in. */
  drawing: () => GraphDrawing | undefined;
  /** Puts the graph laid out again in place of the drawing, keeping the selection and the focus. */
  relaid: (drawn: Drawn) => void;
  /** Shows the drawing again as it stands, as labels by zoom changes it in place. */
  shown: () => void;
}

/** One card's View menu and what its switches, stubs and boxes do to the drawing. */
export class ViewSwitching {
  readonly menu: ViewMenu;
  private readonly o: SwitchesShown;
  private readonly host: SwitchingHost;
  private readonly owner: object;
  /** The switches and the plan the drawing shows now, to tell whether another card changed them. */
  private drawnAs = '';

  /** Builds the menu in `root`, for the card `owner`, whose layouts replace one another. */
  constructor(root: HTMLElement, o: SwitchesShown, host: SwitchingHost, owner: object) {
    this.o = o;
    this.host = host;
    this.owner = owner;
    const reading = o.reading;
    const grouping = reading && {
      choices: () => {
        const d = host.drawing();
        return d ? groupChoices(reading, d) : [];
      },
      pick: (choice: string) => this.groupBy(choice, reading),
    };
    this.menu = renderViewMenu(
      root,
      o.state,
      (s, on) => this.turn(s, on),
      grouping,
      (k, v) => this.space(k, v),
      (level) => this.step(level),
    );
    this.drawnAs = this.now();
  }

  private now(): string {
    return JSON.stringify([this.o.state.switches, this.o.state.plan, this.o.state.layout]);
  }

  /** Whether the drawing's link labels are hidden at `scale` (untangle_labels). */
  labelsHidden(scale: number): boolean {
    return labelsHidden(this.o.state.switches, scale);
  }

  /** Turns a switch: labels by zoom at once in place, any other by laying the graph out again. */
  turn(s: ViewSwitch, on: boolean): void {
    const again = this.o.state.turn(s, on);
    this.menu.refresh();
    if (again) void this.redraw();
    else {
      this.drawnAs = this.now();
      this.host.shown();
    }
  }

  /** Steps to the rung `level` of the ladder of detail, and lays the graph out again (cluster_detail_ladder). */
  step(level: DetailLevel): void {
    if (!this.o.state.toDetail(level)) return;
    this.menu.refresh();
    void this.redraw();
  }

  /** Spaces the layout as the menu's slider for `k` now says, and lays the graph out again (layout_saved_with_view). */
  space(k: keyof LayoutOptions, v: number): void {
    if (this.o.state.layout[k] === v) return;
    this.o.state.layout = { ...this.o.state.layout, [k]: v };
    void this.redraw();
  }

  /** Groups the things by `choice` of the menu's Group by, and lays the graph out again (untangle_group_by). */
  groupBy(choice: string, reading: NoteReading): void {
    const d = this.host.drawing();
    if (choice === AUTO || !d) this.o.state.groupBy = undefined;
    else this.o.state.groupBy = choice === NONE ? null : { by: choice, values: groupValues(reading, d, choice) };
    void this.redraw();
  }

  /**
   * Opens a busy hub's stub, a folded group's box or a bundle, by its `data-fold` (`hub:`, `group:` or `bundle:` and its
   * name). Opened from the keyboard, `focus` then takes the keyboard to the hub, or to the group's first thing, on the
   * drawing laid out again.
   */
  unfold(fold: string, focus?: (key: string) => void): void {
    const at = fold.indexOf(':'),
      name = fold.slice(at + 1),
      hub = fold.startsWith('hub:');
    if (fold.startsWith('bundle:')) {
      // a bundle opened: its links drawn apart again, the keyboard on the first thing of the group they run from
      const from = name.split('\n')[0];
      const first = this.o.state.plan?.groups.find(([label]) => label === from)?.[1][0];
      this.o.state.open({ bundle: name });
      void this.redraw(focus && (() => focus(first ?? '')));
      return;
    }
    // a group opened from its box folds back by the button on it (cluster_fold_back)
    const group = this.o.state.plan?.groups.find(([label]) => label === name);
    if (!hub && group && !group[2]) this.o.state.fold({ group: name });
    else this.o.state.open(hub ? { hub: name } : { group: name });
    void this.redraw(focus && (() => focus((hub ? name : group?.[1][0]) ?? '')));
  }

  /** A busy hub's links and whether they are folded now, for its details; null for another thing. */
  hub(key: string): { links: number; folded: boolean } | null {
    const d = this.host.drawing();
    return d ? this.o.state.hub(d, key) : null;
  }

  /** Folds a busy hub's links into their stub, or opens them, from its details. */
  toggleHub(key: string): void {
    if (this.hub(key)?.folded) this.o.state.open({ hub: key });
    else this.o.state.fold({ hub: key });
    void this.redraw();
  }

  /** Opens the folds a thing is hidden in, then runs `then` on the drawing laid out again; false when none hides it. */
  unfoldTo(key: string, then: () => void): boolean {
    const d = this.host.drawing();
    const hiding = d ? foldsHiding(this.o.state.plan, edgesOf(d), key) : { hubs: [] };
    if (!hiding.hubs.length && hiding.group === undefined) return false;
    for (const hub of hiding.hubs) this.o.state.open({ hub });
    if (hiding.group !== undefined) this.o.state.open({ group: hiding.group });
    void this.redraw(then);
    return true;
  }

  /**
   * Lays this card's graph out again with only what `only` keeps, so a thing and its neighbours sit together; or the
   * whole graph again (null). `then` runs on the drawing laid out again (untangle_regroup).
   */
  regroup(only: Kept | null, then?: () => void): void {
    this.o.state.keepOnly(this.owner, only);
    void this.redraw(then);
  }

  /** Brings the drawing up to date when another card, such as its full screen, turned the shared switches. */
  sync(): void {
    if (this.now() === this.drawnAs) return;
    this.menu.refresh();
    void this.redraw();
  }

  /**
   * Whether links are to be merged, but no two groups have two links or more between them, so nothing is (Roger, 25 Oct
   * 2026: "parallel links merged doesn't seem to work").
   */
  private nothingMerged(): boolean {
    const d = this.host.drawing();
    return this.o.state.switches.merge && !!d && trunkCount(edgesOf(d), this.o.state.plan?.groups ?? []) === 0;
  }

  /** Lays the graph out again as the switches now fold it, and has the card put it in place; or says why not. */
  private async redraw(then?: () => void): Promise<void> {
    this.menu.say(word('redraw.drawing'));
    let next: Awaited<ReturnType<SwitchesShown['relayout']>>;
    try {
      next = await this.o.relayout(this.owner);
    } catch {
      this.menu.say(word('redraw.failed'));
      return;
    }
    if (!next) return; // a newer layout for this card was asked for
    if ('reason' in next) {
      this.menu.say(word('redraw.too-big'));
      return;
    }
    this.drawnAs = this.now();
    this.menu.say(this.nothingMerged() ? word('view.merge-nothing') : '');
    this.host.relaid(next);
    then?.();
  }
}
