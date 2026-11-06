// The look: part of layer L4 of the rendering spec (wiki/Rendering-spec.md; editor spec §73, render_look_in_marks). Every colour
// the new rendering paints comes from here, so the look lives in one place. Subjects take the approved mockups'
// colours, light and dark. Their areas and topics take nearby shades, so a range reads as one family (Roger, 3 Nov).
// Host-free and pure.

/** A colour as red, green and blue, 0 to 255. */
export type Rgb = [number, number, number];

/** The look of one theme: the subject colours in order, the ink, the paper and a faint line. */
export interface Look {
  subjects: string[];
  ink: string;
  paper: string;
  faint: string;
}

/** The mockups' look in a light theme. */
export const LIGHT: Look = {
  subjects: ['#4b7bf5', '#f2793a', '#2fb37a', '#e0518f', '#1aa3b8', '#c79a1c', '#8a63e8'],
  ink: '#18202c',
  paper: '#f6f8fc',
  faint: '#d5dbe6',
};

/** The mockups' look in a dark theme. */
export const DARK: Look = {
  subjects: ['#7aa2ff', '#ff9a5e', '#4fd69a', '#ff7fb2', '#4fd3e6', '#f0c64a', '#a98bff'],
  ink: '#eef2f8',
  paper: '#11151d',
  faint: '#2a3242',
};

/** `hex` as red, green and blue. */
export function rgbOf(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `rgb` as a hex colour. */
export const hexOf = (rgb: Rgb): string =>
  '#' +
  rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

/** The colour of the subject at `index`: the look's colours in turn, then the same again. */
export const subjectColour = (look: Look, index: number): string =>
  look.subjects[index % look.subjects.length] as string;

/**
 * A shade of `base` for the child at `index` of `count`, one level down. Shades move toward the paper and back in
 * small steps, so siblings differ but stay in their parent's range.
 */
export function shadeOf(base: string, index: number, count: number, look: Look): string {
  if (count <= 1) return base;
  const t = (index / (count - 1) - 0.5) * 0.36;
  const [from, to] = [rgbOf(base), rgbOf(t > 0 ? look.paper : look.ink)];
  const k = Math.abs(t);
  return hexOf(from.map((c, i) => c + ((to[i] as number) - c) * k) as Rgb);
}

/** How bright `hex` looks, 0 to 1, as WCAG reckons it. */
export function luminance(hex: string): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgbOf(hex).map(lin) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Black or white, whichever reads better on `fill`. */
export const inkOn = (fill: string): string =>
  contrast(fill, '#000000') >= contrast(fill, '#ffffff') ? '#000000' : '#ffffff';
