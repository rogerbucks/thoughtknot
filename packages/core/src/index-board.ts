// The names the core's entry exports for the whiteboard (editor spec §45). A host that keeps a board in a synced note
// needs them. They give one change to a board, who may make it, and the note with it made. They also give the seat of
// a person at a shared board. Kept apart from index.ts so each file stays short.
export { boardBlockIn, boardEditInNote } from './board-edit.ts';
export type { BoardChange } from './board-edit.ts';
export { arrangerOf } from './board-arrange.ts';
export { viewerOf } from './view-types/board-views.ts';
export { starterBoard, withStarter } from './board-starter.ts';
export { openingBoard } from './board-first.ts';
export { boardMakeAsk } from './view-types/board-ask.ts';
export { layersOver } from './sketch-board-layers.ts';
export { accessRefused, mayChange } from './board-access.ts';
export type { BoardRole } from './board-access.ts';
export type { Here, Together } from './board-together.ts';
export type { Peer } from './board-presence.ts';
export { boardFileBlock, boardFilesOf, boardFormatOf } from './board-exchange.ts';
export type { BoardBlock, BoardFile, BoardFormat } from './board-exchange.ts';
export { deckBlock, deckBoard, isPresentationPlace, pptxBlock, pptxBoard } from './board-pptx.ts';
export type { KeepPicture, KeptPicture, PptxBoard } from './board-pptx.ts';
export { pptxSlides } from './pptx-read.ts';
export type { PptxRead, PptxRefusal } from './pptx-read.ts';
export {
  PICTURE_BODY_LIMIT,
  PICTURE_FOLDER,
  PICTURE_MOST_BYTES,
  isKeptName,
  pictureKind,
  pictureName,
  pictureStem,
} from './picture-keep.ts';
export type { PictureEnding, PictureKind } from './picture-keep.ts';
export { BOARD_PICTURE_FORMATS, boardPicturesOf, pictureSize, slidePicturesOf } from './board-pictures.ts';
export type { BoardPicture, BoardPictureFormat } from './board-pictures.ts';
export { picturesPdf } from './board-pdf.ts';
export type { PdfPage } from './board-pdf.ts';
