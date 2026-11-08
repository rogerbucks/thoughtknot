// What every test of the plugin on the page needs. A graph block fenced as a note writes it. A control found by the
// label it is named by, as a screen reader finds it.

/** A gql block, fenced as a note holds it. */
export const fence = (t) => '```gql\n' + t + '\n```';

/** The button inside `el` named `label`. */
export const labelled = (el, label) =>
  el.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);

/** Type `name`'s button in the side rail's lists (type_rail), or undefined where it is not offered. */
export const typeButton = (el, name) =>
  el.querySelectorAll('.thoughtknot-rail-list button').find((b) => b.textContent === name);

/** The side rail's button for the group holding type `name`. */
export const groupOf = (el, name) => {
  const group = typeButton(el, name)?.parentElement?.parentElement?.getAttribute('data-group');
  return el.querySelectorAll('.thoughtknot-rail-button').find((b) => b.getAttribute('data-group') === group);
};

/** Opens the side rail's list holding type `name`, and taps the type. */
export function pickType(el, name) {
  groupOf(el, name).click();
  typeButton(el, name).click();
}

/** Each type the side rail offers, in its lists' order: its words, whether it can be chosen, and what is said beside it. */
export const railOffered = (el) =>
  el.querySelectorAll('.thoughtknot-rail-list li').map((li) => {
    const b = li.querySelector('button');
    return [b.textContent, !b.disabled, li.querySelector('.thoughtknot-type-why')?.textContent ?? ''];
  });
