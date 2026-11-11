// Starting the layout engine (ES§1, ES§3, layout_own_engine). It is our own engine, in plain code. So drawing needs no
// network and no WebAssembly on any device. Graphviz is gone. A drawing can also be laid out as marks (spec §43,
// plugin_interface), so a built-in type gives marks as a plug-in does.
import { ownMarks } from './layouts/own-draw.ts';
import { ownArgs, ownDrawn } from './layouts/own-drawn.ts';
import type { LaidMarks } from './graphviz-marks.ts';

/** Starts our own layout engine. Nothing is loaded: it is plain code. */
export async function loadEngine(): Promise<{
  version: string;
  render(source: string): string;
  marks(source: string): LaidMarks;
}> {
  return {
    version: 'thoughtknot',
    render: (source) => ownDrawn(source),
    marks: (source) => ownMarks(...ownArgs(source)),
  };
}
