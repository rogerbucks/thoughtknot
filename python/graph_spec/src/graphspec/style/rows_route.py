"""Our own curve router (editor spec §25, links_routed_in_rows), for direct_links.py: each link
routed on the rows of boxes Graphviz laid out, through the nearest gap in each row it crosses,
links through one gap side by side. It is the core's layouts/rows-route.ts, step for step, so both
libraries route the same links alike (direct-links-parity.test.js)."""

from __future__ import annotations

import math

from graphspec.style.direct_bends import ToBend, bends
from graphspec.style.direct_curve import Curve, Placed, curve_of
from graphspec.style.routed_curve import RoutedCurve

# The room kept between a link and a box it passes, in pixels.
ROW_CLEAR = 6
# The room kept between links sharing a gap that has room to spare, in pixels.
LANE = 6
# How far a link in the last row loops out past it, in pixels.
LOOP = 24
# The key of a trunk's dot (fold_source.py): it is in no row.
TRUNK = "trunk: "


class Row:
    """One row of boxes: where it runs along the drawing's way, and its boxes' spans across it."""

    def __init__(self, at: float, lo: float, hi: float, spans: list[list[float]]):
        self.at, self.lo, self.hi, self.spans = at, lo, hi, spans


def _js_round(x: float) -> float:
    """A number rounded as JavaScript's Math.round rounds it: halves up."""
    return math.floor(x + 0.5)


def rows_of(boxes: list[Placed], axis: int) -> list[Row]:
    """The rows of `boxes` along `axis` (0 across, 1 down): boxes whose middles line up."""
    by_at: dict[float, list[Placed]] = {}
    for b in boxes:
        if b.key.startswith(TRUNK):
            continue
        by_at.setdefault(_js_round(b.x if axis == 0 else b.y), []).append(b)
    out = []
    for at, bs in sorted(by_at.items(), key=lambda kv: kv[0]):
        half = max(b.hw if axis == 0 else b.hh for b in bs)
        spans = sorted(
            ([b.y - b.hh, b.y + b.hh] if axis == 0 else [b.x - b.hw, b.x + b.hw] for b in bs),
            key=lambda s: s[0],
        )
        out.append(Row(at, at - half, at + half, spans))
    return out


def in_rows(boxes: list[Placed], axis: int) -> bool:
    """Whether `boxes` are laid out in rows along `axis`: most boxes share their row."""
    rows = rows_of(boxes, axis)
    return len(boxes) > 2 and len(rows) > 1 and len(rows) * 2 <= len(boxes)


def marks_in_rows(marks: list[dict], axis: int) -> bool:
    """Whether the thing boxes of `marks` are laid out in rows along `axis`, as in_rows says."""
    boxes: dict[str, Placed] = {}
    for m in marks:
        of = m.get("of")
        if m["kind"] == "box" and m.get("role") == "thing" and of is not None and of not in boxes:
            hw, hh = m["width"] / 2, m["height"] / 2
            boxes[of] = Placed(of, m["x"] + hw, m["y"] + hh, hw, hh)
    return in_rows(list(boxes.values()), axis)


def _gap_at(spans: list[list[float]], v: float) -> int:
    lo, hi = 0, len(spans)
    while lo < hi:
        m = (lo + hi) // 2
        if spans[m][1] + ROW_CLEAR <= v:
            lo = m + 1
        else:
            hi = m
    return lo


def _room_of(spans: list[list[float]], i: int) -> tuple[float, float]:
    before = spans[i - 1][1] if i >= 1 else -math.inf
    after = spans[i][0] if i < len(spans) else math.inf
    return before + ROW_CLEAR, after - ROW_CLEAR


def _nearest_gap(spans: list[list[float]], v: float) -> tuple[int, float]:
    i = _gap_at(spans, v)
    lo, hi = _room_of(spans, i)
    if lo <= v <= hi:
        return i, v
    span = spans[i]
    before, after = span[0] - ROW_CLEAR, span[1] + ROW_CLEAR
    gb, ga = _room_of(spans, i), _room_of(spans, i + 1)

    def at(g: tuple[float, float], p: float) -> float:
        return (g[0] + g[1]) / 2 if g[0] > g[1] else p

    return (i, at(gb, before)) if v - before <= after - v else (i + 1, at(ga, after))


def _point_of(axis: int, along: float, across: float) -> list[float]:
    return [along, across] if axis == 0 else [across, along]


def rows_route(
    boxes: list[Placed], links: list[tuple[Placed, Placed]], axis: int
) -> list[list[list[float]]]:
    """The bends of each of `links`, routed on the rows of `boxes` along `axis`, in the order
    given: none for a link with nothing in its way (routed_curve.py draws a curve through them)."""
    rows = rows_of(boxes, axis)

    def along_of(b: Placed) -> float:
        return b.x if axis == 0 else b.y

    def across_of(b: Placed) -> float:
        return b.y if axis == 0 else b.x

    def half_of(b: Placed) -> float:
        return b.hw if axis == 0 else b.hh

    def row_index(u: float) -> int:
        return next((i for i, r in enumerate(rows) if r.lo <= u <= r.hi), -1)

    passes: list[tuple[int, int, int, float, list[list[float]]]] = []
    out: list[list[list[float]]] = []
    for link, (a, b) in enumerate(links):
        ua, ub, va, vb = along_of(a), along_of(b), across_of(a), across_of(b)
        row_a = row_index(ua)
        # one row: a link with a box between its ends loops out into the room beside the row
        if row_a >= 0 and rows[row_a].lo <= ub <= rows[row_a].hi:
            row = rows[row_a]
            v0, v1 = (va, vb) if va < vb else (vb, va)
            if not any(s0 > v0 + 1 and s1 < v1 - 1 for s0, s1 in row.spans):
                out.append([])
                continue
            nxt = rows[row_a + 1] if row_a + 1 < len(rows) else None
            before = rows[row_a - 1] if row_a >= 1 else None
            outward = nxt is not None or before is None
            edge = row.hi if outward else row.lo
            if outward:
                room = (nxt.lo - row.hi) / 2 if nxt is not None else LOOP
            else:
                room = (row.lo - before.hi) / 2
            loop = edge + (room if outward else -room)
            out.append(
                [
                    _point_of(axis, edge, va),
                    _point_of(axis, loop, (va + vb) / 2),
                    _point_of(axis, edge, vb),
                ]
            )
            continue
        # across rows: out of the end's row, through a gap in each row between, into the other's
        way = 1 if ub >= ua else -1
        path: list[list[float]] = []
        u, v = ua, va
        if row_a >= 0:
            leave = rows[row_a]
            edge = leave.hi if way > 0 else leave.lo
            if abs(edge - (ua + way * half_of(a))) > 1:
                path.append(_point_of(axis, edge, va))
            u = edge
        row_b = row_index(ub)
        enter = rows[row_b] if row_b >= 0 else None
        end_u = (enter.lo if way > 0 else enter.hi) if enter is not None else ub
        between = [
            (r, i)
            for i, r in enumerate(rows)
            if i not in (row_a, row_b)
            and ((r.lo > u and r.hi < end_u) if way > 0 else (r.hi < u and r.lo > end_u))
        ]
        if way < 0:
            between.reverse()
        for r, i in between:
            first, last = (r.lo, r.hi) if way > 0 else (r.hi, r.lo)
            # where a line on toward the far end would cross this row, moved to the nearest gap
            t = (first - u) / ((end_u - u) or 1)
            want = v + (vb - v) * t
            gap, at = _nearest_gap(r.spans, want)
            points = [_point_of(axis, first, at), _point_of(axis, last, at)]
            path.extend(points)
            passes.append((link, i, gap, want, points))
            u, v = last, at
        if enter is not None and abs(end_u - (ub - way * half_of(b))) > 1:
            path.append(_point_of(axis, end_u, vb))
        # nothing between: still one S through the room between the rows
        if not path:
            path.append(_point_of(axis, (u + end_u) / 2, (va + vb) / 2))
        out.append(path)
    _spread_lanes(rows, passes, axis)
    return out


def _spread_lanes(rows: list[Row], passes, axis: int) -> None:
    """Links through one gap moved apart across it, in the order they would like to be."""
    by_gap: dict[str, list] = {}
    for p in passes:
        by_gap.setdefault(f"{p[1]}:{p[2]}", []).append(p)
    across = 1 if axis == 0 else 0
    for key, found in by_gap.items():
        if len(found) < 2:
            continue
        row, gap = (int(n) for n in key.split(":"))
        lo, hi = _room_of(rows[row].spans, gap)
        found.sort(key=lambda p: (p[3], p[0]))
        total = 0.0
        for p in found:
            total += p[4][0][across]
        mid = total / len(found)
        # side by side, LANE apart, round where they would like to be, kept inside the gap
        width = min(LANE * (len(found) - 1), max(0, hi - lo))
        step = width / (len(found) - 1)
        start = min(max(mid - width / 2, lo), hi - width)
        for k, p in enumerate(found):
            for point in p[4]:
                point[across] = start + step * k


def routed_curves(
    to_bend: list[ToBend], every: list[Placed], rankdir: str, rowed: bool
) -> dict[str, Curve | RoutedCurve]:
    """Each link's curve, by its key, as the core's direct-links.ts draws it: routed on the rows
    when `rowed`, else, and where nothing is in its way, the gentle bend that crosses least."""
    across = 0 if rankdir == "TB" else 1
    in_row = rows_route(every, [(t.a, t.b) for t in to_bend], 1 - across) if rowed else []
    free = [i for i in range(len(to_bend)) if not rowed or not in_row[i]]
    bow_of = dict(zip(free, bends([to_bend[i] for i in free], every), strict=True))
    curves: dict[str, Curve | RoutedCurve] = {}
    for i, t in enumerate(to_bend):
        # links through one gap are spread side by side there already (_spread_lanes)
        at = [[p[0], p[1]] for p in in_row[i]] if rowed else []
        curves[t.key] = (
            RoutedCurve(t.a, t.b, at, 1 - across) if at else curve_of(t.a, t.b, bow_of.get(i, 0))
        )
    return curves
