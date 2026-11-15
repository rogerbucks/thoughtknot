// The names the core's entry exports for reading a picture's metadata and describing it with AI. That is editor spec
// ES§18, image_meta_first and image_describe_auto. Kept apart from index.ts so each file stays short.
export { imageMetadata, metaCovers, type ImageMeta } from './image-metadata.ts';
export {
  IMAGE_INSTRUCTIONS,
  IMAGE_SEND_MOST,
  PICTURE_KINDS,
  describePlan,
  imageBody,
  imageReview,
  readDescription,
  type DescribeInput,
  type DescribePlan,
  type PictureDescription,
} from './ai-image.ts';
export type { AiImages } from './settings-reach.ts';
