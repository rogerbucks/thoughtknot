// What the core's entry exports for what a note keeps beside its graph (ES§2, ES§3, ES§19). That is the layout block,
// the two AI reviewers, and writes from Reading view. Kept apart from index.ts so each file stays short.
export {
  forgetPlace,
  layoutOf,
  placeThing,
  readLayout,
  renamePlace,
  writeLayout,
  type Layout,
  type Place as LayoutPlace,
} from './layout-block.ts';
export {
  NO_CONSENT,
  consentOf,
  isPrivate,
  namesSent,
  privateProblem,
  publicPreview,
  reviewerFor,
  type Reviewer,
  type VaultConsent,
} from './ai-reviewers.ts';
export type { AiPublic } from './settings-reach.ts';
export { metaOf, metadataWrite, onlyMetadata, type MetaKind } from './metadata-write.ts';
export { forgetInNote, placeInNote, savedPlaces } from './layout-places.ts';
