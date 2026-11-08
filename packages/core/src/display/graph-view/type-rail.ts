// The side rail: one thin card down the start edge of the drawing (type_rail). Roger chose it on 8 Nov 2026, over a
// chip with a grid and a dock along the foot. It works as Obsidian's own ribbon does.
// - At its top: 2D, 2.5D, 3D and the globe, four buttons side by side in sight. The one shown now is pressed. Before,
//   one button went through all four in turn, so the way wanted was hidden until reached.
// - Below: one button for each group of diagram types: Links, Areas and Data. Each shows the picture of its type drawn
//   now, else its group's. A press opens the group's list beside the rail. Each type has its picture and name there.
// - A type that cannot draw this graph is greyed, with why beside it and on hover. The one suggested says so. The type
//   drawn now is pressed. Escape, a press outside or a pick closes the list, the focus back on its button.
// Every type and every way stays in the same place in its list, so nothing moves under the pointer. Each has a small
// picture in its own shape, lines in the text colour as Obsidian's own icons are, so they suit light and dark.
import { word } from '@thoughtknot/core';
import type { SpaceMode } from './space-view-options.ts';

/** One shape of a picture: a path, a circle or a box, and how it is drawn. */
type Shape = ['path', string] | ['dot', number, number, number?] | ['ring', number, number, number] | ['box', string];

const dot = (x: number, y: number, r = 2.2): Shape => ['dot', x, y, r];

/** Each picture, by the type's name or the way's, as shapes on a 24 by 24 grid. */
const GLYPHS: Readonly<Record<string, readonly Shape[]>> = {
  network: [['path', 'M6 7l11 3M6 7l4 11M17 10l-7 8M17 10l2 9'], dot(6, 7), dot(17, 10), dot(10, 18), dot(19, 19, 1.6)],
  force: [
    ['path', 'M12 12L4 6M12 12l8-7M12 12l-7 7M12 12l7 6'],
    dot(12, 12, 2.6),
    dot(4, 6),
    dot(20, 5),
    dot(5, 19),
    dot(19, 18),
  ],
  radial: [
    ['ring', 12, 12, 8],
    ['path', 'M12 12V4M12 12l7 3M12 12l-7 3'],
    dot(12, 12, 2.4),
    dot(12, 4),
    dot(19, 15),
    dot(5, 15),
  ],
  tree: [
    ['path', 'M12 4L6 12M12 4l6 8M6 12l-2.5 8M6 12l2.5 8M18 12v8'],
    dot(12, 4),
    dot(6, 12),
    dot(18, 12),
    dot(3.5, 20, 1.8),
    dot(8.5, 20, 1.8),
    dot(18, 20, 1.8),
  ],
  flow: [
    ['box', 'M2.5 9h5v6h-5zM16.5 4h5v6h-5zM16.5 14h5v6h-5z'],
    ['path', 'M7.5 12c4 0 4-5 9-5M7.5 12c4 0 4 5 9 5'],
  ],
  lanes: [['path', 'M2 8h20M2 16h20M6 4.5l7 7.5 6 8'], dot(6, 4.5), dot(13, 12), dot(19, 20)],
  hive: [
    ['path', 'M12 12V3M12 12l8 5M12 12l-8 5M12 6c4 1 5 5 5 9M7 15c2-4 3-8 5-9'],
    dot(12, 6, 1.7),
    dot(17, 15, 1.7),
    dot(7, 15, 1.7),
  ],
  arc: [
    ['path', 'M2 18h20M4 18a5 5 0 0110 0M9 18a5.5 5.5 0 0111 0M4 18a8 8 0 0116 0'],
    dot(4, 18, 1.7),
    dot(9, 18, 1.7),
    dot(14, 18, 1.7),
    dot(20, 18, 1.7),
  ],
  chord: [
    ['ring', 12, 12, 8.5],
    ['path', 'M5 7c5 3 8 3 14 0M5 17c4-6 9-9 14 0M12 3.5c-2 5-2 12 0 17'],
  ],
  centroid: [
    ['box', 'M3 3h18v18H3z'],
    ['ring', 12, 12, 4.5],
    dot(12, 7.5, 1.5),
    dot(16.5, 12, 1.5),
    dot(12, 16.5, 1.5),
    dot(7.5, 12, 1.5),
  ],
  pole: [
    ['path', 'M2 15h20M12 4v11'],
    dot(12, 4),
    dot(5, 15, 1.8),
    dot(9, 15, 1.8),
    dot(15, 15, 1.8),
    dot(19, 15, 1.8),
  ],
  ego: [
    ['ring', 12, 12, 8],
    dot(12, 12, 3),
    dot(12, 4, 1.8),
    dot(19, 9.5, 1.8),
    dot(17, 18.5, 1.8),
    dot(7, 18.5, 1.8),
    dot(5, 9.5, 1.8),
  ],
  treemap: [
    ['box', 'M3 3h18v18H3z'],
    ['path', 'M12 3v18M12 11h9M3 14h9M16.5 11v10'],
  ],
  containment: [['ring', 12, 12, 9], ['ring', 9, 10, 4], ['ring', 15.5, 15, 3], dot(9, 10, 1.3)],
  block: [['box', 'M3 14h18v6H3zM5 8h8v6H5zM13 4h6v10h-6z']],
  plan: [['path', 'M3 4h18v16H3zM3 11h7v9M10 4v4M14 11h7M14 11v4']],
  grid: [['box', 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z']],
  density: [['ring', 9, 10, 6], ['ring', 16, 16, 5], dot(9, 10, 3), dot(16, 16, 2)],
  matrix: [
    ['box', 'M3 3h18v18H3z'],
    ['path', 'M9 3v18M15 3v18M3 9h18M3 15h18'],
    dot(12, 6, 1.6),
    dot(18, 18, 1.6),
    dot(6, 12, 1.6),
  ],
  timeline: [['path', 'M2 12h20M5 9v6M12 9v6M19 9v6M8.5 6v6M15.5 12v6'], dot(8.5, 6, 1.7), dot(15.5, 18, 1.7)],
  map: [['path', 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14']],
  table: [
    ['box', 'M3 4h18v16H3z'],
    ['path', 'M3 9h18M3 14.5h18M9.5 4v16'],
  ],
  links: [['path', 'M6 7l11 3M6 7l4 11M17 10l-7 8'], dot(6, 7), dot(17, 10), dot(10, 18)],
  areas: [
    ['box', 'M3 3h18v18H3z'],
    ['path', 'M12 3v18M12 11h9'],
  ],
  data: [
    ['box', 'M3 4h18v16H3z'],
    ['path', 'M3 9h18M9.5 4v16'],
  ],
  flat: [['box', 'M4 5h16v14H4z']],
  cards: [['path', 'M7 6h14l-4 12H3z']],
  balls: [['path', 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5']],
  globe: [
    ['ring', 12, 12, 9],
    ['path', 'M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18'],
  ],
};

/** The names that have a picture, so a test can check every type has one. */
export const GLYPH_NAMES: readonly string[] = Object.keys(GLYPHS);

/** The picture `name` as SVG text: lines and dots in black, the colour the mask lets through. */
export function glyphSvg(name: string): string {
  const parts = (GLYPHS[name] ?? GLYPHS['network'] ?? []).map((shape) => {
    if (shape[0] === 'dot') return `<circle cx="${shape[1]}" cy="${shape[2]}" r="${shape[3] ?? 2.2}" fill="#000"/>`;
    if (shape[0] === 'ring') return `<circle cx="${shape[1]}" cy="${shape[2]}" r="${shape[3]}"/>`;
    return `<path d="${shape[1]}"/>`;
  });
  const look = 'fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${look}>${parts.join('')}</svg>`;
}

/**
 * Puts the picture `name` into `parent`, hidden from screen readers: the button it sits in says it in words. It is a
 * mask over the text colour, so it follows the theme. No SVG is added to the card, whose drawing is its own SVG.
 */
export function glyph(parent: HTMLElement, name: string): HTMLElement {
  const span = parent.createSpan({ cls: 'thoughtknot-glyph', attr: { 'aria-hidden': 'true' } });
  span.setCssProps({ '--thoughtknot-glyph': `url("data:image/svg+xml,${encodeURIComponent(glyphSvg(name))}")` });
  return span;
}

/** The groups of diagram types, each in the order its list shows them (Roger, 8 Nov 2026: 22 types, in groups). */
export const RAIL_GROUPS = [
  {
    group: 'links',
    types: ['network', 'force', 'radial', 'tree', 'flow', 'lanes', 'hive', 'arc', 'chord', 'centroid', 'pole', 'ego'],
  },
  { group: 'areas', types: ['treemap', 'containment', 'block', 'plan', 'grid', 'density'] },
  { group: 'data', types: ['matrix', 'timeline', 'map', 'table'] },
] as const;

/** The words of the four ways. */
type SpaceWord = 'bar.space-flat' | 'bar.space-cards' | 'bar.space-balls' | 'bar.space-globe';

/** One way to show the drawing: its picture's name, its mode in space (none: flat) and its word. */
export const SPACE_WAYS: readonly { name: string; mode: SpaceMode | null; word: SpaceWord }[] = [
  { name: 'flat', mode: null, word: 'bar.space-flat' },
  { name: 'cards', mode: 'cards', word: 'bar.space-cards' },
  { name: 'balls', mode: 'balls', word: 'bar.space-balls' },
  { name: 'globe', mode: 'globe', word: 'bar.space-globe' },
];

/** One diagram type in the rail: its short name, its name in words, and how it stands for this graph. */
export interface RailType {
  key: string;
  name: string;
  now: boolean;
  fits: boolean;
  /** Why it does not fit, or that it is drawn now or suggested; empty when nothing is to be said. */
  why: string;
  suggested: boolean;
  pick: () => void;
}

/** A button of the rail: its picture, named in words for screen readers and on hover. */
function railButton(parent: HTMLElement, label: string, picture: string, onClick: () => void): HTMLButtonElement {
  const b = parent.createEl('button', {
    cls: 'thoughtknot-rail-button',
    attr: { type: 'button', 'aria-label': label, title: label },
  });
  glyph(b, picture);
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Makes the rail in `root`: an empty card the type strip fills with its groups (railTypes). With `space`, its top holds
 * the four ways to show the drawing; a table has no depth, so it has none. Gives back the rail and the four ways.
 */
export function renderRail(
  root: HTMLElement,
  space: ((mode: SpaceMode | null) => void) | null,
): { rail: HTMLElement; ways: HTMLElement | null } {
  const rail = root.createDiv({
    cls: 'thoughtknot-rail',
    attr: { role: 'toolbar', 'aria-orientation': 'vertical', 'aria-label': word('type.choose') },
  });
  if (!space) return { rail, ways: null };
  const ways = rail.createDiv({
    cls: 'thoughtknot-rail-space',
    attr: { role: 'group', 'aria-label': word('bar.space') },
  });
  for (const w of SPACE_WAYS) {
    const b = railButton(ways, word(w.word), w.name, () => space(w.mode));
    b.setAttribute('data-space', w.name);
    b.setAttribute('aria-pressed', String(w.mode === null));
  }
  return { rail, ways };
}

/** Says on the four ways which one shows the drawing now, `mode` (none: flat). */
export function sayWay(ways: HTMLElement, mode: SpaceMode | null): void {
  for (const b of Array.from(ways.querySelectorAll<HTMLElement>('[data-space]')))
    b.setAttribute(
      'aria-pressed',
      String(SPACE_WAYS.find((w) => w.name === b.getAttribute('data-space'))?.mode === mode),
    );
}

/** What railTypes gives back: what writes, which a read-only card takes away, and each type's button by its key. */
export interface RailTypes {
  controls: HTMLElement[];
  buttons: Map<string, HTMLButtonElement>;
  /** Each group's button, by its group. */
  groups: Map<string, HTMLButtonElement>;
}

/**
 * Fills `rail` with a button for each group of `types` and the list it opens. A group with none of the types offered
 * is left out. Each list is made once and only shown or hidden, so a type's button stays the same one.
 */
export function railTypes(rail: HTMLElement, types: readonly RailType[]): RailTypes {
  const byKey = new Map(types.map((t) => [t.key, t]));
  const out: RailTypes = { controls: [], buttons: new Map(), groups: new Map() };
  const lists: { list: HTMLElement; toggle: HTMLButtonElement }[] = [];
  const shut = (except?: HTMLElement) => {
    for (const { list, toggle } of lists)
      if (list !== except) {
        list.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      }
  };
  for (const { group, types: keys } of RAIL_GROUPS) {
    const offered = keys.flatMap((k) => byKey.get(k) ?? []);
    if (!offered.length) continue;
    const now = offered.find((t) => t.now);
    const label = now
      ? word('rail.group-now', { group: word(`rail.${group}`), type: now.name })
      : word(`rail.${group}`);
    const list = rail.createEl('ul', {
      cls: 'thoughtknot-rail-list',
      attr: { 'aria-label': word(`rail.${group}`), 'data-group': group },
    });
    list.hidden = true;
    const toggle = railButton(rail, label, now?.key ?? group, () => {
      shut(list);
      list.hidden = !list.hidden;
      toggle.setAttribute('aria-expanded', String(!list.hidden));
      if (!list.hidden) besideOf(list, toggle, rail);
    });
    rail.insertBefore(toggle, list);
    toggle.setAttribute('data-group', group);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-haspopup', 'true');
    if (now) toggle.classList.add('is-now');
    lists.push({ list, toggle });
    out.groups.set(group, toggle);
    out.controls.push(toggle, list);
    for (const t of offered)
      out.buttons.set(
        t.key,
        typeRow(list, t, () => (shut(), toggle.focus())),
      );
  }
  // Escape closes the list open, the focus back on its button; a press outside it closes it too
  rail.addEventListener('keydown', (e: KeyboardEvent) => {
    const open = lists.find((l) => !l.list.hidden);
    if (e.key !== 'Escape' || !open) return;
    e.preventDefault();
    e.stopPropagation();
    shut();
    open.toggle.focus();
  });
  const outside = (e: Event) => {
    if (!rail.isConnected) return rail.ownerDocument.removeEventListener('pointerdown', outside); // the card went
    if (!rail.contains(e.target as Element | null)) shut();
  };
  rail.ownerDocument.addEventListener('pointerdown', outside);
  return out;
}

/**
 * Puts an open list level with its button: beside it down the rail, or below it across a phone's. It is kept on the
 * card, so a short drawing never cuts it off.
 */
function besideOf(list: HTMLElement, toggle: HTMLElement, rail: HTMLElement): void {
  const start = Math.max(0, Math.min(toggle.offsetLeft, rail.clientWidth - list.offsetWidth)),
    top = Math.max(0, Math.min(toggle.offsetTop, rail.clientHeight - list.offsetHeight));
  list.setCssProps({ '--thoughtknot-list-top': `${top}px`, '--thoughtknot-list-start': `${start}px` });
}

/** One type's row in a group's list: its picture, its name, and why when there is something to say. */
function typeRow(list: HTMLElement, t: RailType, done: () => void): HTMLButtonElement {
  const li = list.createEl('li', {
    cls: [
      ...(t.now ? ['thoughtknot-type-now'] : []),
      ...(t.suggested && !t.now ? ['thoughtknot-type-suggested'] : []),
      ...(t.fits ? [] : ['thoughtknot-type-unfit']),
    ],
  });
  li.setAttribute('data-type', t.key);
  glyph(li, t.key);
  const b = li.createEl('button', { text: t.name, attr: { type: 'button', 'aria-pressed': String(t.now) } });
  b.disabled = !t.fits;
  b.addEventListener('click', () => {
    done();
    t.pick();
  });
  li.createSpan({ cls: ['thoughtknot-type-why', 'thoughtknot-sr'], text: t.why }); // read out; its tooltip on hover
  if (t.why) li.setAttribute('title', t.why); // its reason whole on hover too, where the row cuts it short
  return b;
}
