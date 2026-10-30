// A rule's look in the style graph, checked (editor spec §56). It is a Look with a `when` or a `lens`. style-checks.ts
// reads it like any look. Its faults are problems on its line, each with its fix.
import gs from '@thoughtknot/graph-spec';
import type { Problem } from './note-reading.ts';
import { BADGES } from './rule-words.ts';
import type { RawThing, StyledNames } from './style-checks.ts';
import { FORMATS, LINES, STYLE_HUES, orList } from './style-graph.ts';
import type { Look } from './style-graph.ts';
import { reader } from './style-reader.ts';
import { word as say } from './words.ts';

/** That `key` must be one of `among`. */
const mustBe = (key: string, among: readonly string[]) => say('styling.must-be', { key, among: orList(among) });

/**
 * A rule's look, checked (§56). It has a `when` that reads, or names a lens of the graph, not both. It holds in at most
 * one view or path. It may name a kind, or a relationship type for links. It must say what it means, for the legend.
 * It must give more than a colour: a badge or a line (rule_look_not_colour_alone).
 */
export function ruleLookOf(raw: RawThing, names: StyledNames, out: Problem[]): Look | null {
  const r = reader(raw, names, out),
    has = (k: string) => raw.props[k] !== undefined;
  if (has('when') && has('lens')) {
    r.report(say('styling.rule.when-and-lens'), say('styling.remove-one'));
    return null;
  }
  if (has('view') && has('path')) {
    r.report(say('styling.look.view-and-path'), say('styling.remove-one'));
    return null;
  }
  if (has('thing') || has('from') || has('to') || (has('type') && (has('kind') || has('lens')))) {
    r.report(say('styling.rule.target'), say('styling.rule.target.fix'));
    return null;
  }
  const before = out.length,
    look: Look = { at: raw.at };
  const when = r.text('when'),
    lens = r.name('lens', names.lenses, say('styling.what.lens'));
  if (when !== undefined) {
    const wrong = gs.guardProblem(when);
    if (wrong) r.report(say('styling.rule.when-unread', { why: wrong }), say('styling.rule.when-unread.fix'));
  }
  const view = r.text('view'),
    path = r.name('path', names.paths, say('styling.what.path'), say('styling.what.path-id'));
  const kind = r.name('kind', names.kinds, say('styling.what.kind')),
    type = r.name('type', names.types, say('styling.what.type'));
  const colour = r.word('colour', STYLE_HUES, (written) => say('styling.look.colour-unknown', { written }));
  const line = r.word('line', LINES, mustBe('line', LINES)),
    format = r.word('format', FORMATS, mustBe('format', FORMATS)),
    badge = r.word('badge', BADGES, mustBe('badge', BADGES));
  const means = r.text('means');
  if (out.length > before) return null;
  if (!badge && !line) {
    r.missing(say('styling.rule.second-sign'), say('styling.rule.second-sign.fix'));
    return null;
  }
  if (!means) {
    r.missing(say('styling.rule.means'), say('styling.rule.means.fix'));
    return null;
  }
  Object.assign(
    look,
    when !== undefined ? { when } : { lens },
    view !== undefined ? { view } : {},
    path !== undefined ? { path } : {},
    kind !== undefined ? { kind } : {},
    type !== undefined ? { type } : {},
    colour !== undefined ? { colour } : {},
    line ? { line } : {},
    format ? { format } : {},
    badge ? { badge } : {},
    { means },
  );
  return look;
}
