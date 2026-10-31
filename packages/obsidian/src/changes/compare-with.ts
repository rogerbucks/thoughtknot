// Compare with, on a card in Obsidian (editor spec §41, changes_view_obsidian; risk NEURO-2). It lists the earlier
// versions of the note the plug-in kept, each the text just before it changed the note. One picked is drawn with the
// note as it is now by the core's changes view (changes-view.ts). Each thing and link added, removed or changed is
// marked by its line and its hue. The same changes are listed in words. Nothing is written.
import { Modal } from 'obsidian';
import { changesView, markedChanges, noChanges, PALETTES, word } from '@thoughtknot/core';
import type { ChangesShown, NoteVersion } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { noteText } from '../storage/plugin-notes';
import { versionsOf } from '../storage/note-history';

/** When a version was kept, in the person's own words for dates and times. */
const whenOf = (v: NoteVersion): string =>
  word('changes.kept-at', {
    when: new Date(v.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
  });

/** The window of Compare with, on graph `graph` of the note at `path`. */
class CompareWith extends Modal {
  /** How many times a version was asked for: a slower, earlier ask drops what it read, so only the last is shown. */
  private asked = 0;

  constructor(
    private readonly plugin: ThoughtKnotPlugin,
    private readonly path: string,
    private readonly graph: string,
  ) {
    super(plugin.app);
  }

  override onOpen(): void {
    this.setTitle(word('changes.compare-title', { graph: this.graph }));
    this.modalEl.addClass('thoughtknot-compare');
    const versions = versionsOf(this.plugin.app, this.path);
    if (!versions.length) {
      this.contentEl.createEl('p', { text: word('changes.none-kept') });
      return;
    }
    const row = this.contentEl.createDiv({ cls: 'thoughtknot-compare-pick' });
    const pick = row.createEl('select', { attr: { 'aria-label': word('changes.version') } });
    versions.forEach((v, i) => pick.createEl('option', { text: whenOf(v), value: String(i) }));
    const result = this.contentEl.createDiv({ cls: 'thoughtknot-compare-result', attr: { 'aria-live': 'polite' } });
    const show = () => {
      const v = versions[Number(pick.value)];
      if (v) void this.show(result, v);
    };
    row
      .createEl('button', { text: word('changes.show'), cls: 'mod-cta', attr: { type: 'button' } })
      .addEventListener('click', show);
    show(); // the newest at once: the question is nearly always what changed last
  }

  /** Draws `v` with the note as it is now into `result`, with the list of changes under it. */
  private async show(result: HTMLElement, v: NoteVersion): Promise<void> {
    const ask = ++this.asked;
    result.empty();
    result.createEl('p', { text: word('changes.reading') });
    let shown: ChangesShown;
    try {
      const now = (await noteText(this.plugin.app, this.path)) ?? '';
      if (ask !== this.asked) return;
      shown = changesView(v.text, now, this.graph);
    } catch (e) {
      result.empty();
      result.createEl('p', { text: e instanceof Error ? e.message : String(e) });
      return;
    }
    result.empty();
    const label = whenOf(v);
    result.createEl('h3', { text: word('changes.heading', { graph: this.graph, label }) });
    const picture = result.createDiv({ cls: 'thoughtknot-compare-drawing' });
    const list = result.createEl('ul', { cls: 'thoughtknot-compare-list', attr: { id: 'thoughtknot-compare-list' } });
    if (!shown.changes.length) list.createEl('li', { text: noChanges() });
    for (const c of shown.changes) {
      const item = list.createEl('li', { text: c.said, cls: `thoughtknot-change is-${c.mark}` });
      if (c.details.length) {
        const inner = item.createEl('ul');
        for (const d of c.details) inner.createEl('li', { text: d });
      }
    }
    await this.draw(picture, shown, label, ask);
  }

  /** The changes drawn, each marked in the theme's fixed colours, as an image the list describes. */
  private async draw(picture: HTMLElement, shown: ChangesShown, label: string, ask: number): Promise<void> {
    const drawing = shown.reading.graphs.get(this.graph);
    if (!drawing) return;
    const theme = activeDocument.body.hasClass('theme-dark') ? 'dark' : 'light';
    const drawn = await this.plugin.layoutForExport(drawing, theme).catch(() => null);
    if (ask !== this.asked) return;
    if (!drawn || 'reason' in drawn) {
      picture.createEl('p', { text: word('changes.not-drawn') });
      return;
    }
    const svg = markedChanges(drawn.svg, shown, PALETTES[theme]);
    picture.createEl('img', {
      attr: {
        src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        alt: word('changes.alt', {
          name: word('changes.figure', { graph: this.graph, label }),
          count: shown.changes.length,
        }),
        'aria-describedby': 'thoughtknot-compare-list',
      },
    });
  }
}

/** Opens Compare with on graph `graph` of the note at `path`. */
export function compareWith(plugin: ThoughtKnotPlugin, path: string, graph: string): void {
  new CompareWith(plugin, path, graph).open();
}
