// Text to graph from Obsidian (spec §47, text_to_graph_in_editor). The command (ai.ts) takes the text selected in the
// note in front, or the note's own words when nothing is selected. It opens the send dialog on it. So the send keeps to
// the rules of §19. It is offered only while AI is on, with the model for proposing changes first. It keeps within the
// ceiling, is shown exactly before Send, and is recorded. The instructions and the reading of the answer are the library's (textToGraphAsk).
// - A note that holds the graph gets the answer as a change set beside it, reviewed over the graph.
// - A note with no such graph gets a review here: the person ticks what to keep, and only that is written.
import { Modal, Notice, Setting } from 'obsidian';
import type { TFile } from 'obsidian';
import { gqlSpans, holdsGraph, noteWithTextGraphApplied, readNote, tickedOnly, word } from '@thoughtknot/core';
import type { Proposal } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { changeVaultNote, noteText } from '../storage/plugin-notes';

/** The command's id and name. */
export const TEXT_GRAPH_COMMAND = {
  id: 'text-to-graph-ai',
  get name(): string {
    return word('host.command.text-to-graph');
  },
};

/** The text to make a graph of, and the graph it goes into. */
export interface TextAsk {
  graph: string;
  words: string;
}

/** A note's own words: its text without its front matter and its gql blocks. */
export function proseOf(note: string): string {
  const out = note.split('\n');
  for (const s of gqlSpans(note)) for (let i = s.open; i <= s.open + s.text.split('\n').length + 1; i++) out[i] = '';
  const front = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(note);
  const cut = front ? front[0].split('\n').length - 1 : 0;
  return out
    .slice(cut)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The graph the text goes into: the note's first, else one named after the note. */
export function graphFor(note: string, file: TFile): string {
  const first = [...readNote(gqlSpans(note).map((s) => s.text)).graphs.keys()][0];
  if (first) return first;
  const name = file.basename
    .toLowerCase()
    .replace(/\W+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^[a-z_]/.test(name) ? name : `notes${name ? `_${name}` : ''}`;
}

/** The rows of the dialog for a text: the graph it goes into, and the text exactly as it is sent. */
export function drawTextRows(el: HTMLElement, text: TextAsk, changed: () => void): void {
  new Setting(el)
    .setName(word('ai.graph'))
    .setDesc(word('ai.text-graph.graph-row'))
    .addText((t) =>
      t.setValue(text.graph).onChange((v) => {
        text.graph = v.trim();
        changed();
      }),
    );
  el.createEl('p', { text: word('ai.text-graph.text-row', { count: text.words.length }) });
  el.createEl('pre', { cls: 'thoughtknot-ai-text', text: text.words });
}

/**
 * Whether the answer goes into the note as a change set: true when the note holds the graph. Else the review of what
 * to keep is opened here, and false.
 */
export async function asChangeSet(plugin: ThoughtKnotPlugin, file: TFile, p: Proposal): Promise<boolean> {
  if (holdsGraph((await noteText(plugin.app, file.path)) ?? '', p.graph)) return true;
  new TextGraphReview(plugin, file, p).open();
  return false;
}

/** The review of a text graph for a note with no such graph yet: each thing and link to tick, then write the ticked. */
export class TextGraphReview extends Modal {
  private readonly ticked: Set<string>;

  constructor(
    private readonly plugin: ThoughtKnotPlugin,
    private readonly file: TFile,
    private readonly proposal: Proposal,
  ) {
    super(plugin.app);
    this.ticked = new Set(proposal.changes.map((c) => c.id));
  }

  override onOpen(): void {
    this.setTitle(word('ai.text-graph.review', { graph: this.proposal.graph }));
    const el = this.contentEl;
    el.createEl('p', { text: word('ai.text-graph.review-sentence') });
    for (const c of this.proposal.changes)
      new Setting(el)
        .setName(c.op === 'add' ? c.gql : c.id)
        .setDesc(c.reason ?? '')
        .addToggle((t) =>
          t.setValue(true).onChange((on) => {
            if (on) this.ticked.add(c.id);
            else this.ticked.delete(c.id);
          }),
        );
    new Setting(el)
      .addButton((b) =>
        b
          .setButtonText(word('ai.text-graph.write'))
          .setCta()
          .onClick(() => void this.write()),
      )
      .addButton((b) => b.setButtonText(word('ai.cancel')).onClick(() => this.close()));
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  /** Writes only what is ticked into a new block of the graph, as the note now is; nothing when nothing is ticked. */
  private async write(): Promise<void> {
    let why: string | null = null,
      count = 0;
    await changeVaultNote(this.app, this.file.path, (now) => {
      const kept = tickedOnly(this.proposal, [...this.ticked], now);
      count = kept.changes.length;
      if (!count) return now;
      const written = noteWithTextGraphApplied(now, kept);
      if (typeof written === 'string') return written;
      why = written.refused;
      return now;
    });
    new Notice(why ?? word('ai.text-graph.written', { count, graph: this.proposal.graph }));
    if (!why) this.close();
  }
}
