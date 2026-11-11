// Drawing a layout source by our own engine, from measuring to the SVG (layout_own_engine). Host-free and pure, so a
// page can draw with it as the app does.
import { measuredMarks } from './measure.ts';
import {
  groupsIn,
  keptIn,
  kindsIn,
  lanesIn,
  linesIn,
  optionsIn,
  ownSource,
  ownSvg,
  placedIn,
  stepIn,
} from './own-draw.ts';
import type { LaidMarks } from '../graphviz-marks.ts';

/** What our own engine lays the layout source `dot` out with, its boxes as our own code `measured` them. */
export function ownArgs(dot: string, measured?: LaidMarks): Parameters<typeof ownSvg> {
  // a source written for Graphviz alone is given our engine's lines first
  const src = /\/\/ layout options \{/.test(dot) ? dot : ownSource(dot);
  return [
    measured ?? measuredMarks(src),
    /rankdir=(\w+)/.exec(src)?.[1] ?? 'LR',
    groupsIn(src),
    optionsIn(src),
    kindsIn(src),
    lanesIn(src),
    stepIn(src),
    placedIn(src),
    keptIn(src),
    linesIn(src), // straight or right-angled, as the person chose (untangle_routing)
  ];
}

/** The SVG our own engine draws from the layout source `dot`. */
export const ownDrawn = (dot: string, measured?: LaidMarks): string => ownSvg(...ownArgs(dot, measured));
