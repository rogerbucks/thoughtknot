// What the send dialog asks for (spec §59, ai_suggest_values, ai_suggest_on_ask): changes to the graph, as before, or
// suggestions. Suggestions are a value of one property, such as a category, or each thing's pull on one intent. They
// come back grouped, for a person to apply a group at a time in the change set's card. The rows here choose what is
// asked; the send itself, its ceiling and its yes are the dialog's, as for any send.
import { Setting } from 'obsidian';
import { REWRITE_MOST, judgeAsk, suggestAsk, word } from '@thoughtknot/core';
import type { SendAsk, SendRefused, SuggestFor } from '@thoughtknot/core';
export { saveLevels } from './levels-save'; // what a levels answer does, for the dialog that asks for it

/**
 * What is asked for: changes, values of a property, or pulls on an intent. Or names for the levels (ai_levels), or the
 * case for and against an idea (ai_both_sides).
 */
export type AskFor = 'changes' | 'values' | 'intent' | 'levels' | 'judge';

/** What the rows hold, as the person typed or chose it. */
export interface SuggestRows {
  ask: AskFor;
  key: string;
  of: string;
  values: string;
  intent: string;
  /** The person's own ask for a rewrite: off, so an edit changes at most a few things they wrote (ai_smallest_edit). */
  rewrite: boolean;
  /** The thing to judge, when the case for and against an idea is asked for. */
  idea: string;
}

/** The rows as the dialog opens: changes asked for, nothing typed. */
export const NO_SUGGESTION: SuggestRows = {
  ask: 'changes',
  key: 'category',
  of: '',
  values: '',
  intent: '',
  rewrite: false,
  idea: '',
};

/** The idea to judge, when the case for and against one is asked for; else null. */
export const ideaOf = (rows: SuggestRows): string | null => (rows.ask === 'judge' && rows.idea ? rows.idea : null);

/** The question the dialog offers for what is asked, until the person writes their own. */
function questionFor(ask: AskFor): string {
  return word(ask === 'changes' ? 'ai.question' : ask === 'judge' ? 'ai.judge.question' : 'ai.suggest.question');
}

/** The question once what is asked changes: the one offered for it, unless the person wrote their own. */
export function offeredQuestion(ask: AskFor, question: string): string {
  return (['changes', 'values', 'judge'] as const).map(questionFor).includes(question) ? questionFor(ask) : question;
}

/**
 * The ask the rows make, in the person's own words. It is a judgement of an idea (ai_both_sides), or suggestions read
 * back only as suggestions (ES§59). Or it is changes, held to the edit cap unless a rewrite was asked (ai_smallest_edit).
 */
export function askOf(
  base: Omit<SendAsk, 'question' | 'answers'>,
  rows: SuggestRows,
  question: string,
): SendAsk | SendRefused {
  const idea = ideaOf(rows);
  if (idea) return judgeAsk(base, idea, question);
  const f = suggestForOf(rows);
  return f ? suggestAsk(base, f, question) : { ...base, question, rewrite: rows.rewrite };
}

/** What the rows ask the model for, or null for changes or a judgement. A list of values is split at its commas. */
export function suggestForOf(rows: SuggestRows): SuggestFor | null {
  if (rows.ask === 'changes' || rows.ask === 'judge') return null;
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
  graph: { name: string; intents: string[]; things: { key: string; text: string }[] },
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
        .addOption('judge', word('ai.judge.ask-judge'))
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
  if (rows.ask === 'judge') return drawIdeaRow(el, rows, graph.things, () => changed(false));
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

/** Whether the rows ask your AI to name the levels: its answer is then kept in the AI block (ai_block). */
export const levelsAsked = (rows: SuggestRows): boolean => rows.ask === 'levels';

/** The row that picks the idea to judge, from the graph's things: the first one until the person picks. */
function drawIdeaRow(
  el: HTMLElement,
  rows: SuggestRows,
  things: { key: string; text: string }[],
  changed: () => void,
): void {
  if (!things.some((t) => t.key === rows.idea)) rows.idea = things[0]?.key ?? '';
  new Setting(el).setName(word('ai.judge.idea')).addDropdown((d) => {
    for (const t of things) d.addOption(t.key, t.text || t.key);
    d.setValue(rows.idea).onChange((v) => {
      rows.idea = v;
      changed();
    });
  });
}
