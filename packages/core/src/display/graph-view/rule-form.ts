// Highlighting things by a rule, from the card (editor spec §56, rule_look_try_save and rule_look_builder). Beside the
// rules' legend is a Highlight things button. It opens a short form in three steps, each in plain words:
// 1. Find: things of a kind, or links of a type, where a property is (or is more than, and so on) a value. Each list
//    is filled from the graph itself, and what the rule finds is counted and named as it is built.
// 2. Show them with: a colour, a badge and a line, each picked from samples, and a preview of one thing found.
// 3. Call it: the name in the legend, written from the test until a person writes their own.
// Quick starts from the graph's own data fill all three at once, and each rule saved can be opened to change it. A
// person who knows the test language may still write the test themselves.
//
// In reading view the rule is only tried: the card draws it at once, says it is not saved, and offers Back to saved.
// The form opens again on the rule tried, so it can be changed and tried again. The note is left byte for byte as it
// was. Where the note is edited the rule is saved in the style graph instead. The host does each (`RuleAsk`). A rule
// that cannot be read says why under the form, and nothing is tried or saved.
//
// Each rule saved has a bin beside it, to take it out (rule_look_remove). Where the note is edited it is taken out of
// the style graph, and the card says so with one Undo. In reading view it is only tried as gone, as any change is.
import { BADGE_GLYPHS, hueColour, ruleRefusal, ruleStarts, sayDraft, testsOf, whenOf, word } from '@thoughtknot/core';
import type { WordKey, RuleAsk, RuleChoices, RuleDraft, RuleStart, RuleWrite } from '@thoughtknot/core';
import { button } from '../button.ts';
import { readOnlyHere } from './placement.ts';
import { renderDescribe } from './rule-describe-box.ts';
import { renderFind, renderLookPicks, renderPreview, renderWritten } from './rule-form-parts.ts';
import type { FormState } from './rule-form-parts.ts';

/** The form's hidden or typed field named `name`. */
const fieldOf = (form: HTMLElement, name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`);

/** The rule the form holds, the fields left empty left out. */
function ruleOf(form: HTMLElement, view?: string): RuleWrite {
  const value = (name: string) => fieldOf(form, name)?.value.trim() ?? '';
  const rule: RuleWrite = { means: value('means') };
  for (const k of ['when', 'kind', 'type', 'colour', 'badge', 'line', 'was'] as const) if (value(k)) rule[k] = value(k);
  if (view !== undefined) rule.view = view;
  if (value('off') === 'true') rule.off = true; // a rule turned off stays off as it is changed
  return rule;
}

/** A field the builder writes and the rule is read from, with no box of its own. */
const hidden = (form: HTMLElement, name: string, value = '') =>
  form.createEl('input', { attr: { type: 'hidden', name, value } });

/** The draft a rule written before is built from: its kind or type, and its tests, if simple enough to read back. */
function draftOf(rule: RuleWrite): RuleDraft {
  const on = rule.type ? 'links' : 'things';
  return { on, of: rule.type ?? rule.kind ?? '', tests: (rule.when && testsOf(rule.when)) || [] };
}

/** A quick start as a whole rule: its test, its kind, its look and its name. */
function startRule(s: RuleStart, choices: RuleChoices | undefined): RuleWrite {
  const of = s.draft.of ? (s.draft.on === 'links' ? { type: s.draft.of } : { kind: s.draft.of }) : {};
  return { when: whenOf(s.draft, choices), ...of, colour: s.colour, badge: s.badge, means: s.means };
}

/** A chip that fills the form with `rule`: its badge in its colour, then its name. */
function chip(parent: HTMLElement, rule: RuleWrite, label: string, load: (r: RuleWrite) => void) {
  const b = parent.createEl('button', { cls: 'thoughtknot-rule-chip', attr: { type: 'button', 'aria-label': label } });
  const glyph = rule.badge ? BADGE_GLYPHS[rule.badge as keyof typeof BADGE_GLYPHS] : undefined;
  const sign = b.createSpan({ cls: 'thoughtknot-rule-glyph', text: glyph ?? '', attr: { 'aria-hidden': 'true' } });
  if (rule.colour) sign.setCssProps({ color: hueColour(rule.colour, 'line') });
  b.appendText(rule.means);
  b.addEventListener('click', () => load(rule));
}

/** The hidden fields filled from a rule: its look, the meaning it had, and whether it is off. */
function fillFields(fields: Record<'colour' | 'badge' | 'line' | 'was' | 'off', HTMLInputElement>, rule: RuleWrite) {
  fields.colour.value = rule.colour ?? '';
  fields.badge.value = rule.badge ?? '';
  fields.line.value = rule.line ?? '';
  fields.was.value = rule.was ?? '';
  fields.off.value = rule.off ? 'true' : '';
}

/** A small step heading of the form. */
const step = (form: HTMLElement, key: WordKey) => form.createDiv({ cls: 'thoughtknot-rule-step', text: word(key) });

/** The fields and parts of the form, in the order a person reads them: quick starts, then the three steps. */
function formParts(form: HTMLElement) {
  const fields = {
    kind: hidden(form, 'kind'),
    type: hidden(form, 'type'),
    colour: hidden(form, 'colour', 'red'),
    badge: hidden(form, 'badge', 'flag'),
    line: hidden(form, 'line'),
    was: hidden(form, 'was'),
    off: hidden(form, 'off'),
  };
  const starts = form.createDiv({ cls: 'thoughtknot-rule-starts' });
  const describe = form.createDiv({ cls: 'thoughtknot-rule-describe' });
  step(form, 'rules.step.find');
  const find = form.createDiv({ cls: 'thoughtknot-rule-find' });
  const written = form.createDiv();
  const found = form.createDiv({ cls: 'thoughtknot-rule-found', attr: { role: 'status', 'aria-live': 'polite' } });
  step(form, 'rules.step.show');
  const looks = form.createDiv({ cls: 'thoughtknot-rule-looks' });
  const preview = form.createDiv({ cls: 'thoughtknot-rule-preview' });
  step(form, 'rules.step.name');
  const means = form.createEl('label', { cls: 'thoughtknot-rule-field' }).createEl('input', {
    attr: { name: 'means', type: 'text', placeholder: word('rules.means-hint') },
  });
  const refused = form.createDiv({ cls: 'thoughtknot-rule-refused', attr: { role: 'alert' } });
  const actions = form.createDiv({ cls: 'thoughtknot-rule-actions' });
  const submit = actions.createEl('button', { cls: 'mod-cta', attr: { type: 'submit' } });
  return { fields, starts, describe, find, written, found, looks, preview, means, refused, actions, submit };
}

/** Says what the rule finds as it is built: how many and which, nothing yet, or what to pick first. */
function sayFound(found: HTMLElement, rule: RuleWrite, finds: { count: number; names: string[] } | undefined) {
  found.setText(
    !rule.when
      ? word('rules.finds-start')
      : !finds
        ? ''
        : finds.count
          ? word('rules.finds', { count: finds.count, names: finds.names.join(', ') })
          : word('rules.finds-none'),
  );
  found.toggleClass('is-empty', !!rule.when && finds?.count === 0);
}

/** What may be done with a rule saved, from its row: open it, copy it, move it up and take it out. */
interface SavedActs {
  load: (r: RuleWrite) => void;
  remove: (r: RuleWrite) => void;
  moveUp?: (r: RuleWrite) => void;
  /** Turns a rule saved off, or on again (rule_look_off). */
  flip: (r: RuleWrite) => void;
}

/**
 * The quick starts from the graph's own data, then each rule saved: each a chip that fills the form. Beside each rule
 * saved are buttons to copy it as a new rule, move it up, and take it out (rule_look_remove).
 */
function renderStarts(starts: HTMLElement, ask: RuleAsk, acts: SavedActs) {
  const choices = ask.choices,
    { load } = acts;
  const starting = choices ? ruleStarts(choices) : [];
  if (starting.length) starts.createSpan({ cls: 'thoughtknot-rule-step', text: word('rules.starts') });
  for (const s of starting) chip(starts, startRule(s, choices), s.means, load);
  starts.createSpan({ cls: 'thoughtknot-rule-step', text: word('rules.yours') });
  if (!ask.saved?.length) starts.createSpan({ cls: 'thoughtknot-rule-word', text: word('rules.yours-none') });
  (ask.saved ?? []).forEach((r, i) => {
    const mine = starts.createSpan({ cls: 'thoughtknot-rule-mine' }),
      means = r.means;
    mine.toggleClass('is-off', !!r.off);
    const flip = button(
      mine,
      word(r.off ? 'rules.turn-on' : 'rules.turn-off', { means }),
      r.off ? 'eye-off' : 'eye',
      () => acts.flip(r),
    );
    flip.setAttribute('aria-pressed', r.off ? 'false' : 'true');
    // opened to change, a rule keeps the meaning it had, so renaming it changes it in place
    chip(mine, { ...r, was: means }, word('rules.change', { means }), load);
    button(mine, word('rules.copy', { means }), 'copy', () => load({ ...r, means: word('rules.copy-of', { means }) }));
    const up = acts.moveUp;
    if (up && i > 0) button(mine, word('rules.move-up', { means }), 'chevron-up', () => up(r));
    button(mine, word('rules.remove', { means }), 'trash-2', () => acts.remove(r));
  });
}

/**
 * What a rule saved may do where the card is. In reading view it is only tried as taken out, and Back to saved puts it
 * back, and nothing is moved. Where the note is edited it is taken out, or moved up.
 */
function savedActs(box: HTMLElement, ask: RuleAsk, load: (r: RuleWrite) => void): SavedActs {
  const reading = readOnlyHere(box);
  return {
    load,
    remove: (r) => (reading ? ask.tryOut({ ...r, removed: true }) : ask.remove?.(r)),
    // turned off or on: tried in reading view, saved in place where the note is edited
    flip: (r) => {
      const { off, ...on } = r,
        next: RuleWrite = off ? on : { ...on, off: true };
      if (reading) ask.tryOut(next);
      else ask.save({ ...next, was: r.means });
    },
    ...(reading || !ask.moveUp ? {} : { moveUp: (r: RuleWrite) => ask.moveUp?.(r) }),
  };
}

/**
 * What the card says above the form. A rule only tried says so, with Back to saved. A rule just taken out says so,
 * with one Undo to put it back.
 */
function renderStatus(box: HTMLElement, ask: RuleAsk) {
  if (ask.tried) {
    box.createDiv({ cls: 'thoughtknot-rule-tried', attr: { role: 'status' }, text: word('type.tried') });
    button(box, word('type.back'), 'undo-2', () => ask.back(), word('type.back'));
  }
  const means = ask.removed;
  if (means === undefined) return;
  box.createDiv({ cls: 'thoughtknot-rule-tried', attr: { role: 'status' }, text: word('rules.removed', { means }) });
  button(box, word('rules.undo-said', { means }), 'undo-2', () => ask.undo?.(), word('rules.undo'));
}

/**
 * The Highlight things button and its form, at the end of `slot`, beside the rules' legend. In reading view a rule is
 * tried, and where the note is edited it is saved, as `ask` does each. While a rule is tried, it says so, offers Back
 * to saved, and opens the form again on the rule tried.
 */
export function renderRuleForm(slot: HTMLElement, ask: RuleAsk | undefined): void {
  if (!ask) return;
  const box = slot.createDiv({ cls: 'thoughtknot-rule-maker' });
  renderStatus(box, ask);
  const form = box.createEl('form', { cls: 'thoughtknot-rule-form', attr: { 'aria-label': word('rules.form') } });
  form.hidden = true;
  const state: FormState = {
    draft: { on: 'things', of: '', tests: [{ field: '', op: 'is', value: '' }] },
    meansTyped: false,
    whenTyped: false,
  };
  let view: string | undefined;
  const { fields, starts, describe, find, written, found, looks, preview, means, refused, actions, submit } =
    formParts(form);
  const when = renderWritten(written, state, () => refresh());
  means.addEventListener('input', () => {
    state.meansTyped = means.value.trim() !== '';
    refresh();
  });
  button(actions, word('rules.close'), 'x', () => toggle(false), word('rules.close'));

  /** Writes the draft into the fields, names it if no one has, and says what it finds and how it looks. */
  function refresh(rebuild = false) {
    const { draft } = state;
    if (rebuild)
      renderFind(find, state, ask?.choices, () => {
        state.whenTyped = false; // a test picked from the lists wins over one written
        refresh();
      });
    if (!state.whenTyped) when.value = whenOf(draft, ask?.choices);
    fields.kind.value = draft.on === 'things' ? draft.of : '';
    fields.type.value = draft.on === 'links' ? draft.of : '';
    if (!state.meansTyped) means.value = sayDraft(draft);
    const rule = ruleOf(form, view),
      finds = ask?.finds?.(rule);
    sayFound(found, rule, finds);
    renderPreview(preview, rule, finds?.names[0]);
    refused.setText('');
  }

  /** Fills the whole form from a rule: a quick start, a rule saved, or the rule last tried. */
  function load(rule: RuleWrite) {
    state.draft = draftOf(rule);
    if (!state.draft.tests.length) state.draft.tests = [{ field: '', op: 'is', value: '' }];
    // a test the builder cannot read back is kept as written, in the box for writing it
    state.whenTyped = !!rule.when && !testsOf(rule.when);
    when.value = rule.when ?? '';
    fillFields(fields, rule);
    means.value = rule.means;
    state.meansTyped = rule.means.trim() !== '' && rule.means !== sayDraft(state.draft);
    view = rule.view;
    renderLookPicks(looks, fields, () => refresh());
    refresh(true);
  }

  // the lists, filled from the graph, are made the first time the form opens, so a closed card holds none of them
  let built = false;
  function build() {
    if (built) return;
    built = true;
    if (ask) renderStarts(starts, ask, savedActs(box, ask, load));
    if (ask) renderDescribe(describe, ask, load); // an AI fills the form; the person still tries or saves it
    renderLookPicks(looks, fields, () => refresh());
    refresh(true);
  }

  function toggle(show: boolean) {
    form.hidden = !show;
    open.setAttribute('aria-expanded', show ? 'true' : 'false');
    if (!show) return;
    build();
    // tried in reading view, saved where the note is edited: asked where the card is now
    submit.setText(word(readOnlyHere(box) ? 'rules.try' : 'rules.save'));
    form.querySelector<HTMLElement>('select')?.focus();
  }
  const open = button(box, word('rules.form'), 'circle-dot', () => toggle(!!form.hidden), word('rules.add'));
  open.setAttribute('aria-expanded', 'false');
  box.insertBefore(open, form);
  if (ask.tried || ask.removed !== undefined) {
    build();
    if (ask.last) load(ask.last); // back where the person was: the rule just tried, open to change
    toggle(true);
  }
  // Escape closes the form, back on the button that opened it
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    toggle(false);
    open.focus();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const rule = ruleOf(form, view),
      why = ruleRefusal(rule);
    refused.setText(why ?? '');
    if (why) return;
    if (readOnlyHere(box)) ask.tryOut(rule);
    else ask.save(rule);
  });
}
