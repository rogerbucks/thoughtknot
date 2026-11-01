// The parts of the Highlight things form (editor spec §56, rule_look_builder), each in plain words:
// - the Find step: things of a kind, or links of a type, and their tests. Each test is a property, a comparison and a
//   value, all picked from lists the graph fills;
// - the test written as text, for a person who would rather write it, out of the way until asked for;
// - the look: a colour, a badge and a line, each a sample to pick, none of them a word to type;
// - the preview: one thing found, drawn with the look it would take.
import {
  BADGES,
  BADGE_GLYPHS,
  LINES,
  LINKS_FIELD,
  NUMBER_OPS,
  RULE_OPS,
  STYLE_HUES,
  hueColour,
  word,
} from '@thoughtknot/core';
import type { WordKey, RuleChoices, RuleDraft, RuleField, RuleOp, RuleWrite } from '@thoughtknot/core';
import { button } from '../button.ts';

/** What the form holds as a person builds a rule, and whether they wrote its test or its name themselves. */
export interface FormState {
  draft: RuleDraft;
  meansTyped: boolean;
  whenTyped: boolean;
}

/** The fields the look is picked into. */
export interface LookFields {
  colour: HTMLInputElement;
  badge: HTMLInputElement;
  line: HTMLInputElement;
}

let lists = 0;

/** A list to pick from, its options as `[value, shown]`, with `value` picked. */
function pick(
  parent: HTMLElement,
  label: string,
  options: [string, string][],
  value: string,
  changed: (v: string) => void,
) {
  const select = parent.createEl('select', { cls: 'dropdown', attr: { 'aria-label': label } });
  for (const [v, shown] of options) {
    const o = select.createEl('option', { text: shown, attr: { value: v } });
    if (v === value) o.setAttribute('selected', '');
  }
  select.value = value;
  select.addEventListener('change', () => changed(select.value));
  return select;
}

/** The fields a draft's tests may name, with any it names that the graph does not hold, so none is lost. */
function fieldsFor(draft: RuleDraft, choices: RuleChoices | undefined): RuleField[] {
  const known = (draft.on === 'links' ? choices?.links : choices?.things) ?? [];
  const named = draft.tests.map((t) => t.field).filter((f) => f && !known.some((k) => k.name === f));
  return [...known, ...named.map((name) => ({ name, number: false, values: [] }))];
}

/** One test of the draft: its property, its comparison and its value, and a way to take it out. */
function testRow(
  list: HTMLElement,
  state: FormState,
  i: number,
  fields: RuleField[],
  rebuild: () => void,
  changed: () => void,
) {
  const t = state.draft.tests[i];
  if (!t) return;
  const row = list.createDiv({ cls: 'thoughtknot-rule-test' });
  if (i > 0) row.createSpan({ cls: 'thoughtknot-rule-word', text: word('rules.and-word') });
  const said = (f: string) => (f === LINKS_FIELD ? word('rules.links') : f);
  pick(
    row,
    word('rules.field'),
    [['', word('rules.pick-field')], ...fields.map((f): [string, string] => [f.name, said(f.name)])],
    t.field,
    (v) => {
      t.field = v;
      const f = fields.find((x) => x.name === v);
      if (!f?.number && NUMBER_OPS.includes(t.op)) t.op = 'is';
      if (f && !f.number && f.values.length && !f.values.includes(t.value)) t.value = f.values[0] ?? '';
      rebuild();
    },
  );
  const field = fields.find((f) => f.name === t.field);
  const ops = field?.number ? RULE_OPS : RULE_OPS.filter((o) => !NUMBER_OPS.includes(o));
  pick(
    row,
    word('rules.op'),
    ops.map((o): [string, string] => [o, word(`rules.op.${o}`)]),
    t.op,
    (v) => {
      t.op = v as RuleOp;
      changed();
    },
  );
  const id = `thoughtknot-rule-values-${++lists}`;
  const value = row.createEl('input', {
    attr: {
      type: 'text',
      'aria-label': word('rules.value'),
      placeholder: word('rules.value'),
      list: id,
      value: t.value,
    },
  });
  value.value = t.value;
  const known = row.createEl('datalist', { attr: { id } });
  for (const v of field?.values ?? []) known.createEl('option', { attr: { value: v } });
  value.addEventListener('input', () => {
    t.value = value.value;
    changed();
  });
  if (state.draft.tests.length > 1)
    button(row, word('rules.remove-test'), 'x', () => {
      state.draft.tests.splice(i, 1);
      rebuild();
    });
}

/** The Find step, in `find`: things or links, of which kind or type, and each test, with And to add one. */
export function renderFind(
  find: HTMLElement,
  state: FormState,
  choices: RuleChoices | undefined,
  changed: () => void,
): void {
  find.empty();
  const { draft } = state;
  const rebuild = () => {
    renderFind(find, state, choices, changed);
    changed();
  };
  const head = find.createDiv({ cls: 'thoughtknot-rule-test' });
  const types = choices?.types ?? [];
  pick(
    head,
    word('rules.on'),
    [
      ['things', word('rules.on.things')],
      ...(types.length ? [['links', word('rules.on.links')] as [string, string]] : []),
    ],
    draft.on,
    (v) => {
      draft.on = v === 'links' ? 'links' : 'things';
      draft.of = draft.on === 'links' ? (types[0] ?? '') : '';
      draft.tests = [{ field: '', op: 'is', value: '' }];
      rebuild();
    },
  );
  const of: [string, string][] =
    draft.on === 'links'
      ? types.map((t) => [t, t])
      : [['', word('rules.of.any')], ...(choices?.kinds ?? []).map((k): [string, string] => [k, k])];
  if (draft.of && !of.some(([v]) => v === draft.of)) of.push([draft.of, draft.of]);
  pick(head, word('rules.of'), of, draft.of, (v) => {
    draft.of = v;
    changed();
  });
  head.createSpan({ cls: 'thoughtknot-rule-word', text: word('rules.where') });
  const fields = fieldsFor(draft, choices);
  draft.tests.forEach((_, i) => testRow(find, state, i, fields, rebuild, changed));
  button(
    find,
    word('rules.and'),
    'plus',
    () => {
      draft.tests.push({ field: '', op: 'is', value: '' });
      rebuild();
    },
    word('rules.and'),
  );
}

/** The test as written, out of the way behind a button, for a person who would rather write it. Gives its box. */
export function renderWritten(form: HTMLElement, state: FormState, changed: () => void): HTMLInputElement {
  const wrap = form.createDiv({ cls: 'thoughtknot-rule-written' });
  const inner = form.createEl('label', { cls: 'thoughtknot-rule-field' });
  inner.hidden = true;
  const show = button(
    wrap,
    word('rules.write-own'),
    'code',
    () => {
      inner.hidden = !inner.hidden;
      show.setAttribute('aria-expanded', inner.hidden ? 'false' : 'true');
    },
    word('rules.write-own'),
  );
  show.setAttribute('aria-expanded', 'false');
  wrap.appendChild(inner);
  inner.createSpan({ text: word('rules.when') });
  const when = inner.createEl('input', {
    attr: { name: 'when', type: 'text', placeholder: word('rules.when-example') },
  });
  when.addEventListener('input', () => {
    state.whenTyped = when.value.trim() !== '';
    changed();
  });
  return when;
}

/** One row of samples to pick from, `None` first, the one in `field` pressed. */
function samples(
  parent: HTMLElement,
  label: string,
  field: HTMLInputElement,
  among: readonly string[],
  draw: (b: HTMLElement, v: string) => string,
  changed: () => void,
) {
  const row = parent.createDiv({ cls: 'thoughtknot-rule-picks', attr: { role: 'group', 'aria-label': label } });
  row.createSpan({ cls: 'thoughtknot-rule-word', text: label });
  const all: [HTMLElement, string][] = [];
  for (const v of ['', ...among]) {
    const b = row.createEl('button', { cls: 'thoughtknot-rule-pick', attr: { type: 'button', 'data-value': v } });
    b.setAttribute('aria-label', v ? draw(b, v) : word('rules.none'));
    if (!v) b.setText(word('rules.none'));
    b.addEventListener('click', () => {
      field.value = v;
      for (const [x, w] of all) x.setAttribute('aria-pressed', w === v ? 'true' : 'false');
      changed();
    });
    b.setAttribute('aria-pressed', field.value === v ? 'true' : 'false');
    all.push([b, v]);
  }
}

/** The look step, in `looks`: a row of colours, of badges and of lines, each picked by its sample. */
export function renderLookPicks(looks: HTMLElement, fields: LookFields, changed: () => void): void {
  looks.empty();
  samples(
    looks,
    word('rules.colour'),
    fields.colour,
    STYLE_HUES,
    (b, hue) => {
      b.createSpan({ cls: 'thoughtknot-rule-swatch' }).setCssProps({ '--thoughtknot-swatch': hueColour(hue, 'line') });
      return word(`rules.colour.${hue}` as WordKey);
    },
    changed,
  );
  samples(
    looks,
    word('rules.badge'),
    fields.badge,
    BADGES,
    (b, badge) => {
      b.setText(BADGE_GLYPHS[badge as keyof typeof BADGE_GLYPHS]);
      return word(`rules.badge.${badge}` as WordKey);
    },
    changed,
  );
  samples(
    looks,
    word('rules.line'),
    fields.line,
    LINES,
    (b, line) => {
      b.createSpan({ cls: `thoughtknot-rule-line is-${line}` });
      return word(`rules.line.${line}` as WordKey);
    },
    changed,
  );
}

/** The preview, in `preview`: the first thing found, or a sample, drawn with the look the rule gives. */
export function renderPreview(preview: HTMLElement, rule: RuleWrite, name: string | undefined): void {
  preview.empty();
  preview.createSpan({ cls: 'thoughtknot-rule-word', text: word('rules.preview') });
  const sample = preview.createSpan({
    cls: `thoughtknot-rule-sample is-${rule.line ?? 'solid'}`,
    attr: { 'aria-hidden': 'true' },
  });
  if (rule.colour) sample.setCssProps({ '--thoughtknot-swatch': hueColour(rule.colour, 'line') });
  const glyph = rule.badge ? BADGE_GLYPHS[rule.badge as keyof typeof BADGE_GLYPHS] : undefined;
  if (glyph) sample.createSpan({ cls: 'thoughtknot-rule-glyph', text: glyph });
  sample.appendText(name ?? word('rules.sample'));
  if (rule.means)
    preview.createSpan({ cls: 'thoughtknot-rule-means', text: word('rules.preview-means', { means: rule.means }) });
}
