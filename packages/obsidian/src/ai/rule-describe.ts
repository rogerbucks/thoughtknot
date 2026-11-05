// Describing a rule to an AI, from the Highlight things form (spec §56, rule_look_describe). The form hands the
// person's words here. They go through the send dialog, as every send does (§19). The model is named and the exact
// request is shown. Only a Send pressed on exactly that sends it, once, and records it. The key
// stays in Obsidian's secret store on this device. What comes back only fills the form: it is never tried or saved.
import { Notice } from 'obsidian';
import { aiReady, gqlBlocks, readNote, ruleChoices, word } from '@thoughtknot/core';
import type { RuleWrite } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { levelFor } from './ai';
import { SendDialog } from './send-dialog';
import { noteText } from '../storage/plugin-notes';

/** The form's way to describe a rule, or nothing while AI is off (ai_off_until_chosen): the box is then not offered. */
export function describeFor(plugin: ThoughtKnotPlugin, path: string, graph: string) {
  if ('off' in aiReady(plugin.settings)) return undefined;
  return (words: string, fill: (rule: RuleWrite) => void) => void openDescribe(plugin, path, graph, words, fill);
}

/** Opens the send dialog on note `path`, the whole of `graph` chosen, with the person's `words` as the question. */
async function openDescribe(
  plugin: ThoughtKnotPlugin,
  path: string,
  graph: string,
  words: string,
  fill: (rule: RuleWrite) => void,
): Promise<void> {
  const file = plugin.app.vault.getFileByPath(path);
  if (!file) return;
  const note = (await noteText(plugin.app, path)) ?? '';
  const shared = await plugin.sharedSchemas();
  const g = readNote(
    gqlBlocks(note).map((b) => b.text),
    undefined,
    shared,
  ).world[graph];
  if (!g) return void new Notice(word('ai.suggest.no-graph', { graph }));
  const start = { graph, things: [], question: words, rule: { choices: ruleChoices(g), fill } };
  new SendDialog(plugin, file, note, levelFor(plugin, file, note), shared, start).open();
}
