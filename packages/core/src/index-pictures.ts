// The names the core's entry exports for the picture for readers without ThoughtKnot (editor spec §62). Kept apart
// from index.ts so each file stays short.
export {
  PICTURE_MOST_THINGS,
  notePictures,
  pictureBlocks,
  readerPicture,
  type NotePicturesInput,
  type PictureBlock,
  type PictureDecision,
  type PictureInput,
  type ReaderPicture,
} from './reader-picture.ts';
export {
  PICTURE_ENDING,
  isPictureFile,
  madeByThoughtKnot,
  pictureFileName,
  pictureFingerprint,
  pictureHref,
  pictureLines,
  pictureLinkOf,
  pictureState,
  pictureTarget,
  pictureTexts,
  withPictureLine,
  withoutPictureLines,
  type PictureLineAt,
  type PictureState,
} from './reader-picture-note.ts';
export {
  folderPictures,
  type FolderPicturesInput,
  type FolderPicturesRun,
  type PictureChange,
} from './reader-picture-folder.ts';
export { picturesOnFor, type PictureSettings } from './settings-pictures.ts';
