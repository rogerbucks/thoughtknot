// The shapes of one PowerPoint slide read into text, pictures, tables and boxes (ES§45 board_exchange, ES§67
// format_untrusted_files). A shape with no place of its own takes the one its layout or master gives it.
// A group of shapes moves and scales what is in it. Nothing is run and no link is followed.
import { PICTURE_MOST_BYTES, pictureKind } from './picture-keep.ts';
import { Over } from './pptx-types.ts';
import type { Box, Deck, Para, Places, Shape } from './pptx-types.ts';
import { deep, kid, kidsOf } from './pptx-xml.ts';
import type { Rels, XNode } from './pptx-xml.ts';
import { partBytes } from './zip-read.ts';

const EMU = 9525;
/** A size in EMU (the unit a deck is written in) as whole pixels, 96 to the inch. */
export const px = (v: string | undefined): number => Math.round((Number(v) || 0) / EMU);

/** A move and a scale: a point goes to its place times the scale, plus the move. Groups of shapes make these. */
interface Move {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}
const SAME: Move = { sx: 1, sy: 1, tx: 0, ty: 0 };

/** The place an `xfrm` node gives, before any group's move; null when it gives none. */
function placeOf(xfrm: XNode | undefined): Box | null {
  const [off, ext] = [kid(xfrm, 'off'), kid(xfrm, 'ext')];
  if (!off || !ext) return null;
  return { x: px(off.attrs.x), y: px(off.attrs.y), w: px(ext.attrs.cx), h: px(ext.attrs.cy) };
}

const moved = (b: Box, m: Move): Box => ({
  x: Math.round(b.x * m.sx + m.tx),
  y: Math.round(b.y * m.sy + m.ty),
  w: Math.round(b.w * m.sx),
  h: Math.round(b.h * m.sy),
});

/** The move a group's `xfrm` makes for its children, after `outer`; `outer` itself when it gives none. */
function groupMove(xfrm: XNode | undefined, outer: Move): Move {
  const [own, co, ce] = [placeOf(xfrm), kid(xfrm, 'chOff'), kid(xfrm, 'chExt')];
  if (!own || !co || !ce) return outer;
  const [cw, ch] = [px(ce.attrs.cx), px(ce.attrs.cy)];
  if (cw <= 0 || ch <= 0) return outer;
  const inner: Move = {
    sx: own.w / cw,
    sy: own.h / ch,
    tx: own.x - px(co.attrs.x) * (own.w / cw),
    ty: own.y - px(co.attrs.y) * (own.h / ch),
  };
  return {
    sx: inner.sx * outer.sx,
    sy: inner.sy * outer.sy,
    tx: inner.tx * outer.sx + outer.tx,
    ty: inner.ty * outer.sy + outer.ty,
  };
}

/** A placeholder's kind: a centred title is a title, and a placeholder with no kind is content (`body`). */
const kindOfPh = (ph: XNode): string =>
  !ph.attrs.type ? 'body' : ph.attrs.type === 'ctrTitle' ? 'title' : ph.attrs.type;

/** The place a placeholder takes from the layout, else the master; null when neither gives one. */
export function inherited(ph: XNode, layout: Places | null, master: Places | null): Box | null {
  const idx = ph.attrs.idx;
  return (
    (idx !== undefined ? layout?.byIdx.get(idx) : undefined) ??
    layout?.byType.get(kindOfPh(ph)) ??
    master?.byType.get(kindOfPh(ph)) ??
    null
  );
}

/** The placeholders of a layout or master tree with a place of their own, or one from `master` for a layout. */
export function placesOf(tree: XNode, master: Places | null): Places {
  const out: Places = { byIdx: new Map(), byType: new Map() };
  for (const sp of kidsOf(kid(kid(kid(tree, 'sldLayout') ?? kid(tree, 'sldMaster'), 'cSld'), 'spTree'), 'sp')) {
    const ph = kid(kid(kid(sp, 'nvSpPr'), 'nvPr'), 'ph');
    if (!ph) continue;
    const box = placeOf(kid(kid(sp, 'spPr'), 'xfrm')) ?? inherited(ph, null, master);
    if (!box) continue;
    if (ph.attrs.idx !== undefined) out.byIdx.set(ph.attrs.idx, box);
    if (!out.byType.has(kindOfPh(ph))) out.byType.set(kindOfPh(ph), box);
  }
  return out;
}

/** The text of a paragraph node, its runs, breaks and fields in order, cut at the text limit. */
export function textOf(p: XNode, most: number): string {
  let out = '';
  const take = (n: XNode) => {
    for (const k of n.kids) {
      if (k.name === 't') out += k.text;
      else if (k.name === 'br') out += '\n';
      else if (k.name === 'r' || k.name === 'fld') take(k);
      if (out.length > most) throw new Over('text-too-long', most);
    }
  };
  take(p);
  return out;
}

/** The paragraphs of a `txBody`. `bulleted` is true where the layout gives bullets unless a paragraph turns them off. */
function parasOf(body: XNode | undefined, bulleted: boolean, most: number): Para[] {
  const out: Para[] = [];
  for (const p of kidsOf(body, 'p')) {
    const text = textOf(p, most).trim();
    if (!text) continue;
    const pr = kid(p, 'pPr');
    const level = Math.min(8, Math.max(0, Number(pr?.attrs.lvl) || 0));
    const bullet = kid(pr, 'buNone')
      ? 'none'
      : kid(pr, 'buAutoNum')
        ? 'number'
        : kid(pr, 'buChar') || bulleted
          ? 'dot'
          : 'none';
    out.push({ text, level, bullet });
  }
  return out;
}

const BASIC: Record<string, 'box' | 'ellipse'> = {
  rect: 'box',
  roundRect: 'box',
  snipRoundRect: 'box',
  flowChartProcess: 'box',
  flowChartAlternateProcess: 'box',
  ellipse: 'ellipse',
  flowChartConnector: 'ellipse',
  diamond: 'box',
  flowChartDecision: 'box',
};

/** Whether a shape's own properties give it a fill or a line, so it is seen though it holds no words. */
const drawn = (sp: XNode | undefined): boolean =>
  !!sp?.kids.some((k) => ['solidFill', 'gradFill', 'pattFill', 'blipFill'].includes(k.name)) ||
  (!!kid(sp, 'ln') && !kid(kid(sp, 'ln'), 'noFill'));

/** One slide's walk: the shapes it holds, in order, with each group's move put on. */
export function walk(d: Deck, spTree: XNode, rels: Rels, layout: Places | null, master: Places | null): Shape[] {
  const out: Shape[] = [];
  const add = (s: Shape) => {
    if (++d.shapes > d.most.shapes) throw new Over('too-large');
    out.push(s);
  };
  const picture = (n: XNode, move: Move) => {
    const blip = deep(kid(n, 'blipFill'), 'blip');
    const rel = blip?.attrs.embed ? rels.byId.get(blip.attrs.embed) : undefined;
    if (!blip || !rel) return void d.left.pictures++;
    if (!d.pictures.has(rel.part)) {
      const e = d.zip.get(rel.part.toLowerCase());
      const fits = !!e && e.size <= PICTURE_MOST_BYTES && (d.inflated += e.size) <= d.most.inflated;
      const bytes = fits ? partBytes(d.bytes, d.zip, rel.part, PICTURE_MOST_BYTES) : null;
      const kind = bytes && pictureKind(bytes);
      if (!bytes || !kind) {
        // a part no picture can be made of is counted once, however many slides use it
        if (!d.refusedParts.has(rel.part)) d.left.pictures++;
        d.refusedParts.add(rel.part);
        return;
      }
      d.pictures.set(rel.part, { part: rel.part, ending: kind.ending, bytes });
    } else if (d.refusedParts.has(rel.part)) return;
    const own = placeOf(kid(kid(n, 'spPr'), 'xfrm'));
    if (deep(kid(n, 'nvPicPr'), 'videoFile') || deep(kid(n, 'nvPicPr'), 'audioFile')) d.left.media++;
    add({
      kind: 'picture',
      box: own && moved(own, move),
      alt: kid(kid(n, 'nvPicPr'), 'cNvPr')?.attrs.descr ?? '',
      part: rel.part,
    });
  };
  const shape = (n: XNode, move: Move) => {
    const nv = kid(n, 'nvSpPr');
    const ph = kid(kid(nv, 'nvPr'), 'ph');
    const kind = ph ? kindOfPh(ph) : '';
    if (['sldNum', 'dt', 'hdr', 'ftr'].includes(kind)) return;
    const body = kid(n, 'txBody');
    const bulleted = !!ph && kind === 'body';
    const paras = parasOf(body, bulleted, d.most.text);
    const sp = kid(n, 'spPr');
    const own = placeOf(kid(sp, 'xfrm'));
    const box = own ? moved(own, move) : ph ? inherited(ph, layout, master) : null;
    const geom = kid(sp, 'prstGeom')?.attrs.prst;
    if (ph || kid(nv, 'cNvSpPr')?.attrs.txBox === '1') {
      if (paras.length) add({ kind: 'text', title: kind === 'title', box, paras });
      return;
    }
    if (geom === 'line' || geom === 'straightConnector1') return void d.left.lines++;
    if (!paras.length && !drawn(sp)) return;
    add({ kind: 'shape', geom: (geom && BASIC[geom]) || 'box', box, paras });
  };
  const frame = (n: XNode, move: Move) => {
    const uri = kid(kid(n, 'graphic'), 'graphicData')?.attrs.uri ?? '';
    const tbl = deep(kid(kid(n, 'graphic'), 'graphicData'), 'tbl');
    if (tbl) {
      const rows = kidsOf(tbl, 'tr').map((tr) =>
        kidsOf(tr, 'tc').map((tc) =>
          kidsOf(kid(tc, 'txBody'), 'p')
            .map((p) => textOf(p, d.most.text).trim())
            .filter(Boolean)
            .join('\n'),
        ),
      );
      const own = placeOf(kid(n, 'xfrm'));
      if (rows.length) add({ kind: 'table', box: own && moved(own, move), rows });
    } else if (uri.includes('chart')) d.left.charts++;
    else if (uri.includes('diagram')) d.left.smartart++;
    else d.left.objects++;
  };
  const each = (parent: XNode, move: Move) => {
    for (const n of parent.kids) {
      if (n.name === 'sp') shape(n, move);
      else if (n.name === 'pic') picture(n, move);
      else if (n.name === 'graphicFrame') frame(n, move);
      else if (n.name === 'cxnSp') d.left.lines++;
      else if (n.name === 'grpSp') each(n, groupMove(kid(kid(n, 'grpSpPr'), 'xfrm'), move));
      // what a program that does not know a newer feature draws is read; the newer form is not
      else if (n.name === 'AlternateContent') for (const f of kidsOf(n, 'Fallback')) each(f, move);
    }
  };
  each(spTree, SAME);
  return out;
}
