"""How each direct link bends, and the room the boxes are given (editor spec §25,
untangle_direct). It is the core's direct-bends.ts, step for step, so both libraries draw the
same links for the same layout (direct-links-parity.test.js).

Where a link drawn straight would run through a box or cross another, the boxes are first spread
a little apart from the middle of the drawing. A group moves whole, so
it keeps its boxes. Then each lone link is tried at a few bends, each way, the slightest first,
toward the middle of the drawing. A bend scores the boxes it runs through, the links it crosses,
and how far it bends. Each link takes the bend that scores least, given the rest. A second round
tries each again. Within a budget, so a big graph stays quick."""

from __future__ import annotations

import math
import re

from graphspec.style.direct_curve import Placed, curve_of, hypot

# How much room a link keeps from a box it passes, in pixels.
CLEARANCE = 10
# How far a lone link bows toward the middle of the drawing at the least, as a share of its length.
GENTLE = 0.08
# How much further apart the boxes are spread from the middle of the drawing: a little more room.
ROOM = 1.15
# The bends a lone link is tried at, each way, as shares of its length.
BENDS = (GENTLE, 0.16, 0.26, 0.4, 0.55)
# The wider bends a bundle is tried at too, so it can go round a whole group in its way.
WIDE = (0.75, 1)
# How a bend is scored: for each box it runs through, each link it crosses, and how far it bends.
THROUGH, CROSSED, BENT = 4, 1, 2
# How many pieces a curve is cut into, to find what it runs through and crosses.
PIECES = 16
# The most looks at a piece of a curve in all, so a big graph stays quick.
WORK_MOST = 40_000_000


def _sign(x: float) -> float:
    return (x > 0) - (x < 0)


def spread(
    boxes: list[Placed], groups: dict[str, list[float]], middle: tuple[float, float]
) -> dict[str, tuple]:
    """Spreads `boxes` apart from `middle` by ROOM. A box in a group moves with the outermost
    group it is in, as does that group and every group inside it. Each group's edges are a list
    (x0, y0, x1, y1), moved in place. Gives how far each group moved, by its id."""

    def within(p, q) -> bool:
        return p is not q and q[0] <= p[0] and q[1] <= p[1] and p[2] <= q[2] and p[3] <= q[3]

    every = list(groups.values())
    by: dict[int, tuple[float, float]] = {}
    k = ROOM - 1
    for g in every:
        # the outermost group round it: the one round it that no other is round
        outer = next(
            (
                q
                for q in every
                if (q is g or within(g, q)) and not any(within(q, r) for r in every)
            ),
            g,
        )
        by[id(g)] = (
            ((outer[0] + outer[2]) / 2 - middle[0]) * k,
            ((outer[1] + outer[3]) / 2 - middle[1]) * k,
        )
    for b in boxes:
        d = by.get(id(b.inside)) if b.inside is not None else None
        b.x = b.x + d[0] if d is not None else middle[0] + (b.x - middle[0]) * ROOM
        b.y = b.y + d[1] if d is not None else middle[1] + (b.y - middle[1]) * ROOM
    moved: dict[str, tuple] = {}
    for gid, g in groups.items():
        dx, dy = by.get(id(g), (0, 0))
        g[:] = [g[0] + dx, g[1] + dy, g[2] + dx, g[3] + dy]
        moved[gid] = (dx, dy)
    return moved


def crowded(pairs: list[tuple[Placed, Placed]], boxes: list[Placed]) -> bool:
    """Whether some link of `pairs`, drawn straight from middle to middle, runs through a box or
    crosses another. Then the boxes are given room. A big graph is taken to need it."""
    if len(pairs) * (len(pairs) + len(boxes)) * PIECES > WORK_MOST:
        return True
    for i, (a, b) in enumerate(pairs):
        for o in boxes:
            if o is a or o is b:
                continue
            for k in range(1, PIECES):
                x = a.x + ((b.x - a.x) * k) / PIECES
                y = a.y + ((b.y - a.y) * k) / PIECES
                if abs(x - o.x) < o.hw and abs(y - o.y) < o.hh:
                    return True
        for c, d in pairs[i + 1 :]:
            if c is a or c is b or d is a or d is b:
                continue
            if _cut((a.x, a.y), (b.x, b.y), (c.x, c.y), (d.x, d.y)):
                return True
    return False


def _turn(o, s, t) -> float:
    """Which way `t` turns from the line `o` to `s`: 1, -1, or 0 on it."""
    return _sign((s[0] - o[0]) * (t[1] - o[1]) - (s[1] - o[1]) * (t[0] - o[0]))


def _cut(a, b, c, d) -> bool:
    """Whether the piece `a` to `b` crosses the piece `c` to `d`."""
    return _turn(a, b, c) * _turn(a, b, d) < 0 and _turn(c, d, a) * _turn(c, d, b) < 0


class ToBend:
    """A link to bend: its ends, the way its gentle bend goes first, and its bow when that is
    fixed already. `avoid` is more it goes round, as it does boxes: a bundle goes round the groups
    between its two (trunk_ends)."""

    def __init__(
        self,
        key: str,
        a: Placed,
        b: Placed,
        toward: float,
        fixed: float | None = None,
        avoid: list[Placed] | None = None,
    ):
        self.key, self.a, self.b, self.toward, self.fixed = key, a, b, toward, fixed
        self.avoid = avoid


def toward_middle(a: Placed, b: Placed, side: int, middle: tuple[float, float]) -> float:
    """The way toward the middle of the drawing, seen from the link from `a` to `b`; on the line
    itself, `side`."""
    dx, dy = b.x - a.x, b.y - a.y
    across = (middle[0] - (a.x + b.x) / 2) * -dy + (middle[1] - (a.y + b.y) / 2) * dx
    return side if abs(across) < 1e-6 * (dx * dx + dy * dy) else _sign(across)


def bends(links: list[ToBend], boxes: list[Placed]) -> list[float]:
    """How far each link of `links` bows, as a share of its length: the bend that scores least,
    given the rest."""
    tries = []
    for link in links:
        if link.fixed is not None:
            tries.append([link.fixed])
            continue
        away = aside(link.a, link.b, boxes + link.avoid if link.avoid else boxes)
        widths = BENDS + WIDE if link.avoid else BENDS
        each = [v for s in widths for v in (link.toward * s, -link.toward * s)]
        tries.append(([away] if away else []) + each)
    n = len(links)
    cost = n * n * PIECES + n * len(boxes) * len(BENDS) * 2 * PIECES
    crossing = cost <= WORK_MOST
    lines = [_path_of(link.a, link.b, t[0]) for link, t in zip(links, tries)]
    bows = [t[0] for t in tries]
    for rnd in range(2 if crossing else 1):
        for i, link in enumerate(links):
            others = (
                [
                    lines[j]
                    for j in range(n)
                    if j != i and (rnd > 0 or j < i) and _apart_from(link, links[j])
                ]
                if crossing
                else []
            )
            best = float("inf")
            for bow in tries[i]:
                path = _path_of(link.a, link.b, bow)
                score = (
                    THROUGH * _through(path, link, boxes + link.avoid if link.avoid else boxes)
                    + CROSSED * sum(1 for o in others if _crosses(path, o))
                    + BENT * abs(bow)
                )
                if score < best:
                    best, bows[i], lines[i] = score, bow, path
    return bows


def _apart_from(link: ToBend, other: ToBend) -> bool:
    """Whether two links share no box, so a crossing between them is one to count."""
    return (
        link.a is not other.a
        and link.a is not other.b
        and link.b is not other.a
        and link.b is not other.b
    )


def _path_of(a: Placed, b: Placed, bow: float):
    """The curve from `a` to `b` bowed by `bow`, cut into PIECES: its points, and the box round
    them (x0, y0, x1, y1)."""
    c = curve_of(a, b, bow)
    points = [c.at(k / PIECES) for k in range(PIECES + 1)]
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return points, (min(xs), min(ys), max(xs), max(ys))


def _through(path, link: ToBend, boxes: list[Placed]) -> int:
    """How many boxes, other than its ends, the curve `path` of `link` runs through."""
    points, (x0, y0, x1, y1) = path
    n = 0
    for o in boxes:
        if o is link.a or o is link.b:
            continue
        if o.x + o.hw < x0 or o.x - o.hw > x1 or o.y + o.hh < y0 or o.y - o.hh > y1:
            continue
        if any(abs(x - o.x) < o.hw and abs(y - o.y) < o.hh for x, y in points):
            n += 1
    return n


def _crosses(p, q) -> bool:
    """Whether two curves cross."""
    (ps, pb), (qs, qb) = p, q
    if pb[2] < qb[0] or qb[2] < pb[0] or pb[3] < qb[1] or qb[3] < pb[1]:
        return False

    for i in range(PIECES):
        a, b = ps[i], ps[i + 1]
        for j in range(PIECES):
            c, d = qs[j], qs[j + 1]
            if _cut(a, b, c, d):
                return True
    return False


def aside(a: Placed, b: Placed, boxes: list[Placed]) -> float:
    """How far the link from `a` to `b` bows, as a share of its length, to clear a box still in
    its way: away from the box, just far enough. Nothing in its way, it does not bow."""
    dx, dy = b.x - a.x, b.y - a.y
    long = hypot(dx, dy)
    if long < 1e-6:
        return 0
    nx, ny = -dy / long, dx / long
    most = 0.0
    for c in boxes:
        if c is a or c is b:
            continue
        t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / (long * long)
        if t <= 0.05 or t >= 0.95:
            continue
        off = (c.x - a.x) * nx + (c.y - a.y) * ny
        reach = abs(nx) * c.hw + abs(ny) * c.hh + CLEARANCE
        if abs(off) >= reach:
            continue
        # a curve's middle moves half as far as its bend, scaled by how near the box is to it
        bend = (-_sign(off or 1) * 2 * (reach + abs(off))) / (4 * t * (1 - t)) / long
        if abs(bend) > abs(most):
            most = bend
    return max(-0.6, min(0.6, most))


_TRUNK_END = re.compile(r"^trunk: (\d+) (in|out)$")


def trunk_ends(boxes: dict[str, Placed], links: list[dict]) -> None:
    """Each trunk's two ends moved to beside the groups it joins (untangle_found_groups), as the
    core's trunkEnds does. The end its links come in to sits just outside the group they come
    from, facing the group they go to. The other end sits the same way by that group."""

    def region_of(key: str, end: str):
        near = []
        for link in links:
            if end == "in" and link.get("to") == key:
                b = boxes.get(link.get("from") or "")
            elif end == "out" and link.get("from") == key:
                b = boxes.get(link.get("to") or "")
            else:
                b = None
            if b:
                near.append(b)
        if not near:
            return None
        first = near[0].inside
        if first and all(b.inside is first for b in near):
            return first
        return [
            min(b.x - b.hw for b in near),
            min(b.y - b.hh for b in near),
            max(b.x + b.hw for b in near),
            max(b.y + b.hh for b in near),
        ]

    spots = []
    for key, p in boxes.items():
        m = _TRUNK_END.match(key)
        if not m:
            continue
        other = "out" if m.group(2) == "in" else "in"
        here, there = region_of(key, m.group(2)), region_of(f"trunk: {m.group(1)} {other}", other)
        if not here or not there:
            continue
        cx, cy = (here[0] + here[2]) / 2, (here[1] + here[3]) / 2
        dx, dy = (there[0] + there[2]) / 2 - cx, (there[1] + there[3]) / 2 - cy
        long = hypot(dx, dy) or 1
        ux, uy = dx / long, dy / long
        reach = (
            min(
                math.inf if ux == 0 else (here[2] - here[0]) / 2 / abs(ux),
                math.inf if uy == 0 else (here[3] - here[1]) / 2 / abs(uy),
            )
            + CLEARANCE
        )
        spots.append((p, cx + ux * reach, cy + uy * reach))
    for p, x, y in spots:
        p.x, p.y, p.inside = x, y, None
