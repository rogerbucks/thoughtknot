// The views the plugin adds to Obsidian: the edit pane, the details pane (ES§25), and the Graph view of Bases (ES§20).
import { GraphPane, PANE } from './pane';
import { DETAILS_PANE, DetailsPaneView } from './details-pane';
import { registerBaseView } from './bases/base-view';
import type ThoughtKnotPlugin from './main';

/** Adds each view to Obsidian. The Graph view of Bases is added only where Bases is turned on. */
export function registerViews(plugin: ThoughtKnotPlugin): void {
  plugin.registerView(PANE, (leaf) => new GraphPane(leaf, plugin));
  plugin.registerView(DETAILS_PANE, (leaf) => new DetailsPaneView(leaf)); // a card's details, beside (ES§25)
  registerBaseView(plugin); // the notes a .base file picks, drawn as a graph
}
