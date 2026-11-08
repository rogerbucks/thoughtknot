// Letting a public reviewer see this vault (editor spec ES§19, ai_public_names_only; Roger, 7 Nov 2026, R7). It is
// off until the person chooses. Raising it first shows exactly what one real note would send: the note open now, else
// the first with a graph. Only Allow saves it. Lowering it, or turning it off, is saved at once, in one step.
import { Modal, Notice, Setting } from 'obsidian';
import { gqlBlocks, publicPreview, word } from '@thoughtknot/core';
import type { AiPublic } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { noteText } from '../storage/plugin-notes';

const RANK: Record<AiPublic, number> = { off: 0, names: 1, note: 2 };

/** Whether going from `from` to `to` lets a public reviewer have more, and so must be shown and allowed first. */
export const raises = (from: AiPublic, to: AiPublic): boolean => RANK[to] > RANK[from];

/** The note to show: the one open now when it holds a graph, else the first of the vault that does; or none. */
async function realNote(plugin: ThoughtKnotPlugin): Promise<{ path: string; text: string } | null> {
  const { workspace, vault } = plugin.app;
  const open = workspace.getActiveFile()?.path;
  const paths = vault.getMarkdownFiles().map((f) => f.path);
  for (const path of open ? [open, ...paths.filter((p) => p !== open)] : paths) {
    const text = await noteText(plugin.app, path, { shown: true });
    if (text && gqlBlocks(text).length) return { path, text };
  }
  return null;
}

/** The dialog that shows what one note would send at `level`, and answers whether the person allowed it. */
class ConsentDialog extends Modal {
  private allowed = false;

  constructor(
    plugin: ThoughtKnotPlugin,
    private readonly level: AiPublic,
    private readonly path: string,
    private readonly sent: string,
    private readonly answer: (allowed: boolean) => void,
  ) {
    super(plugin.app);
  }

  override onOpen(): void {
    this.setTitle(word('ai.consent.title'));
    const el = this.contentEl;
    el.createEl('p', { text: word(this.level === 'note' ? 'ai.consent.note' : 'ai.consent.names') });
    el.createEl('p', { text: word('ai.consent.from', { path: this.path }) });
    el.createEl('pre', { cls: 'thoughtknot-ai-consent', text: this.sent });
    new Setting(el)
      .addButton((b) =>
        b
          .setButtonText(word('ai.consent.allow'))
          .setCta()
          .onClick(() => {
            this.allowed = true;
            this.close();
          }),
      )
      .addButton((b) => b.setButtonText(word('ai.consent.keep')).onClick(() => this.close()));
  }

  override onClose(): void {
    this.contentEl.empty();
    this.answer(this.allowed);
  }
}

/**
 * Whether the vault may let a public reviewer have `level`: asked after showing what one real note would send. With no
 * note holding a graph there is nothing to show, so it says so and is not allowed.
 */
export async function askPublicConsent(plugin: ThoughtKnotPlugin, level: AiPublic): Promise<boolean> {
  const note = await realNote(plugin);
  if (!note) {
    new Notice(word('ai.consent.no-note'));
    return false;
  }
  const sent = publicPreview(note.text, level, await plugin.sharedSchemas());
  return new Promise((answer) => new ConsentDialog(plugin, level, note.path, sent, answer).open());
}
