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
  presetChange,
  floored,
  deviceWins,
  presetFor,
  presetFile,
  presetFrom,
  type ViewChain,
  type ViewPreset,
  type DeviceAsks,
} from './view-presets.ts';
