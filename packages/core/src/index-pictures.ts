// The names the core's entry exports for the picture for readers without ThoughtKnot (editor spec §62). Kept apart
// from index.ts so each file stays short.
export {
  PICTURE_MOST_THINGS,
  readerPicture,
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
  pictureState,
  pictureTarget,
  pictureTexts,
  withPictureLine,
  withoutPictureLines,
  type PictureLineAt,
  type PictureState,
} from './reader-picture-note.ts';
