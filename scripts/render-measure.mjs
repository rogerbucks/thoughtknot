// The counts the rendering scoreboard takes of one drawing (editor spec §73, render_scoreboard; wiki/Rendering-spec.md,
// "The scoreboard"). The page is read once, by PROBE, into plain boxes. Every count is then worked out here, from those
// boxes alone, so each is tested without a browser (test/render-scoreboard.test.js).
//
// A box is { x, y, w, h } in screen pixels. A label also has `px`, its letters' height on screen, and `text`.

/** The smallest a label may be on screen, in pixels (render_one_label_placer). */
export const MIN_LABEL_PX = 11;
/** How far a thing may shift on a zoom before it counts as moved, in the drawing's own pixels. */
export const MOVED_BY = 1;
/** The least overlap that counts, as a share of the smaller box: two labels that only touch do not. */
const OVERLAP_SHARE = 0.1;

/** The area two boxes share, in square pixels. */
export function shared(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Whether `inner` lies wholly inside `outer`, with half a pixel to spare for rounding. */
export const inside = (inner, outer) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.w <= outer.x + outer.w + 0.5 &&
  inner.y + inner.h <= outer.y + outer.h + 0.5;

/** The pairs of labels that overlap, by their texts. Sorted by left edge first, so it stays quick for thousands. */
export function overlaps(labels) {
  const sorted = [...labels].sort((a, b) => a.x - b.x),
    pairs = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length && sorted[j].x < a.x + a.w; j++) {
      const b = sorted[j],
        least = Math.min(a.w * a.h, b.w * b.h);
      if (least > 0 && shared(a, b) > least * OVERLAP_SHARE) pairs.push([a.text, b.text]);
    }
  }
  return pairs;
}

/** The labels cut by the edge of the drawing: partly in it, partly out. */
export const cut = (labels, frame) => labels.filter((l) => shared(l, frame) > 0 && !inside(l, frame));

/** The labels on screen that are smaller than MIN_LABEL_PX. */
export const tiny = (labels, frame) => labels.filter((l) => shared(l, frame) > 0 && l.px < MIN_LABEL_PX);

/**
 * How much of the drawing the controls cover: the square pixels of the frame under a control, and the marks with any
 * part under one. Only the part of a mark inside the frame counts.
 */
export function covered(marks, controls, frame) {
  const pixels = controls.reduce((sum, c) => sum + shared(c, frame), 0);
  const under = marks.filter((m) => {
    const seen = clip(m, frame);
    return seen && controls.some((c) => shared(seen, c) > 0);
  });
  return { marks: under.length, pixels: Math.round(pixels) };
}

/** The part of `box` inside `frame`, or null when none is. */
function clip(box, frame) {
  const x = Math.max(box.x, frame.x),
    y = Math.max(box.y, frame.y);
  const w = Math.min(box.x + box.w, frame.x + frame.w) - x,
    h = Math.min(box.y + box.h, frame.y + frame.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/**
 * The things that moved between two readings, by key. Each reading maps a thing's key to its middle in the drawing's
 * own pixels, so a zoom alone moves nothing. A thing in only one reading did not move: it came or went.
 */
export function moved(before, after, by = MOVED_BY) {
  const keys = [];
  for (const [key, a] of before) {
    const b = after.get(key);
    if (b && Math.hypot(a.x - b.x, a.y - b.y) > by) keys.push(key);
  }
  return keys;
}

/** The counts of one reading of the page, as the scoreboard reports them. Null where the page could not be measured. */
export function countsOf(reading) {
  const { frame, labels, marks, controls, iconWords } = reading;
  if (!frame) return null;
  return {
    labels: labels ? labels.length : null,
    overlaps: labels ? overlaps(labels).length : null,
    cut: labels ? cut(labels, frame).length : null,
    tiny: labels ? tiny(labels, frame).length : null,
    covered: covered(marks, controls, frame),
    iconWords,
  };
}

/** Whether `counts` pass every check that has a number: each must be zero. A check that could not be measured passes no one. */
export function passes(counts, movedKeys) {
  if (!counts) return false;
  return [counts.overlaps, counts.cut, counts.tiny, counts.covered.pixels, counts.iconWords, movedKeys.length].every(
    (n) => n === 0,
  );
}

/**
 * Read in the page: the drawing's frame, its labels, its marks, the controls over it and the icons shown as words. The
 * first card is read. Its marks are the things shown and, while a level of groups shows, each group's cloud and each
 * road's count. Every thing's spot is read from its shape, shown or faded. So a faded thing that moves still counts,
 * and a name a zoom hides does not. A drawing painted on a canvas, as in space, is not read. Labels painted on a canvas cannot be read, so `labels` is null where the drawing is a canvas.
 */
export const PROBE = `(() => {
  const GROUP_MARKS = '.thoughtknot-cloud-unit, .thoughtknot-road-count';
  const card = document.querySelector('.block-language-gql');
  const vp = card?.querySelector('.thoughtknot-viewport');
  if (!vp) return { frame: null };
  const box = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  const seen = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const frame = box(vp.getBoundingClientRect());
  const svg = vp.querySelector('svg');
  const canvas = [...vp.querySelectorAll('canvas')].some((c) => seen(c) && c.getBoundingClientRect().width > frame.w / 2);
  const painted = canvas || !svg || !seen(svg);
  const labels = painted ? null : [...svg.querySelectorAll('text')].filter((t) => seen(t) && t.textContent.trim()).map((t) => {
    const r = t.getBoundingClientRect(), m = t.getScreenCTM();
    return { ...box(r), text: t.textContent.trim(), px: parseFloat(getComputedStyle(t).fontSize) * (m ? Math.hypot(m.a, m.b) : 1) };
  }).filter((l) => l.w > 0 && l.h > 0);
  const things = painted ? [] : [...svg.querySelectorAll('[data-key]')].filter(seen);
  const groups = painted ? [] : [...svg.querySelectorAll(GROUP_MARKS)].filter(seen);
  const marks = [...things, ...groups].map((g) => ({ ...box(g.getBoundingClientRect()), text: g.dataset.key ?? g.textContent.trim() }));
  const shapeOf = (g) => g.querySelector('path, rect, ellipse, polygon, circle') ?? g;
  const spots = painted ? {} : Object.fromEntries([...svg.querySelectorAll('[data-key]')].map((g) => { const b = shapeOf(g).getBBox(); return [g.dataset.key, { x: b.x + b.width / 2, y: b.y + b.height / 2 }]; }));
  const over = [];
  for (const el of card.querySelectorAll('*')) {
    if (el.closest('svg') || el.closest('canvas') || vp === el || !seen(el)) continue;
    const pos = getComputedStyle(el).position;
    if (pos !== 'absolute' && pos !== 'fixed' && pos !== 'sticky') continue;
    if (over.some((o) => o.contains(el)) || el.contains(vp)) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height > 0 && r.right > frame.x && r.left < frame.x + frame.w && r.bottom > frame.y && r.top < frame.y + frame.h) over.push(el);
  }
  const iconWords = [...card.querySelectorAll('[data-icon]')].filter((el) => seen(el) && [...el.childNodes].some((n) => n.textContent.trim() === el.dataset.icon)).length;
  return { frame, labels, marks, spots, controls: over.map((el) => box(el.getBoundingClientRect())), iconWords };
})()`;
