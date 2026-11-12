// What the send dialog asks for (spec §59, ai_suggest_values, ai_suggest_on_ask): changes to the graph, as before, or
// suggestions. Suggestions are a value of one property, such as a category, or each thing's pull on one intent. They
// come back grouped, for a person to apply a group at a time in the change set's card. The rows here choose what is
// asked; the send itself, its ceiling and its yes are the dialog's, as for any send.
import { Setting } from 'obsidian';
import { REWRITE_MOST, word } from '@thoughtknot/core';
import type { SuggestFor } from '@thoughtknot/core';
export { saveLevels } from './levels-save'; // what a levels answer does, for the dialog that asks for it

/** What is asked for: changes, values of a property, pulls on an intent, or names for the levels (ai_levels). */
export type AskFor = 'changes' | 'values' | 'intent' | 'levels';

/** What the rows hold, as the person typed or chose it. */
export interface SuggestRows {
  ask: AskFor;
  key: string;
  of: string;
  values: string;
  intent: string;
  /** The person's own ask for a rewrite: off, so an edit changes at most a few things they wrote (ai_smallest_edit). */
  rewrite: boolean;
}

/** The rows as the dialog opens: changes asked for, nothing typed. */
export const NO_SUGGESTION: SuggestRows = {
  ask: 'changes',
  key: 'category',
  of: '',
  values: '',
  intent: '',
  rewrite: false,
};

/** What the rows ask the model for, or null for changes. A list of values is split at its commas. */
export function suggestForOf(rows: SuggestRows): SuggestFor | null {
  if (rows.ask === 'changes') return null;
  if (rows.ask === 'intent') return { kind: 'intent', intent: rows.intent.trim() };
  if (rows.ask === 'levels') return { kind: 'levels' };
  const values = rows.values
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return {
    kind: 'value',
    key: rows.key.trim(),
    ...(rows.of.trim() ? { of: rows.of.trim() } : {}),
    ...(values.length ? { values } : {}),
  };
}

/** A text row that changes `field` of the rows as it is typed. */
function textRow(el: HTMLElement, rows: SuggestRows, field: 'key' | 'of' | 'values', changed: () => void): void {
  new Setting(el)
    .setName(word(`ai.suggest.${field}`))
    .setDesc(word(`ai.suggest.${field}.sentence`))
    .addText((t) =>
      t.setValue(rows[field]).onChange((v) => {
        rows[field] = v;
        changed();
      }),
    );
}

/**
 * The rows that choose what is asked for, in `el`. `intents` are the graph's intents. `changed` is told of each change,
 * with true when the dialog must be drawn again.
 */
export function drawSuggestRows(
  el: HTMLElement,
  rows: SuggestRows,
  graph: { name: string; intents: string[] },
  changed: (redraw: boolean) => void,
): void {
  new Setting(el)
    .setName(word('ai.suggest.ask-for'))
    .setDesc(word('ai.suggest.ask-for.sentence'))
    .addDropdown((d) =>
      d
        .addOption('changes', word('ai.suggest.ask-changes'))
        .addOption('values', word('ai.suggest.ask-values'))
        .addOption('intent', word('ai.suggest.ask-intent'))
        .addOption('levels', word('ai.suggest.ask-levels'))
        .setValue(rows.ask)
        .onChange((v) => {
          rows.ask = v as AskFor;
          changed(true);
        }),
    );
  if (rows.ask === 'changes')
    new Setting(el)
      .setName(word('ai.rewrite'))
      .setDesc(word('ai.rewrite.sentence', { most: REWRITE_MOST }))
      .addToggle((t) =>
        t.setValue(rows.rewrite).onChange((v) => {
          rows.rewrite = v;
          changed(false);
        }),
      );
  if (rows.ask === 'values')
    for (const f of ['key', 'of', 'values'] as const) textRow(el, rows, f, () => changed(false));
  if (rows.ask !== 'intent') return;
  if (!graph.intents.length) {
    el.createEl('p', { text: word('ai.suggest.no-intents', { graph: graph.name }) });
    return;
  }
  if (!graph.intents.includes(rows.intent)) rows.intent = graph.intents[0] ?? '';
  new Setting(el).setName(word('ai.suggest.intent')).addDropdown((d) => {
    for (const i of graph.intents) d.addOption(i, i);
    d.setValue(rows.intent).onChange((v) => {
      rows.intent = v;
      changed(false);
    });
  });
}
