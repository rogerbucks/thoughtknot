// The names the core's entry exports for what a note keeps beside its graph (editor spec §2, §3, §19): the layout
// block, the two AI reviewers, and writes from Reading view. Kept apart from index.ts so each file stays short.
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
  isPrivate,
  privateProblem,
  reviewerFor,
  type Reviewer,
  type VaultConsent,
} from './ai-reviewers.ts';
export { metaOf, metadataWrite, onlyMetadata, type MetaKind } from './metadata-write.ts';
