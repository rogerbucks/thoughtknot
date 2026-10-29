// The defaults of the View menu's switches (editor spec §25, view_switch_defaults), in the Drawing section of the
// settings page. A graph's View menu starts each as its setting says, and can change it. Whether notes are drawn as
// callouts is here too (§24, note_callouts).
import type { Option, Settings } from './settings.ts';

/** The default of one of the View menu's switches (§25): on or off, in the Drawing section. */
function switchOption(key: keyof Settings, name: string, sentence: string): Option {
  return {
    key,
    section: 'Drawing',
    name,
    sentence,
    choices: [
      { value: 'on', name: 'On' },
      { value: 'off', name: 'Off' },
    ],
  };
}

/** The switches' options, in the order the settings page shows them. */
export const SWITCH_OPTIONS: Option[] = [
  switchOption(
    'labelsByZoom',
    'Hide labels too small to read',
    'Whether a link’s label shows only when zoomed in far enough to read it; a graph’s View menu can change it.',
  ),
  switchOption(
    'foldHubs',
    'Fold busy things',
    'Whether a thing with many links draws them folded into one stub marked with their count; a graph’s View menu can change it.',
  ),
  switchOption(
    'foldGroups',
    'Fold groups',
    'Whether each group draws as one box showing how many things it holds; a graph’s View menu can change it.',
  ),
  switchOption(
    'mergeLinks',
    'Bundle links between groups',
    'Whether links running between the same two groups share one trunk; a graph’s View menu can change it.',
  ),
  switchOption(
    'ownLayout',
    'Lay out with ThoughtKnot',
    'Whether ThoughtKnot lays graphs out itself, the default. Off lays them out with Graphviz, as before.',
  ),
  switchOption(
    'kindLanes',
    'Lanes by kind',
    'Whether kinds that link in order each get a lane, or a plane in space; a graph’s View menu can change it.',
  ),
  switchOption(
    'noteCallouts',
    'Draw notes as callouts',
    'Whether each note written above a thing or link is drawn on the drawing as a callout, joined to its thing by a dashed line. Off unless you turn it on; a note always shows in its thing’s details.',
  ),
];
