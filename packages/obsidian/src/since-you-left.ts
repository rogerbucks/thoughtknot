// Where was I? in Obsidian (editor spec ES§74, since_you_left). After a break, a quiet item in the status bar offers
// the view. It counts the notes changed since. The command Where was I? opens it at any time. The view lists the
// places last opened and each note changed since, newest first. It never moves anything on screen: a place opens only
// when the person presses Go there. Closing the view loses nothing, and the status bar still offers it.
import { Modal, Setting } from 'obsidian';
import { awaySaid, placeSaid, sinceYouLeft, visitsFrom, word } from '@thoughtknot/core';
import type { SinceView } from '@thoughtknot/core';
import type { App, Plugin } from 'obsidian';
import type { Saved } from './saved';

/** The view, drawn: how long away, where they were with a way back to each, and what changed since. */
export class SinceModal extends Modal {
  constructor(
    app: App,
    private readonly view: SinceView | null,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle(word('since.title'));
    const el = this.contentEl,
      view = this.view;
    el.empty();
    if (!view) return void el.createEl('p', { text: word('since.no-trail') });
    el.createEl('p', { text: awaySaid(view.away) });
    el.createEl('h3', { text: word('since.places') });
    for (const place of view.places)
      new Setting(el).setName(placeSaid(place)).addButton((b) =>
        b.setButtonText(word('since.open')).onClick(() => {
          this.close();
          void this.app.workspace.openLinkText(place.path, '');
        }),
      );
    el.createEl('h3', { text: word('since.changes') });
    if (!view.changes.length) el.createEl('p', { text: word('since.no-changes') });
    const list = el.createEl('ul');
    for (const c of view.changes)
      list.createEl('li', { text: word('since.changed', { note: c.path, at: new Date(c.at).toLocaleString() }) });
    new Setting(el).addButton((b) => b.setButtonText(word('since.done')).onClick(() => this.close()));
  }
}

/** The view now, from the saved trail and the notes' change times; `whenever` gives it before a break too. */
function viewNow(plugin: Plugin, saved: () => Saved, whenever: boolean): SinceView | null {
  const notes = plugin.app.vault.getMarkdownFiles().map((f) => ({ path: f.path, changed: f.stat.mtime }));
  return sinceYouLeft(visitsFrom(saved().visits), notes, new Date(), whenever);
}

/**
 * Offers Where was I? as the plugin loads: the command at any time, and after a break the status bar item. It reads
 * the trail before this session adds to it, so the break is from the last session.
 */
export function offerSinceYouLeft(plugin: Plugin, saved: () => Saved): void {
  const back = viewNow(plugin, saved, false);
  plugin.addCommand({
    id: 'where-was-i',
    name: word('since.title'),
    callback: () => new SinceModal(plugin.app, back ?? viewNow(plugin, saved, true)).open(),
  });
  if (!back) return;
  const item = plugin.addStatusBarItem();
  item.setText(word('since.status', { count: back.changes.length }));
  item.addClass('mod-clickable');
  item.setAttr('aria-label', word('since.title'));
  plugin.registerDomEvent(item, 'click', () => new SinceModal(plugin.app, back).open());
}
