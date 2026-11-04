// A colour as numbers, for a painter on the graphics chip (editor spec §53, scale_gpu_painters). The graphics chip
// takes a colour as four numbers from 0 to 1. A 2D canvas writes back any colour it is given in one of three plain
// forms:
// - six or eight hex digits;
// - the red, green and blue numbers from 0 to 255, with how opaque;
// - `color(srgb …)`, the same numbers from 0 to 1. Chrome writes a colour a theme mixes (`color-mix`) this way, as
//   Obsidian's link colours are. Without it, those links were painted clear (Roger, 23 Oct 2026).
// A newer browser also writes back the wider forms a theme may use or mix in: `oklab(…)`, `oklch(…)`, `lab(…)`,
// `lch(…)` and `color(display-p3 …)` or `color(srgb-linear …)`. Unread, a ball in one of them was painted black
// (Roger, 1 Nov 2026: "colours are coming through wrong on some 3d views"). Each is turned into red, green and blue.
// Host-free and pure.

/** A colour as four numbers from 0 to 1: red, green, blue and how opaque. */
export type Rgba = [number, number, number, number];

/** A number kept from 0 to 1; one that is not a number is 0. */
const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** A colour, as a 2D canvas writes it back, as four numbers; clear when it is in neither form. */
export function rgbaOf(written: string): Rgba {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(written);
  if (hex) {
    const n = parseInt(hex[1] ?? '0', 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, hex[2] ? parseInt(hex[2], 16) / 255 : 1];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(written);
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255, Number(rgb[4] ?? 1)];
  const srgb = /^color\(srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.e+-]+))?\s*\)$/.exec(written);
  if (srgb) return [Number(srgb[1]), Number(srgb[2]), Number(srgb[3]), Number(srgb[4] ?? 1)].map(clamp) as Rgba;
  return wideOf(written) ?? [0, 0, 0, 0];
}

/** A number of a colour as written: `none` is 0, and a share in `%` is of `whole`. */
const numberOf = (n: string, whole: number) =>
  n === 'none' ? 0 : n.endsWith('%') ? (parseFloat(n) / 100) * whole : parseFloat(n);

/** Red, green and blue without the screen's curve, as the screen shows them: with it, kept from 0 to 1. */
const shown = (v: number) => clamp(v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
/** One of red, green or blue as the screen shows it, without its curve. */
const unshown = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

/** An OKLab colour, as red, green and blue without the screen's curve. */
function fromOklab(l: number, a: number, b: number): [number, number, number] {
  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    middle = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * middle + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * middle - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * middle + 1.707614701 * short,
  ];
}

/** A CIE Lab colour, seen in the light of D50 as CSS has it, as red, green and blue without the screen's curve. */
function fromLab(l: number, a: number, b: number): [number, number, number] {
  const fy = (l + 16) / 116,
    f = (t: number) => (t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29));
  const [x, y, z] = [0.96422 * f(fy + a / 500), f(fy), 0.82521 * f(fy - b / 200)];
  return [
    3.1341359569958707 * x - 1.6173863321612538 * y - 0.4906619460083532 * z,
    -0.978795502912089 * x + 1.916254567259524 * y + 0.03344273116131949 * z,
    0.07195537988411677 * x - 0.2289768264158322 * y + 1.405386058324125 * z,
  ];
}

/** Display P3's red, green and blue, without their curve, as sRGB's. */
const fromP3 = (r: number, g: number, b: number): [number, number, number] => [
  1.2249401 * r - 0.2249404 * g,
  -0.0420569 * r + 1.0420571 * g,
  -0.0196376 * r - 0.0786361 * g + 1.0982735 * b,
];

/** A colour in one of the wider forms a browser writes back, as four numbers; null when it is in none of them. */
function wideOf(written: string): Rgba | null {
  const m =
    /^(oklab|oklch|lab|lch|color)\(\s*(?:(display-p3|srgb-linear)\s+)?([^)/]+?)\s*(?:\/\s*([\d.e+-]+%?)\s*)?\)$/.exec(
      written,
    );
  if (!m) return null;
  const [, form, space, body = '', alpha] = m;
  const parts = body.split(/\s+/);
  if (parts.length !== 3 || (form === 'color') !== (space !== undefined)) return null;
  const [p, q, r] = parts as [string, string, string];
  const hue = (h: string) => (numberOf(h.replace(/deg$/, ''), 360) * Math.PI) / 180;
  let linear: [number, number, number];
  if (form === 'oklab') linear = fromOklab(numberOf(p, 1), numberOf(q, 0.4), numberOf(r, 0.4));
  else if (form === 'oklch')
    linear = fromOklab(numberOf(p, 1), numberOf(q, 0.4) * Math.cos(hue(r)), numberOf(q, 0.4) * Math.sin(hue(r)));
  else if (form === 'lab') linear = fromLab(numberOf(p, 100), numberOf(q, 125), numberOf(r, 125));
  else if (form === 'lch')
    linear = fromLab(numberOf(p, 100), numberOf(q, 150) * Math.cos(hue(r)), numberOf(q, 150) * Math.sin(hue(r)));
  else {
    const rgb = [p, q, r].map((n) => numberOf(n, 1)) as [number, number, number];
    linear = space === 'srgb-linear' ? rgb : fromP3(...(rgb.map(unshown) as [number, number, number]));
  }
  const numbers = [...linear.map(shown), clamp(alpha === undefined ? 1 : numberOf(alpha, 1))];
  return numbers.some((n) => !Number.isFinite(n)) ? null : (numbers as Rgba);
}

/** How opaque the 3D view paints a thing the focus fades (focus_space): a third, so what is brought forward stands out. */
export const FADED = 0.3;

/** A colour, as a browser computes it, painted at `alpha` of how opaque it was, as `rgb(r g b / a)`. */
export function seeThrough(written: string, alpha: number): string {
  const [r, g, b, a] = rgbaOf(written).map((n, i) => (i < 3 ? Math.round(n * 255) : n));
  return `rgb(${r} ${g} ${b} / ${+((a ?? 0) * alpha).toFixed(3)})`;
}

/** `fill`, `alpha` of it seen over `behind`, as one solid colour; see-through where nothing is painted behind. */
export function solidOver(fill: string, alpha: number, behind: Rgba): string {
  if (!(alpha < 1)) return fill;
  if (!behind[3]) return seeThrough(fill, alpha);
  const f = rgbaOf(fill),
    mix = (i: number) => Math.round(255 * ((f[i] ?? 0) * alpha + (behind[i] ?? 0) * (1 - alpha)));
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

/** How opaque a fill must be to be painted as a thing's colour in 3D, rather than its outline's. */
export const SEEN_FILL = 0.1;

/**
 * A thing's colour as the 3D view paints it, solid: its fill, or its outline's colour when the fill is too faint to see.
 * Every painter fills so. The 2D canvas painter once painted the faint fill as it was, so balls were black on a dark
 * page (Roger, 4 Nov 2026: "Black balls ... on mac").
 */
export const solidFill = (fill: Rgba, line: Rgba): Rgba => (fill[3] < SEEN_FILL ? line : fill);

/** `solidFill` as a colour a 2D canvas paints with. */
export function solidCss(fill: Rgba, line: Rgba): string {
  const [r, g, b] = solidFill(fill, line).map((n) => Math.round(n * 255));
  return `rgb(${r}, ${g}, ${b})`;
}

/** How light a colour looks, from 0 (black) to 1 (white). */
const lightness = ([r, g, b]: Rgba) => 0.2126 * unshown(r) + 0.7152 * unshown(g) + 0.0722 * unshown(b);
/** The lightness halfway between black and white, as the eye sees it. */
const MIDDLE = 0.18;

/**
 * The colour round words in `ink`, so they read: `behind`, the page behind them, unless it is unknown or as light as the
 * ink. Then black or white, whichever the ink stands out on. Before, a page with no painted colour gave white round light
 * words on a phone (Roger, 4 Nov 2026: "light background and light text").
 */
export function haloFor(behind: string, ink: string): string {
  const b = rgbaOf(behind),
    i = rgbaOf(ink);
  if (!i[3]) return behind;
  const light = lightness(i) > MIDDLE;
  if (b[3] && lightness(b) > MIDDLE !== light) return behind;
  return light ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
}

/**
 * The ink of words painted on a thing of colour `behind`, and the edge round them (space_name_contrast). The ink is black
 * or white, whichever stands out more on it, and the edge is the other. So a name reads on any ball, however lit, and
 * where a line crosses it. Roger, 4 Nov 2026: "The text is illegible on the 3-D balls".
 */
export function inkOn(behind: string): { ink: string; edge: string } {
  const l = lightness(rgbaOf(behind));
  // white stands out more than black below the lightness where both give the same contrast
  const white = (1 + 0.05) / (l + 0.05) > (l + 0.05) / 0.05;
  const [black, bright] = ['rgb(0, 0, 0)', 'rgb(255, 255, 255)'];
  return white ? { ink: bright, edge: black } : { ink: black, edge: bright };
}
