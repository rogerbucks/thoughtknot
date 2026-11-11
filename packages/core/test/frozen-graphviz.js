// What Graphviz 16.1.0 gave for each source a test hands it, kept from before it was taken away (layout_own_engine).
// Our own engine lays out every drawing now. A few tests still check our SVG writer and link drawing against
// Graphviz's own answers. So those answers are kept here, one file of them for each test file.
// A source with no kept answer fails at once, naming itself: Graphviz cannot be asked any more. So a test whose source
// changes must check our own engine instead.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { layoutMarks } from '../src/graphviz-marks.ts';

const key = (dot) => createHash('sha256').update(dot).digest('hex').slice(0, 16);

/** Graphviz's kept answers for the test file `name`: its layout as JSON and its SVG, by source. */
export function frozenGraphviz(name) {
  const file = new URL(`fixtures/graphviz/${name}.json.gz`, import.meta.url);
  const kept = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
  const answer = (dot, what) => {
    const a = kept[key(dot)]?.[what];
    if (a === undefined)
      throw new Error(`Graphviz gave no ${what} kept for this source in ${name}: ${dot.slice(0, 80)}`);
    return a;
  };
  const renderJSON = (dot) => answer(dot, 'json');
  const renderString = (dot) => answer(dot, 'svg');
  return {
    version: '16.1.0',
    renderJSON,
    renderString,
    render: renderString,
    marks: (dot) => layoutMarks(renderJSON(dot)),
  };
}
