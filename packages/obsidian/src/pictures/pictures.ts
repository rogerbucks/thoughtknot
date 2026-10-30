// The pictures for readers without ThoughtKnot in Obsidian (editor spec §62). Two commands turn them on and off for the
// note in front; off asks first. They are kept in step as a note changes, is opened, renamed or deleted
// (picture-files.ts). Wherever the plugin draws the block, its image line is hidden so the graph shows once
// (picture-hide.ts).
import { Modal, Notice, TFile } from 'obsidian';
import type { App } from 'obsidian';
import { pictureTarget, picturesOnFor, word } from '@thoughtknot/core';
import type { PluginCommand } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { noteToRewrite } from '../reading-view';
import { followNote, refreshPictures, removePictures, trashOurs } from './picture-files';
import { hideInLivePreview, hideInReadingView } from './picture-hide';

/** The workspace event told each time a note's pictures have been brought up to date, with the note's path. */
export const PICTURES_KEPT = 'thoughtknot:pictures-kept';

/** How long a note rests after a change before its pictures are brought up to date, in milliseconds. */
export const PICTURE_REST_MS = 600;

/** Asks a question with two answers: `yes` runs the first; the second, or closing it, does nothing. */
class Ask extends Modal {
  constructor(
    app: App,
    private readonly said: string,
    private readonly yes: string,
    private readonly then: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.setTitle(word('pictures.ask-title'));
    this.contentEl.createEl('p', { text: this.said });
    const row = this.contentEl.createDiv({ cls: 'thoughtknot-leave-row' });
    row
      .createEl('button', { text: this.yes, cls: 'mod-cta', attr: { type: 'button' } })
      .addEventListener('click', () => {
        this.close();
        this.then();
      });
    row
      .createEl('button', { text: word('pictures.cancel'), attr: { type: 'button' } })
      .addEventListener('click', () => this.close());
  }
}

/** Turns the pictures on for the note in front and draws them; a classified note is asked about first. */
async function turnOn(plugin: ThoughtKnotPlugin, confirmed = false): Promise<void> {
  const note = noteToRewrite(plugin.app.workspace, word('pictures.command.on'));
  if (!note) return;
  const run = await refreshPictures(plugin, note.file.path, { turnOn: true, confirmed });
  if (run?.ask && !confirmed) {
    new Ask(plugin.app, run.ask, word('pictures.make'), () => void turnOn(plugin, true)).open();
    return;
  }
  for (const failed of run?.failed ?? []) new Notice(failed);
  const has = (await plugin.app.vault.read(note.file)).includes('.thoughtknot.svg');
  new Notice(has ? word('pictures.drawn', { count: run?.drawn ?? 0 }) : word('pictures.none'));
}

/** Asks, then takes every picture line out of the note in front, and the files ThoughtKnot made for them. */
function turnOff(plugin: ThoughtKnotPlugin): void {
  const note = noteToRewrite(plugin.app.workspace, word('pictures.command.off'));
  if (!note) return;
  const path = note.file.path;
  new Ask(plugin.app, word('pictures.ask-off', { note: path }), word('pictures.remove'), () => {
    void removePictures(plugin, path).then(() => {
      new Notice(word('pictures.removed', { note: path }));
      if (picturesOnFor(plugin.settings, path)) new Notice(word('pictures.folder-on'));
    });
  }).open();
}

/** The two commands, as the plug-in interface lists them. */
export function pictureCommands(plugin: ThoughtKnotPlugin): PluginCommand[] {
  return [
    { id: 'pictures-on', title: word('pictures.command.on'), run: () => turnOn(plugin) },
    { id: 'pictures-off', title: word('pictures.command.off'), run: () => turnOff(plugin) },
  ];
}

/**
 * Keeps each note's pictures in step: after a change has rested, when a note is opened, and when one is renamed. A
 * deleted note's pictures go with it. It hides the image lines where the plugin draws the block.
 */
export function keepPictures(plugin: ThoughtKnotPlugin): void {
  const waiting = new Map<string, number>(),
    linked = new Map<string, string[]>();
  const refresh = (path: string) =>
    void refreshPictures(plugin, path)
      .then(async () => {
        const f = plugin.app.vault.getAbstractFileByPath(path);
        const text = f instanceof TFile ? await plugin.app.vault.read(f) : '';
        linked.set(
          path,
          [...text.matchAll(/\]\(([^)\s]*\.thoughtknot\.svg)\)/gi)].map((m) => m[1] ?? ''),
        );
        // said once the note's pictures are in step, for whatever waits on them
        plugin.app.workspace.trigger(PICTURES_KEPT, path);
      })
      .catch((e: unknown) => console.error('ThoughtKnot could not keep the pictures of', path, e));
  const later = (path: string) => {
    window.clearTimeout(waiting.get(path));
    waiting.set(
      path,
      window.setTimeout(() => {
        waiting.delete(path);
        refresh(path);
      }, PICTURE_REST_MS),
    );
  };
  const { vault, workspace } = plugin.app;
  plugin.registerEvent(vault.on('modify', (f) => f instanceof TFile && f.extension === 'md' && later(f.path)));
  plugin.registerEvent(workspace.on('file-open', (f) => f && f.extension === 'md' && refresh(f.path)));
  plugin.registerEvent(
    vault.on('rename', (f, old) => {
      if (f instanceof TFile && f.extension === 'md') void followNote(plugin, f.path, old);
    }),
  );
  plugin.registerEvent(
    vault.on('delete', (f) => {
      for (const href of linked.get(f.path) ?? []) void trashOurs(plugin, pictureTarget(f.path, href));
      linked.delete(f.path);
    }),
  );
  hideInReadingView(plugin);
  plugin.registerEditorExtension(hideInLivePreview());
}
