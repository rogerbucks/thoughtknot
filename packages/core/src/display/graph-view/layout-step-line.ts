// The one line beside a drawing that says it was laid out by a cheaper step. Its layout ran out of time (editor spec
// §68, layout_never_text). So a person knows why it looks plainer than usual, and is never shown text
// instead. The step is read from the drawing itself, so only a step actually taken is said. It sits under the legend
// of moving links, and is drawn again with it each time the graph is laid out again.
import { word } from '@thoughtknot/core';
import type { FlowLink } from '@thoughtknot/core';
import { PICK_ATTRIBUTE, pickShownOf } from '../../layouts/fingerprint.ts';
import { renderFlowLegend } from './flow-marks.ts';

const PICKED = new RegExp(`<svg\\b[^>]*\\s${PICK_ATTRIBUTE}="([^"]*)"`);

/** The cheaper step the drawing `svg` was laid out by, read from it; undefined where it took none. */
export const stepOf = (svg: string) => pickShownOf(PICKED.exec(svg)?.[1])?.step;

/**
 * What is said beside the drawing `svg`, in `slot`. First the legend of its moving links (`flow`, less those
 * `folded`). Then the cheaper step it was laid out by, if any.
 */
export function renderBeside(slot: HTMLElement, flow: readonly FlowLink[], folded: readonly number[] = [], svg = '') {
  renderFlowLegend(slot, flow, folded);
  const step = stepOf(svg);
  if (step)
    slot.createDiv({
      cls: 'thoughtknot-layout-step',
      attr: { role: 'status' },
      text: word(`view.layout.step.${step}`),
    });
}
