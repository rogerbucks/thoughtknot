// Adding or changing a rule from the card (editor spec §56, rule_look_try_save). Beside the rules' legend is a Rule
// button. It opens a short form: the test each thing must pass, a badge, a line and what the rule means. A rule with
// the meaning of one already written changes it.
//
// In reading view the rule is only tried: the card draws it at once, says it is not saved, and offers Back to saved.
// The note is left byte for byte as it was. Where the note is edited the rule is saved in the style graph instead.
// The host does each (`RuleAsk`). A rule that cannot be read says why under the form, and nothing is tried or saved.
import { BADGES, BADGE_GLYPHS, LINES, ruleRefusal, word } from '@thoughtknot/core';
import type { RuleAsk, RuleWrite } from '@thoughtknot/core';
import { button } from '../button.ts';
import { readOnlyHere } from './placement.ts';

/** A labelled field of the form: its words, then the input or list. */
function field<K extends 'input' | 'select'>(form: HTMLElement, tag: K, name: string, text: string) {
  const label = form.createEl('label', { cls: 'thoughtknot-rule-field' });
  label.createSpan({ text });
  return label.createEl(tag, { attr: { name } });
}

/** A list to choose from: none first, then each of `among`, shown as `shown` says. */
function choices<T extends string>(select: HTMLSelectElement, among: readonly T[], shown: (v: T) => string) {
  select.createEl('option', { value: '', text: word('rules.none') });
  for (const v of among) select.createEl('option', { value: v, text: shown(v) });
}

/** The form's field named `name`. */
const fieldOf = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);

/** The rule the form holds, the fields left empty left out. */
function ruleOf(form: HTMLElement): RuleWrite {
  const value = (name: string) => fieldOf(form, name)?.value.trim() ?? '';
  const given = (name: string) => value(name) || undefined;
  const rule: RuleWrite = { means: value('means') };
  for (const [k, v] of [
    ['when', given('when')],
    ['badge', given('badge')],
    ['line', given('line')],
  ] as const)
    if (v !== undefined) rule[k] = v;
  return rule;
}

/**
 * The Rule button and its form, at the end of `slot`, beside the rules' legend. In reading view a rule is tried, and
 * where the note is edited it is saved, as `ask` does each. While a rule is tried, it says so and offers Back to saved.
 */
export function renderRuleForm(slot: HTMLElement, ask: RuleAsk | undefined): void {
  if (!ask) return;
  const box = slot.createDiv({ cls: 'thoughtknot-rule-maker' });
  if (ask.tried) {
    box.createDiv({ cls: 'thoughtknot-rule-tried', attr: { role: 'status' }, text: word('type.tried') });
    button(box, word('type.back'), 'undo-2', () => ask.back(), word('type.back'));
  }
  const form = box.createEl('form', { cls: 'thoughtknot-rule-form', attr: { 'aria-label': word('rules.form') } });
  form.hidden = true;
  const open = button(
    box,
    word('rules.add'),
    'plus',
    () => {
      form.hidden = !form.hidden;
      open.setAttribute('aria-expanded', form.hidden ? 'false' : 'true');
      if (form.hidden) return;
      // tried in reading view, saved where the note is edited: asked where the card is now
      submit.setText(word(readOnlyHere(box) ? 'rules.try' : 'rules.save'));
      fieldOf(form, 'when')?.focus();
    },
    word('rules.add'),
  );
  open.setAttribute('aria-expanded', 'false');
  box.insertBefore(open, form);
  field(form, 'input', 'when', word('rules.when')).setAttribute('placeholder', word('rules.when-example'));
  choices(
    field(form, 'select', 'badge', word('rules.badge')),
    BADGES,
    (b) => `${BADGE_GLYPHS[b]} ${word(`rules.badge.${b}`)}`,
  );
  choices(field(form, 'select', 'line', word('rules.line')), LINES, (l) => word(`rules.line.${l}`));
  field(form, 'input', 'means', word('rules.means'));
  const refused = form.createDiv({ cls: 'thoughtknot-rule-refused', attr: { role: 'alert' } });
  const submit = form.createEl('button', { attr: { type: 'submit' } });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const rule = ruleOf(form),
      why = ruleRefusal(rule);
    refused.setText(why ?? '');
    if (why) return;
    if (readOnlyHere(box)) ask.tryOut(rule);
    else ask.save(rule);
  });
}
