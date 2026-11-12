// Asking an AI model to propose changes (spec §19). The command only says so while AI is off or no model is set up
// (ai_off_until_chosen). Otherwise it opens the send dialog on the note in front. The note's classification is read
// from its text as well as the metadata cache, and the higher is taken. Obsidian has no AI of its own to
// offer first (host_ai_first), so only the models set up in the settings are offered. And the command that clears the
// record of sends (record_every_send), which keeps only the last ones and never the text sent.
// Expand with AI (edit_ai_expand) opens the same dialog from the editor beside a thing. The thing is chosen, with a
// question to expand it into things and links. Nothing goes until the person shows and sends it, and nothing is written but a
// proposal, accepted one change at a time. While AI is off, the editor offers no Expand.
import { Notice } from 'obsidian';
import type { TFile } from 'obsidian';
import { aiReady, keepProposal, noteWithProposal, word } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { classificationInText, classificationOf, higherClassification } from '../export/classification';
import { noteToRewrite } from '../reading-view';
import { SendDialog } from './send-dialog';
import { changeVaultNote, noteText } from '../storage/plugin-notes';
import { TEXT_GRAPH_COMMAND, graphFor, graphNamed, proseOf } from './text-graph';

/** The command's id and name. */
export const AI_COMMAND = {
  id: 'ask-ai-model',
  get name(): string {
    return word('host.command.ask-ai');
  },
};

/** The command that clears the record of sends: its id and name. */
export const CLEAR_SENDS_COMMAND = {
  id: 'clear-ai-sends',
  get name(): string {
    return word('host.command.clear-sends');
  },
};

/** How many sends the record keeps: the oldest is let go when one more is recorded. */
export const SENDS_KEPT = 200;

/** Opens the send dialog on the note in front; or says why not: AI is off, or no note is in front to write a proposal into. */
export async function askAi(plugin: ThoughtKnotPlugin): Promise<void> {
  const ready = aiReady(plugin.settings);
  if ('off' in ready) {
    new Notice(ready.off);
    return;
  }
  // the proposal is written into the note, so a note in reading view is refused, as any command that writes is
  const front = noteToRewrite(plugin.app.workspace, word('host.to-ask-ai'));
  if (!front) return;
  const text = (await noteText(plugin.app, front.file.path)) ?? '';
  new SendDialog(plugin, front.file, text, levelFor(plugin, front.file, text), await plugin.sharedSchemas()).open();
}

/**
 * The note's classification, read from the text being sent as well as the metadata cache, which can be behind it. The
 * higher is taken. It is read again each time the dialog shows what will be sent, against the classifications then.
 */
export function levelFor(plugin: ThoughtKnotPlugin, file: TFile, text: string): () => string | null {
  return () => {
    const { classifications: levels, aiUnlabelled } = plugin.settings;
    return higherClassification(
      classificationOf(plugin.app, file, text, levels),
      classificationInText(text, levels),
      levels,
      aiUnlabelled,
    );
  };
}

/** Expand with AI for the card of graph `graph` in note `path`: offered only while AI is on (ai_off_until_chosen). */
export function expandFor(plugin: ThoughtKnotPlugin, path: string, graph: string) {
  return {
    ready: () => !('off' in aiReady(plugin.settings)),
    open: (key: string, thing: string, typed: string) => void expandWithAi(plugin, path, graph, key, thing, typed),
    levels: () => void nameLevels(plugin, path, graph),
    keep: () => void keepAiLevels(plugin, path, graph),
  };
}

/**
 * Keep as mine (ai_block_not_data): what the AI block of `graph` holds, written into note `path` as a proposal. The
 * person reviews and applies it like any other. Nothing reaches the graph until then. Reading view is refused.
 */
async function keepAiLevels(plugin: ThoughtKnotPlugin, path: string, graph: string): Promise<void> {
  const front = noteToRewrite(plugin.app.workspace, word('host.to-keep-ai'));
  if (!front || front.file.path !== path) return;
  let said: string | null = null;
  await changeVaultNote(plugin.app, path, (now) => {
    const p = keepProposal(now, graph, new Date().toISOString().slice(0, 10));
    const written = 'refused' in p ? p : noteWithProposal(now, p);
    if (typeof written === 'string') {
      said = word('ai-block.kept');
      return written;
    }
    said = written.refused;
    return now;
  });
  if (said) new Notice(said);
}

/** Opens the send dialog on note `path`, thing `key` of `graph` chosen, asked to expand it, with what was `typed`. */
async function expandWithAi(
  plugin: ThoughtKnotPlugin,
  path: string,
  graph: string,
  key: string,
  thing: string,
  typed: string,
): Promise<void> {
  const ready = aiReady(plugin.settings);
  if ('off' in ready) return void new Notice(ready.off);
  const file = plugin.app.vault.getFileByPath(path);
  if (!file) return;
  const text = (await noteText(plugin.app, path)) ?? '';
  const more = typed.trim() ? word('ai.expand-typed', { typed: typed.trim() }) : '';
  const question = word('ai.expand', { thing, typed: more });
  const start = { graph, things: [key], question };
  new SendDialog(plugin, file, text, levelFor(plugin, file, text), await plugin.sharedSchemas(), start).open();
}

/** Opens the send dialog on note `path`, the whole of `graph` chosen, asking your AI to name its levels (ai_levels). */
async function nameLevels(plugin: ThoughtKnotPlugin, path: string, graph: string): Promise<void> {
  const ready = aiReady(plugin.settings);
  if ('off' in ready) return void new Notice(ready.off);
  const file = plugin.app.vault.getFileByPath(path);
  if (!file) return;
  const text = (await noteText(plugin.app, path)) ?? '';
  const start = { graph, things: [], question: word('ai.suggest.levels-ask'), suggest: { ask: 'levels' as const } };
  new SendDialog(plugin, file, text, levelFor(plugin, file, text), await plugin.sharedSchemas(), start).open();
}

/**
 * Text to graph (§47): the command, offered only while AI is on. It opens the send dialog on the text selected in the
 * note in front, or on the note's own words when nothing is selected.
 */
export function textGraphCommand(plugin: ThoughtKnotPlugin) {
  return {
    id: TEXT_GRAPH_COMMAND.id,
    title: TEXT_GRAPH_COMMAND.name,
    available: () => !('off' in aiReady(plugin.settings)),
    run: async () => {
      const ready = aiReady(plugin.settings);
      if ('off' in ready) return void new Notice(ready.off);
      const front = noteToRewrite(plugin.app.workspace, word('host.to-text-graph'));
      if (!front) return;
      const note = (await noteText(plugin.app, front.file.path)) ?? '';
      const chosen = front.view.editor?.getSelection() ?? '';
      const words = chosen.trim() ? chosen : proseOf(note);
      if (!words.trim()) return void new Notice(word('ai.text-graph.no-text'));
      const text = { graph: graphFor(note, front.file), words };
      const start = { graph: text.graph, things: [], question: word('ai.text-graph.question'), text };
      const level = levelFor(plugin, front.file, note);
      new SendDialog(plugin, front.file, note, level, await plugin.sharedSchemas(), start).open();
    },
  };
}

/**
 * Text to graph on a .txt place a note draws from (connector_text_proposed). It opens the send dialog on the file's
 * words, for the note at `path`. Each change the answer proposes cites the file and line. Nothing is written until a
 * person keeps it.
 */
export async function proseGraph(plugin: ThoughtKnotPlugin, path: string, prose: { place: string; text: string }) {
  const ready = aiReady(plugin.settings);
  if ('off' in ready) return void new Notice(ready.off);
  const file = plugin.app.vault.getFileByPath(path);
  if (!file) return;
  const note = (await noteText(plugin.app, path)) ?? '';
  const base = prose.place.replace(/^.*\//, '').replace(/\.txt$/i, '');
  const text = { graph: graphNamed(base), words: prose.text, place: prose.place };
  const start = { graph: text.graph, things: [], question: word('ai.text-graph.question'), text };
  new SendDialog(plugin, file, note, levelFor(plugin, file, note), await plugin.sharedSchemas(), start).open();
}

/** Clears the record of sends, saying how many were let go. */
export async function clearAiSends(plugin: ThoughtKnotPlugin): Promise<void> {
  const n = await plugin.clearAiSends();
  new Notice(word('host.sends-cleared', { count: n }));
}
