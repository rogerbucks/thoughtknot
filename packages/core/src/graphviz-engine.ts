// The Graphviz engine, compiled to WebAssembly (spec §1, §3). No host draws with it any more: our own engine lays out
// every drawing (layout_own_engine, engine.ts). It is kept only so the tests can still check what Graphviz laid out,
// until it is taken away. The one module that imports it.
import { instance } from '@viz-js/viz';
import { layoutMarks } from './graphviz-marks.ts';
import type { LaidMarks } from './graphviz-marks.ts';
import type { GraphvizLayout } from './graphviz-json.ts';

/** Starts the bundled Graphviz engine. */
export async function loadGraphviz(): Promise<{
  version: string;
  render(source: string): string;
  marks(source: string): LaidMarks;
}> {
  const viz = await instance();
  return {
    version: viz.graphvizVersion,
    render: (source) => viz.renderString(source, { format: 'svg' }),
    marks: (source) => layoutMarks(viz.renderJSON(source) as GraphvizLayout),
  };
}
