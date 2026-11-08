// The Graph view of Obsidian Bases (Bases graph decisions B1-B5; 8 Nov 2026). A .base file picks notes with its
// filters; this view draws them as a graph, beside Bases' own Table, Cards and List. Each view keeps its own filter,
// so one draws a slice and another, with none, every note.
// - A note is a thing; a link between two notes picked is a link. A property can be chosen to give the links instead.
// - Notes outside the view, linked from it, are left out unless the view says to show them.
// - Where boxes go and the diagram type are kept in the .base file, under the view; no note is written (R16).
// - It is drawn by the same card as a graph block, so every diagram type and depth works (2D/3D parity).
// - It is drawn again whenever Bases hands over new notes, keeping the places saved (nodes stay put).
import { BasesView, Notice, TFile } from 'obsidian';
import type { BasesAllOptions, BasesPropertyId, MarkdownRenderChild, QueryController } from 'obsidian';
import { brokenLinks, depthOf, readNote, readStyle, styledDrawing, word } from '@thoughtknot/core';
import type { StyleChange } from '@thoughtknot/core';
import { diagramShown, tableDrawn } from '@thoughtknot/core/display/graph-view/type-strip';
import { noViewMenu } from '@thoughtknot/core/display/graph-view/view-drawn';
import { aidsOf } from '@thoughtknot/core/display/graph-view/viewer-aids';
import { refusalBanner } from '@thoughtknot/core/display/refusal-banner';
import { graphCard } from '../graph-card';
import { linkHost } from '../links/link-host';
import { vaultPresetOf } from '../settings/vault-preset';
import type ThoughtKnotPlugin from '../main';
import { BASE_GRAPH, baseGraphText } from './base-graph.ts';
import type { BaseNote } from './base-graph.ts';
import { STYLE_KEY, blocksWithStyle, styleAfter } from './base-style';

/** The id of the view type in Bases. */
export const BASE_VIEW = 'thoughtknot-graph';
/** The view's options, by the key each is kept under in the .base file. */
const EDGES = 'thoughtknotEdges';
const OUTSIDE = 'thoughtknotOutside';

/** The links of the note at `path`: its own resolved links, or those in property `by` when one is chosen. */
function linksOf(plugin: ThoughtKnotPlugin, path: string, by: BasesPropertyId | null): string[] {
  const cache = plugin.app.metadataCache;
  if (!by || !by.startsWith('note.')) return Object.keys(cache.resolvedLinks?.[path] ?? {});
  const name = by.slice('note.'.length);
  const file = plugin.app.vault.getAbstractFileByPath(path);
  const held = file instanceof TFile ? (cache.getFileCache(file)?.frontmatterLinks ?? []) : [];
  return held
    .filter((l) => l.key === name || l.key.startsWith(name + '.'))
    .flatMap((l) => cache.getFirstLinkpathDest(l.link, path)?.path ?? []);
}

/** The Graph view in one .base file's view. */
export class BaseGraphView extends BasesView {
  type = BASE_VIEW;
  private card: MarkdownRenderChild | null = null;
  private drawing = 0;

  constructor(
    controller: QueryController,
    private readonly el: HTMLElement,
    private readonly plugin: ThoughtKnotPlugin,
  ) {
    super(controller);
  }

  override onDataUpdated(): void {
    void this.draw();
  }

  override onunload(): void {
    this.drawing++;
    this.clear();
  }

  /** The notes Bases picked, each with its links. */
  notes(): BaseNote[] {
    const by = this.config.getAsPropertyId(EDGES);
    return this.data.data.map((e) => ({
      path: e.file.path,
      name: e.file.basename,
      links: linksOf(this.plugin, e.file.path, by),
    }));
  }

  /** The style kept in the .base file for this view, or none. */
  private kept(): string {
    const kept = this.config.get(STYLE_KEY);
    return typeof kept === 'string' ? kept : '';
  }

  private clear(): void {
    if (this.card) this.removeChild(this.card);
    this.card = null;
    this.el.empty();
  }

  /** Writes a change to the kept style, and draws again. */
  private write(graphText: string, change: StyleChange, done: string): void {
    const r = styleAfter(graphText, this.kept(), change);
    if ('refused' in r) {
      new Notice(word('blocks.style-failed', { why: r.refused }));
      return;
    }
    this.config.set(STYLE_KEY, r.kept);
    new Notice(done);
    void this.draw();
  }

  /** Draws the notes picked now, or says why nothing is drawn. A newer drawing asked meanwhile wins. */
  async draw(): Promise<void> {
    const ask = ++this.drawing;
    const notes = this.notes();
    const graphText = baseGraphText(notes, this.config.get(OUTSIDE) === true ? 'show' : 'hide');
    const texts = blocksWithStyle(graphText, this.kept());
    const reading = readNote(texts);
    const styling = readStyle(texts, BASE_GRAPH, reading);
    const plain = reading.graphs.get(BASE_GRAPH);
    const g = reading.world[BASE_GRAPH];
    if (!notes.length || !plain || !plain.boxes.length) {
      this.clear();
      this.el.createDiv({ cls: 'thoughtknot-empty', text: word('bases.empty') });
      return;
    }
    const drawing = styledDrawing(plain, styling.style, g);
    const write = (change: StyleChange, done: string) => this.write(graphText, change, done);
    const diagram = diagramShown(plain, styling.style, g, undefined, (d, done) => write({ diagram: d }, done));
    const key = `bases:${this.config.name}`;
    const state = noViewMenu(diagram) ? undefined : this.plugin.switchesFor(key, BASE_GRAPH, styling.style);
    const laidOut = (by?: object) => this.plugin.layout(state ? state.folded(drawing, by) : drawing, by);
    const drawn = diagram.table ? tableDrawn(diagram.table) : await laidOut(this).catch(() => null);
    if (ask !== this.drawing) return;
    this.clear();
    const root = this.el.createDiv({ cls: 'thoughtknot thoughtknot-bases' });
    if (!drawn) {
      root.createDiv({ cls: 'thoughtknot-banner', attr: { role: 'alert' }, text: word('blocks.engine-failed') });
      return;
    }
    if ('reason' in drawn) {
      refusalBanner(root, drawn, () => this.plugin.resumeLayouts(true));
      return;
    }
    const followed = linkHost(this.plugin, '', BASE_GRAPH);
    const links = { ...followed, broken: brokenLinks(reading, BASE_GRAPH, { found: followed.found, names: [] }) };
    this.card = this.addChild(
      graphCard(root, {
        reading,
        graph: BASE_GRAPH,
        drawn,
        problems: [],
        mode: 'note',
        diagram,
        ...(state ? { switches: { state, relayout: laidOut } } : {}),
        ...(diagram.table
          ? {}
          : { moving: { written: styling.style.nudges, move: (nudge, done) => write({ nudge }, done) } }),
        links,
        focusDepth: depthOf(this.plugin.settings.focusDepth),
        aids: aidsOf(this.plugin.settings, styling.style, undefined, vaultPresetOf(this.plugin)),
        lineOf: () => 0,
        onEdit: () => new Notice(word('bases.edit')),
      }),
    );
  }
}

/** The options the view adds to Bases' own: which property gives the links, and whether linked notes outside show. */
export function baseViewOptions(): BasesAllOptions[] {
  return [
    { key: EDGES, type: 'property', displayName: word('bases.edges'), placeholder: word('bases.edges-links') },
    { key: OUTSIDE, type: 'toggle', displayName: word('bases.outside'), default: false },
  ];
}

/** Adds the Graph view to Bases; nothing when Bases is turned off in this vault. */
export function registerBaseView(plugin: ThoughtKnotPlugin): void {
  plugin.registerBasesView(BASE_VIEW, {
    name: word('bases.name'),
    icon: 'git-fork',
    factory: (controller, el) => new BaseGraphView(controller, el, plugin),
    options: baseViewOptions,
  });
}
