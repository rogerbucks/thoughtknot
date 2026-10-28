"""A link routed through bends (editor spec §25, links_routed_in_rows), for direct_links.py: one
smooth curve from the side of one box, through each bend, to the side of the other, each piece
leaving and arriving the drawing's way. It is the core's layouts/routed-curve.ts, step for step, so
both libraries draw the same curve."""

from __future__ import annotations

import math

from graphspec.style.direct_curve import Placed, hypot

# How many straight pieces follow each piece of a curve, to find a place along it.
STEPS = 8


def _sign(x: float) -> int:
    return (x > 0) - (x < 0)


def _edge_of(b: Placed, p) -> list[float]:
    dx, dy = p[0] - b.x, p[1] - b.y
    k = min(math.inf if dx == 0 else b.hw / abs(dx), math.inf if dy == 0 else b.hh / abs(dy), 1)
    return [b.x + dx * k, b.y + dy * k]


def _toward(p, q, by: float) -> list[float]:
    d = hypot(q[0] - p[0], q[1] - p[1]) or 1
    return [p[0] + ((q[0] - p[0]) * by) / d, p[1] + ((q[1] - p[1]) * by) / d]


def _inward(p, q, by: float, axis: int) -> list[float]:
    """End `p` drawn in `by` along `axis` toward `q`; toward `q` itself where `q` is level."""
    d = _sign(q[axis] - p[axis])
    if not d:
        return _toward(p, q, by)
    return [p[0] + d * by, p[1]] if axis == 0 else [p[0], p[1] + d * by]


def _smooth(path, axis: int) -> list[list[float]]:
    """Cubic curve points through every point of `path`, each piece leaving and arriving the
    drawing's way (`axis` 0 across, 1 down)."""
    out = [list(path[0])]
    for p, q in zip(path, path[1:]):
        half = (q[axis] - p[axis]) / 2
        c1 = [p[0] + half, p[1]] if axis == 0 else [p[0], p[1] + half]
        c2 = [q[0] - half, q[1]] if axis == 0 else [q[0], q[1] - half]
        out.extend([c1, c2, list(q)])
    return out


def _drawn_along(c) -> list[list[float]]:
    """The points along cubic curve points `c`, a few to each piece."""
    out = [c[0]]
    for i in range(0, len(c) - 3, 3):
        p0, p1, p2, p3 = c[i], c[i + 1], c[i + 2], c[i + 3]
        for k in range(1, STEPS + 1):
            t = k / STEPS
            u = 1 - t
            w = (u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t)
            out.append(
                [
                    w[0] * p0[0] + w[1] * p1[0] + w[2] * p2[0] + w[3] * p3[0],
                    w[0] * p0[1] + w[1] * p1[1] + w[2] * p2[1] + w[3] * p3[1],
                ]
            )
    return out


class RoutedCurve:
    """The curve from the edge of box `a` through each of `via` to the edge of box `b`."""

    def __init__(self, a: Placed, b: Placed, via, axis: int = 0):
        self.axis, self.via = axis, [list(p) for p in via]

        def side(box: Placed, toward) -> list[float]:
            if axis == 0:
                return [box.x + _sign(toward[0] - box.x) * box.hw, box.y]
            return [box.x, box.y + _sign(toward[1] - box.y) * box.hh]

        p0 = side(a, via[0]) if via else _edge_of(a, (b.x, b.y))
        p3 = side(b, via[-1]) if via else _edge_of(b, (a.x, a.y))
        self.ends = (p0, p3)
        self.path = [p0, *self.via, p3]
        drawn = _drawn_along(_smooth(self.path, axis))
        self.drawn = drawn
        self.lengths = [
            hypot(q[0] - p[0], q[1] - p[1]) for p, q in zip(drawn, drawn[1:], strict=False)
        ]
        total = 0.0
        for length in self.lengths:
            total += length
        self.total = total or 1

    def _along(self, t: float):
        left = t * self.total
        drawn, lengths = self.drawn, self.lengths
        for i, length in enumerate(lengths):
            p, q = drawn[i], drawn[i + 1]
            if left <= length or i == len(lengths) - 1:
                u = min(1, left / length) if length else 0
                return (
                    (p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u),
                    (q[0] - p[0], q[1] - p[1]),
                )
            left -= length
        p0, p3 = self.ends
        return (tuple(p3), (p3[0] - p0[0], p3[1] - p0[1]))

    def at(self, t: float) -> tuple[float, float]:
        """The point `t` of the way along the curve."""
        return self._along(t)[0]

    def cubic(self, cut_start: float, cut_end: float) -> list[list[float]]:
        """Its cubic curve points, the ends drawn in where an arrowhead takes their place."""
        (p0, p3), path = self.ends, self.path
        s = _inward(p0, path[1], cut_start, self.axis)
        e = _inward(p3, path[-2], cut_end, self.axis)
        return _smooth([s, *self.via, e], self.axis)

    def tip_at(self, at_start: bool) -> tuple[tuple[float, float], float]:
        """Its tip at the first end, or the last, pointing the drawing's way."""
        tip = self.ends[0] if at_start else self.ends[1]
        frm = self.path[1] if at_start else self.path[-2]
        d = tip[self.axis] - frm[self.axis]
        if self.axis == 0:
            angle = 0 if d >= 0 else 180
        else:
            angle = 90 if d >= 0 else -90
        return (tip[0], tip[1]), angle

    def words_at(self, t: float, off: float) -> tuple[float, float]:
        """Words sit just above the line where it runs across, beside it where it runs down."""
        (x, y), (dx, dy) = self._along(t)
        long = hypot(dx, dy) or 1
        flip = -1 if dx >= 0 else 1
        return (x - (dy / long) * off * flip, y + (dx / long) * off * flip)
