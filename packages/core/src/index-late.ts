// The newest names the core's entry exports: the lenses (editor spec §33), and what Wave 10 adds after them. Kept apart
// from index.ts so each file stays short.
export {
  acceptLens,
  lensLibrary,
  lensText,
  proposeLens,
  readyLenses,
  writeLens,
  type LensDraft,
  type LensOrigin,
  type LensProposal,
  type LibraryLens,
} from './lens-library.ts';
export {
  DORMANT_DAYS,
  RECENT_COUNT,
  findLenses,
  lensFreshness,
  recentLenses,
  type LensFreshness,
  type LensRun,
} from './lens-freshness.ts';
// view presets by need (§69)
export {
  STARTERS,
  PRESET_SETTINGS,
  starterOf,
  holdsStill,
  READING_CLASS,
  presetClasses,
  keepsTrail,
  readsPlain,
  markBody,
  shortLabel,
  labelsFor,
  presetChange,
  floored,
  deviceWins,
  presetFor,
  presetFile,
  presetFrom,
  OWN_PRESET,
  adoptOwn,
  presetToShare,
  type ViewChain,
  type ViewPreset,
  type DeviceAsks,
} from './view-presets.ts';
export { presetPreview, presetUndo, type PresetLine } from './view-preset-preview.ts';
export { PRESET_IDS, type PresetChoice } from './style-graph.ts'; // a graph's own preset (§69)
// a view as its six layers, and the Render line that sets its space and painter (§68, layout_concept_layers)
export {
  PAINTERS,
  SPACES,
  paintersFrom,
  renderFor,
  spaceMode,
  type Painter,
  type Render,
  type Space,
} from './render-choice.ts';
export { VIEW_LAYERS, viewLayers, type ViewLayer, type ViewLayers } from './view-layers.ts';
// lenses that bend what any view drew round a focus, flat and in space (§68, projections_all_on, projection_fisheye)
export {
  FISHEYE_PX,
  LENSES,
  bent,
  bentPoints,
  bentSpace,
  fisheye,
  lensOf,
  spaceSeen,
  unbent,
  type Lens,
  type Radial,
} from './lenses.ts';
// what the work/personal boundary builds on (§40, packages/boundary): a setting's rules, a block written back, and
// the explicit grants
export { applyBoundary, type Bounded, type CorporateSetting, type Redaction } from './export-boundary.ts';
export { gqlBlock } from './export-data-gql.ts';
export type { DataInfo, DataLink, DataThing, ExportedData } from './export-data-model.ts';
export { Permissions, readable, type Guarded } from './permissions.ts';
export * from './index-pictures.ts';
