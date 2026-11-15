// A PNG of an exported SVG (spec §16, export_png_sharp). It is drawn on a canvas at the size the core gives, never less
// than twice natural size, so its text stays sharp. The SVG is self-contained, with fixed colours, so it draws the same here.
// The SVG is given that size itself before it is read, so no engine draws it small and scales it up.
import { word } from '@thoughtknot/core';
import type { PngSize } from '@thoughtknot/core';

/** The most pixels a phone's canvas holds (iOS's limit): a larger PNG is refused before it is drawn, never drawn blank. */
export const PNG_PIXEL_LIMIT = 16_777_216;

/** The SVG with its own width and height set to `size`, so the image is read at the size it is drawn. */
const sized = (svg: string, size: Pick<PngSize, 'width' | 'height'>) =>
  svg.replace(/<svg\b[^>]*>/, (tag) =>
    tag
      .replace(/\swidth="[^"]*"/, '')
      .replace(/\sheight="[^"]*"/, '')
      .replace('<svg', `<svg width="${size.width}" height="${size.height}"`),
  );

/**
 * The PNG's bytes: the SVG drawn on a canvas of `size`; rejects, saying why, whatever stops it — never hangs. With
 * `paper` a JPEG is made instead, drawn on that colour, since a JPEG holds no clear pixels: a PDF holds a JPEG as it is.
 */
export function rasterise(svg: string, size: Pick<PngSize, 'width' | 'height'>, paper?: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = activeDocument;
    const url = URL.createObjectURL(new Blob([sized(svg, size)], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const canvas: HTMLCanvasElement = doc.body.createEl('canvas');
        canvas.remove(); // drawn on off the page, never shown
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error(word('exporting.png-too-large'));
        if (paper) {
          ctx.fillStyle = paper;
          ctx.fillRect(0, 0, size.width, size.height);
        }
        ctx.drawImage(img, 0, 0, size.width, size.height);
        canvas.toBlob(
          (blob) => {
            // the canvas let go at once, PNG or none, so page after page of a large image holds one canvas at a time
            canvas.width = canvas.height = 0;
            if (!blob) return reject(new Error(word('exporting.png-too-large')));
            blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
          },
          paper ? 'image/jpeg' : 'image/png',
          0.92,
        );
      } catch (e) {
        reject(e instanceof Error ? e : new Error(word('exporting.png-failed')));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(word('exporting.png-unreadable')));
    };
    img.src = url;
  });
}
