// The one line beside a drawing that says it was laid out by a cheaper step. Its layout ran out of time (editor spec
// §68, layout_never_text). So a person knows why it looks plainer than usual, and is never shown text
// instead. The step is read from the drawing itself, so only a step actually taken is said. It sits under the legend
// of moving links, and is drawn again with it each time the graph is laid out again. Beside it too is a line for each
// device setting that wins over the view preset (editor spec §69, view_presets_os_wins). Less motion is one.
import { deviceWins, starterOf, word } from '@thoughtknot/core';
import type { DeviceAsks, FlowLink } from '@thoughtknot/core';
import type { ViewOptions } from './view-options.ts';
import { PICK_ATTRIBUTE, pickShownOf } from '../../layouts/fingerprint.ts';
import { renderFlowLegend } from './flow-marks.ts';
import { renderRuleForm } from './rule-form.ts';
import { renderRuleLegend } from './rule-marks.ts';

const PICKED = new RegExp(`<svg\\b[^>]*\\s${PICK_ATTRIBUTE}="([^"]*)"`);

/** The cheaper step the drawing `svg` was laid out by, read from it; undefined where it took none. */
export const stepOf = (svg: string) => pickShownOf(PICKED.exec(svg)?.[1])?.step;

/** What the device asks for, from the window's own media queries (§69, view_presets_os_wins). */
export function deviceAsks(win: Window): DeviceAsks {
  const asks = (q: string) => !!win.matchMedia?.(q)?.matches;
  return {
    reducedMotion: asks('(prefers-reduced-motion: reduce)'),
    moreContrast: asks('(prefers-contrast: more)'),
    forcedColours: asks('(forced-colors: active)'),
  };
}

/**
 * What is said beside the drawing `svg`, in `slot`. First the legend of its moving links (`flow`, less those
 * `folded`). Then a line for each of the device's settings that wins over the view `preset` (view_presets_os_wins).
 * Then the cheaper step it was laid out by, if any.
 */
export function renderBeside(
  slot: HTMLElement,
  flow: readonly FlowLink[],
  folded: readonly number[] = [],
  svg = '',
  preset = 'default',
) {
  renderFlowLegend(slot, flow, folded);
  for (const line of deviceWins(starterOf(preset).chain, deviceAsks(slot.win)).lines)
    slot.createDiv({ cls: 'thoughtknot-device-line', attr: { role: 'status' }, text: line });
  const step = stepOf(svg);
  if (step)
    slot.createDiv({
      cls: 'thoughtknot-layout-step',
      attr: { role: 'status' },
      text: word(`view.layout.step.${step}`),
    });
}

/** What is said beside a card's drawing `svg`, from the card's options `o`: as `renderBeside` says. */
export const renderBesideFor = (slot: HTMLElement, o: ViewOptions, svg: string) => {
  renderBeside(slot, o.motion?.flow ?? [], o.switches?.state.plan?.folded, svg, o.aids?.preset);
  renderRuleLegend(slot, o.rules); // and what its rules' looks mean (§56)
  renderRuleForm(slot, o.ruleAsk); // with a rule to try or save
};
