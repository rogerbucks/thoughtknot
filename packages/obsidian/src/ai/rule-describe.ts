// Describing a rule to an AI, from the Highlight things form (spec §56, rule_look_describe). The form hands the
// person's words here. They go through the send dialog, as every send does (§19). The model is named and the exact
// request is shown. Only a Send pressed on exactly that sends it, once, and records it. The key
// stays in Obsidian's secret store on this device. What comes back only fills the form: it is never tried or saved.
import { Notice } from 'obsidian';
import { aiReady, gqlBlocks, readNote, ruleChoices, ruleDescribeAsk, word } from '@thoughtknot/core';
import type { RuleWrite } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { levelFor } from './ai';
import { SendDialog } from './send-dialog';
import { noteText } from '../storage/plugin-notes';

/** A rule asked for in words: the graph's choices to read the answer by, and the form to fill with it. */
export interface RuleAsking {
  /** The ask for `words` over `graph`, held to the graph's choices. */
  ask(base: Parameters<typeof ruleDescribeAsk>[0], graph: string, words: string): ReturnType<typeof ruleDescribeAsk>;
  /** Fills the form with the rule that came back, and says so. Nothing is tried or saved. */
  fill(rule: RuleWrite, model: string, done: () => void): void;
}

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
  const start = { graph, things: [], question: words, rule: asking(g, fill) };
  new SendDialog(plugin, file, note, levelFor(plugin, file, note), shared, start).open();
}

/** What the dialog is asked with: the graph's choices, and a fill that tells the person the form was filled in. */
function asking(g: Parameters<typeof ruleChoices>[0], fill: (rule: RuleWrite) => void): RuleAsking {
  const choices = ruleChoices(g);
  return {
    ask: (base, graph, words) => ruleDescribeAsk(base, graph, choices, words),
    fill: (rule, model, done) => {
      fill(rule);
      new Notice(word('ai.rule.filled', { model }));
      done();
    },
  };
}
