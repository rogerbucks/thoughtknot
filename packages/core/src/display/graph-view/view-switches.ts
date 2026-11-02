// The View menu (editor spec §25, view_switches), under the bar's View button. It is a panel over the drawing, docked
// at the end until moved, with every choice in sight (controls_view_panel, Roger 2 Nov 2026). The ladder of detail and
// the switch that hides small labels are on screen in the card's dock too (controls_keys). Each starts as the
// settings hold it (view_switch_defaults). Nothing here reaches the note (view_switch_view_only).
import {
  BY_KIND,
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
import type { Drawn, GraphDrawing, Kept, LayoutOptions, NoteReading, ViewState, ViewSwitch } from '@thoughtknot/core';
import type { SwitchesShown } from './view-options';
import { viewDock } from './controls-view';
import { dockHead, wideWindow } from './controls-dock';
import { DETAIL_LEVELS, type DetailLevel } from '../../view-switches.ts';
import type { SemanticRung } from '../../semantic-zoom.ts';
import { GROUP_BY_ROW, HINTS, OWN_HINT_CLASS, ladderAttributes } from '../../view-menu-rows.ts';
import { OWN_ONLY, layoutControls } from './view-layout-controls.ts';
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

/** Whether the View panel was last opened (true) or shut (false) from the bar in this session; unset until then. */
let leftOpen: boolean | undefined;

/** How many hints have been drawn, so each has an id of its own its switch is described by. */
let hints = 0;

/** The View menu's choice of what to group by: as written or found, none, or one of `groupChoices` (untangle_group_by). */
const AUTO = '',
  NONE = ':none';

/** A row of the menu in `at`: a label with its words, and the option it sets (view_options_everywhere). */
const rowIn = (at: HTMLElement, cls: string, text: string, attr: Record<string, string>) =>
  at.createEl('label', { cls, text, attr });

/** What the menu's Group by needs: the choices the drawing offers now, and what picking one does. */
export interface Grouping {
  choices: () => string[];
  pick: (choice: string) => void;
}

/**
 * The ladder of detail at the top of the View menu `el`: one choice for what the three switches under it fold. A rung
 * picked is passed to `stepped` (cluster_detail_ladder). Returns each rung's button, by its level.
 */
function detailLadder(el: HTMLElement, stepped: (level: DetailLevel) => void) {
  const ladderHint = `thoughtknot-switch-hint-${++hints}`;
  const ladder = el.createDiv({ cls: 'thoughtknot-detail', attr: ladderAttributes(ladderHint) });
  ladder.createSpan({ cls: 'thoughtknot-detail-name', text: word('view.detail'), attr: { 'aria-hidden': 'true' } });
  const rungs = DETAIL_LEVELS.map((level) => {
    const b = ladder.createEl('button', {
      cls: 'thoughtknot-detail-rung',
      text: word(`view.detail.${level}`),
      attr: { type: 'button', role: 'radio' },
    });
    b.addEventListener('click', () => stepped(level));
    return { level, b };
  });
  ladder.createSpan({ cls: 'thoughtknot-switch-hint', text: word('view.hint.detail'), attr: { id: ladderHint } });
  return rungs;
}

/**
 * Builds the menu at the end of what `root` holds so far: a switch for each of the four, which `turned` acts on. With
 * `grouping`, a Group by list follows them, filled with the drawing's choices each time the menu opens. With `spaced`,
 * a slider for each layout number and a list for each choice follow, which `spaced` acts on as one is set.
 */
export function renderViewMenu(
  root: HTMLElement,
  state: ViewState,
  turned: (s: ViewSwitch, on: boolean) => void,
  grouping?: Grouping,
  spaced?: <K extends keyof LayoutOptions>(k: K, v: LayoutOptions[K]) => void,
  stepped?: (level: DetailLevel) => void,
): ViewMenu {
  // a panel over the drawing, docked at the end until moved: every choice in sight (controls_view_panel)
  const el = root.createDiv({
    cls: 'thoughtknot-view-menu',
    attr: { role: 'group', 'aria-label': word('bar.view'), 'data-place': 'end' },
  });
  el.hidden = true;
  const folds = dockHead(el, word('bar.view'));
  const rungs = stepped ? detailLadder(el, stepped) : [];
  const pickLine = el.createDiv({ cls: 'thoughtknot-layout-said' }); // the engine's pick, said (layout_pick_said)
  const switches: { s: ViewSwitch; b: HTMLButtonElement; says: HTMLElement }[] = [];
  for (const s of VIEW_SWITCHES) {
    if (s === 'engine') continue; // which engine lays out is the settings page's alone (Roger, 25 Oct 2026)
    const hint = `thoughtknot-switch-hint-${++hints}`;
    const b = el.createEl('button', {
      cls: 'thoughtknot-switch',
      attr: { type: 'button', role: 'switch', 'aria-describedby': hint, 'data-option': s },
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
  const label = grouping && rowIn(el, 'thoughtknot-group-by', word('view.group-by'), GROUP_BY_ROW);
  const list = label?.createEl('select');
  list?.addEventListener('change', () => grouping?.pick(list.value));
  const { sliders, lists } = layoutControls(() => el, spaced); // all in sight, none under More
  const status = el.createDiv({ cls: 'thoughtknot-quiet', attr: { role: 'status' } });
  const ownHint = el.createDiv({ cls: ['thoughtknot-switch-hint', OWN_HINT_CLASS], text: word('view.hint.own-only') });
  const fill = () => {
    const shown = pickShownOf(root.querySelector(`svg[${PICK_ATTRIBUTE}]`)?.getAttribute(PICK_ATTRIBUTE));
    [pickLine.hidden, pickLine.textContent] = [!shown, shown ? pickSaid(shown) : ''];
    // only a drawing our own engine laid out says its pick; with none, what only it reads is greyed (view_controls_apply)
    ownHint.hidden = !!shown;
    for (const { s, b } of switches) if (OWN_ONLY.has(s)) b.disabled = !shown;
    for (const { k, input } of [...sliders, ...lists]) if (OWN_ONLY.has(k)) input.disabled = !shown;
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
    for (const { k, input } of [...sliders, ...lists]) input.value = String(state.layout[k]);
    fill();
  };
  refresh();
  // a large screen opens it from the start, unless it was shut in this session (controls_view_panel_wide)
  if (leftOpen !== false && wideWindow())
    queueMicrotask(() => {
      const b = root.querySelector<HTMLElement>(`.thoughtknot-bar button[aria-label="${word('bar.view')}"]`);
      if (b && el.hidden) menu.toggle(b);
    });
  const menu: ViewMenu = {
    el,
    toggle: (b) => {
      el.hidden = !el.hidden;
      leftOpen = !el.hidden;
      if (!el.hidden) {
        folds.fold(false); // opened from the bar, it opens whole
        fill();
      }
      b.setAttribute('aria-expanded', String(!el.hidden));
    },
    refresh,
    say: (words) => status.setText(words),
  };
  return menu;
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
    viewDock(root, o.state, this.menu, { step: (r) => this.step(r), turn: (s, on) => this.turn(s, on) }); // §25
    this.drawnAs = this.now();
  }

  private now(): string {
    return JSON.stringify([this.o.state.switches, this.o.state.plan, this.o.state.layout]);
  }

  /** Whether laying the graph out again can change it: not for a view of the core's own, drawn as it is. */
  get relays(): boolean {
    return !this.o.asDrawn;
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

  /** Steps to the rung `level` of the ladder, or of semantic zoom, and lays the graph out again (cluster_detail_ladder). */
  step(level: SemanticRung): void {
    if (!this.o.state.toRung(level)) return;
    this.menu.refresh();
    void this.redraw();
  }

  /** Lays the graph out again as the menu's slider or list for `k` now says (layout_saved_with_view). */
  space<K extends keyof LayoutOptions>(k: K, v: LayoutOptions[K]): void {
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

  /** Lays the graph out with only what `only` keeps, or all of it (null); then runs `then` (untangle_regroup). */
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
