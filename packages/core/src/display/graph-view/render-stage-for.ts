// Which cards the new rendering's stage draws (editor spec §73, render_switch, render_every_type). A card gets one when
// the setting is on, its graph has levels to show, and its diagram type is one the stage draws.
import type { ViewOptions } from './view-options.ts';
import { hasLevels, stageKind } from './stage-look.ts';
import type { Seen } from './stage-morph.ts';
import { RenderStage } from './render-stage.ts';
import type { StageHands } from './stage-hands.ts';

/** The stage for a card, when its setting is on and its graph has levels to show and its type is one the stage draws. */
export function stageFor(
  viewport: HTMLElement,
  o: Pick<ViewOptions, 'aids' | 'reading' | 'graph' | 'places' | 'diagram'>,
  hands?: StageHands,
  seen?: Seen,
): RenderStage | null {
  const drawing = o.reading.graphs.get(o.graph),
    g = o.reading.world[o.graph];
  const kind = stageKind(o.diagram); // only the network's places are dragged and saved
  if (!o.aids?.newRendering || !drawing || !hasLevels(drawing, g) || !kind) return null;
  return new RenderStage(
    viewport,
    drawing,
    g,
    hands,
    o.aids.miniMap,
    kind === 'network' ? o.places : undefined,
    kind,
    seen,
  );
}
