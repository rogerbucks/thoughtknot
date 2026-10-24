"""Direct links (editor spec §25, untangle_direct): each link one gentle curve from box to box,
the boxes moved aside so no link runs through a box it does not join. It is the core's
direct-links.ts, step for step, so both libraries draw the same links for the same layout
(direct-links-parity.test.js).

Graphviz places the boxes. In place of its routing, each link is one curve from box to box. A box
a link would pass through moves aside, just clear of it, and boxes moved into each other are
pushed apart again, a few rounds within a budget. Two links between the same two boxes bow apart.
A lone link bows a little toward the middle of the drawing. Each arrowhead lands on its box edge,
and the words sit by the curve (direct_words.py). First the boxes are given a little more room,
and each link takes the slight bend that crosses fewest boxes and links (direct_bends.py). It
works on the marks marks.py reads from a layout, and marks_svg.py writes them, so every part
keeps its id, class and title."""

from __future__ import annotations

import math
from typing import Any

from graphspec.style.direct_bends import (
    CLEARANCE,
    ToBend,
    bends,
    crowded,
    spread,
    toward_middle,
)
from graphspec.style.direct_curve import Curve, Placed, curve_of, hypot
from graphspec.style.direct_words import WORDS_OFF, js_length, word_spots

# The room kept round a line or words at the edge of the drawing, in pixels.
EDGE = 2
# The room kept between two boxes pushed apart, in pixels.
BOX_GAP = 12
# The most rounds of moving boxes off links and apart again.
ROUNDS = 6
# The most box and link pairs looked at in all, so a big graph stays quick.
WORK_MOST = 4_000_000
# How far two links between the same boxes bow apart at their middle, as a share of their length.
BOW = 0.16

Mark = dict[str, Any]


def direct_links(laid: dict[str, Any]) -> dict[str, Any]:
    """`laid` with its links drawn directly and its boxes moved off them. A self link keeps its
    loop, moved with its box."""
    marks: list[Mark] = laid["marks"]
    boxes: dict[str, Placed] = {}
    groups = {
        m["id"]: [m["x"], m["y"], m["x"] + m["width"], m["y"] + m["height"]]
        for m in marks
        if m["kind"] == "group"
    }
    for m in marks:
        of = m.get("of")
        if m["kind"] == "box" and m.get("role") == "thing" and of is not None and of not in boxes:
            hw, hh = m["width"] / 2, m["height"] / 2
            # its group as marked, else the smallest one round it, as Graphviz drew it
            g = _group_round(groups, m) if m.get("group") is None else groups.get(m["group"])
            boxes[of] = Placed(of, m["x"] + hw, m["y"] + hh, hw, hh, g)
    links = [
        m for m in marks if m["kind"] == "link" and m.get("from") in boxes and m.get("to") in boxes
    ]
    start = {k: (b.x, b.y) for k, b in boxes.items()}
    # a little more room, where a link drawn straight would run through a box or cross another
    ends = [(boxes[x["from"]], boxes[x["to"]]) for x in links if x["from"] != x["to"]]
    every_box = list(boxes.values())
    group_moved = (
        spread(every_box, groups, _middle_of(every_box)) if crowded(ends, every_box) else {}
    )
    _settle(list(boxes.values()), links)

    # every mark of a moved box's part goes with it: its outline, its words, its pictures
    moved = {
        k: (b.x - start[k][0], b.y - start[k][1])
        for k, b in boxes.items()
        if b.x != start[k][0] or b.y != start[k][1]
    }
    layout = laid.get("layout")
    shift_of: dict[str, tuple[float, float]] = {}
    for part in (layout or {}).get("parts", []):
        if part["kind"] == "node" and part["title"] in moved:
            for i in part["marks"]:
                shift_of[i] = moved[part["title"]]
    for m in marks:
        by = shift_of.get(m["id"]) or (None if layout else moved.get(m.get("of")))
        if by and m["kind"] != "link":
            shift_of[m["id"]] = by
    # a group moved whole takes its outline and its words
    clusters = (
        [p for p in layout["parts"] if p["kind"] == "cluster"]
        if layout
        else [{"marks": [i]} for i in groups]
    )
    for part in clusters:
        by = next((group_moved[i] for i in part["marks"] if i in group_moved), None)
        if by and (by[0] or by[1]):
            for i in part["marks"]:
                shift_of[i] = by
    # a self link's loop, its arrowheads and its words go with its box
    for link in links:
        by = moved.get(link["from"]) if link["from"] == link["to"] else None
        if by:
            for m in marks:
                if m["id"] == link["id"] or (
                    link.get("of") is not None and m.get("of") == link["of"]
                ):
                    shift_of[m["id"]] = by

    # links between the same two boxes, either way round: how many, and each one's place among them
    def pair_of(a: str, b: str) -> str:
        return f"{a}\n{b}" if a < b else f"{b}\n{a}"

    many: dict[str, int] = {}
    nth: dict[str, int] = {}
    for link in links:
        if link["from"] != link["to"]:
            p = pair_of(link["from"], link["to"])
            many[p] = many.get(p, 0) + 1
    every = list(boxes.values())
    middle = _middle_of(every)
    # each lone link takes the bend that crosses least; links between the same two boxes bow apart
    to_bend: list[ToBend] = []
    for link in links:
        a, b = boxes[link["from"]], boxes[link["to"]]
        if a is b:
            continue
        pair = pair_of(a.key, b.key)
        i = nth.get(pair, 0)
        nth[pair] = i + 1
        side = 1 if a.key < b.key else -1
        count = many.get(pair, 1)
        fixed = (i - (count - 1) / 2) * BOW * side if count > 1 else None
        of = link.get("of")
        key = link["id"] if of is None else of
        to_bend.append(ToBend(key, a, b, toward_middle(a, b, side, middle), fixed))
    bows = bends(to_bend, every)
    curves: dict[str, Curve] = {t.key: curve_of(t.a, t.b, bow) for t, bow in zip(to_bend, bows)}
    spots = word_spots(marks, boxes, curves)

    out: list[Mark] = []
    for m in marks:
        by = shift_of.get(m["id"])
        c = None if m.get("of") is None else curves.get(m["of"])
        if m["kind"] == "link" and c:
            # the line stops where an arrowhead begins, at either end that has one
            start_cut, end_cut = _heads_of(marks, m)
            rest = {k: v for k, v in m.items() if k != "outline"}
            out.append({**rest, "points": c.cubic(start_cut, end_cut), "curve": True})
        elif m["kind"] == "arrowhead" and c:
            # which end it is at, as Graphviz drew it: the boxes have moved since
            line = next((x for x in marks if x["kind"] == "link" and x.get("of") == m["of"]), None)
            at_start = _at_first_end(line, m) if line else m["id"].startswith("tail:")
            tip, angle = c.tip_at(at_start)
            rest = {k: v for k, v in m.items() if k != "outline"}
            out.append({**rest, "x": tip[0], "y": tip[1], "angle": angle})
        elif m["kind"] == "label" and c and m.get("of") not in boxes:
            x, y = spots.get(m["id"]) or c.words_at(0.5, m["size"] * WORDS_OFF)
            out.append({**m, "x": x, "y": y})
        else:
            out.append(_shifted(m, *by) if by else m)
    return _grown({**laid, "marks": out})


def _settle(boxes: list[Placed], links: list[Mark]) -> None:
    """Moves boxes off links they do not join and apart from each other, a few rounds, within the
    budget."""
    by_key = {b.key: b for b in boxes}
    rounds = max(1, min(ROUNDS, math.floor(WORK_MOST / max(1, len(boxes) * len(links)))))
    for _ in range(rounds):
        moves = 0
        for link in links:
            a, b = by_key.get(link["from"]), by_key.get(link["to"])
            if not a or not b or a is b:
                continue
            dx, dy = b.x - a.x, b.y - a.y
            long = hypot(dx, dy)
            if long < 1e-6:
                continue
            nx, ny = -dy / long, dx / long
            for c in boxes:
                if c is a or c is b:
                    continue
                # how far along the link the box's middle is, and how far to one side
                t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / (long * long)
                if t <= 0 or t >= 1:
                    continue
                off = (c.x - a.x) * nx + (c.y - a.y) * ny
                # the box's reach across the link: its half size seen square to it, and its room
                reach = abs(nx) * c.hw + abs(ny) * c.hh + CLEARANCE
                if abs(off) >= reach:
                    continue
                push = (1 if off >= 0 else -1) * (reach - abs(off))
                _move_to(c, c.x + nx * push, c.y + ny * push)
                moves += 1
        moves += _apart(boxes)
        if not moves:
            break


def _apart(boxes: list[Placed]) -> int:
    """Pushes apart boxes that overlap, along the way that parts them least, and says how many
    moved."""
    moves = 0
    ordered = sorted(boxes, key=lambda b: b.x - b.hw)
    for i, p in enumerate(ordered):
        for q in ordered[i + 1 :]:
            if q.x - q.hw >= p.x + p.hw + BOX_GAP:
                break
            ox = p.hw + q.hw + BOX_GAP - abs(q.x - p.x)
            oy = p.hh + q.hh + BOX_GAP - abs(q.y - p.y)
            if ox <= 0 or oy <= 0:
                continue
            # each moves half the overlap, along the way that is shorter
            if oy <= ox:
                s = (1 if q.y >= p.y else -1) * (oy / 2)
                _move_to(p, p.x, p.y - s)
                _move_to(q, q.x, q.y + s)
            else:
                s = (1 if q.x >= p.x else -1) * (ox / 2)
                _move_to(p, p.x - s, p.y)
                _move_to(q, q.x + s, q.y)
            moves += 1
    return moves


def _move_to(b: Placed, x: float, y: float) -> None:
    """Puts box `b`'s middle at (`x`, `y`), kept inside its group."""
    g = b.inside
    b.x = min(max(x, g[0] + b.hw), g[2] - b.hw) if g else x
    b.y = min(max(y, g[1] + b.hh), g[3] - b.hh) if g else y


def _heads_of(marks: list[Mark], link: Mark) -> tuple[float, float]:
    """How long the arrowheads at the first and last ends of `link` are: none at an end, 0."""
    out = [0, 0]
    for h in marks:
        if h["kind"] == "arrowhead" and h.get("of") == link.get("of"):
            out[0 if _at_first_end(link, h) else 1] = h["size"]
    return out[0], out[1]


def _at_first_end(link: Mark, h: Mark) -> bool:
    """Whether arrowhead `h` is at the first end of `link`, as Graphviz drew them."""
    pts = link["points"]
    first, last = (pts[0], pts[-1]) if pts else (None, None)

    def gap(p):
        return hypot(p[0] - h["x"], p[1] - h["y"]) if p else math.inf

    return h["id"].startswith("tail:") or gap(first) < gap(last)


def _group_round(groups: dict[str, list[float]], m: Mark):
    """The smallest group of `groups` round the box `m`, if any."""
    best = None
    for g in groups.values():
        if (
            g[0] <= m["x"]
            and g[1] <= m["y"]
            and m["x"] + m["width"] <= g[2]
            and m["y"] + m["height"] <= g[3]
        ):
            if best is None or (g[2] - g[0]) * (g[3] - g[1]) < (best[2] - best[0]) * (
                best[3] - best[1]
            ):
                best = g
    return best


def _middle_of(boxes: list[Placed]) -> tuple[float, float]:
    """The middle of `boxes`: the mean of their middles."""
    sx = sy = 0.0
    for b in boxes:
        sx += b.x
        sy += b.y
    return (sx / max(1, len(boxes)), sy / max(1, len(boxes)))


def _shifted(m: Mark, dx: float, dy: float) -> Mark:
    """`m` moved by (`dx`, `dy`), its outline too."""

    def move(ps):
        return [[x + dx, y + dy] for x, y in ps]

    if m["kind"] == "link":
        return {**m, "points": move(m["points"])}
    out = {**m, "x": m["x"] + dx, "y": m["y"] + dy}
    if m.get("outline"):
        out["outline"] = {**m["outline"], "points": move(m["outline"]["points"])}
    return out


def _grown(laid: dict[str, Any]) -> dict[str, Any]:
    """`laid` with its space grown to hold every mark, should one have moved past its edge: every
    part, so a curve bowed past the edge is never cut off. A curve lies inside its points."""
    edges = [0.0, 0.0, laid["space"]["width"], laid["space"]["height"]]

    def take(ax: float, ay: float, bx: float, by: float) -> None:
        edges[:] = [min(edges[0], ax), min(edges[1], ay), max(edges[2], bx), max(edges[3], by)]

    for m in laid["marks"]:
        kind = m["kind"]
        if m["id"] == "background":
            continue
        if kind in ("box", "group"):
            take(m["x"], m["y"], m["x"] + m["width"], m["y"] + m["height"])
        elif kind == "link":
            for x, y in m["points"]:
                take(x - EDGE, y - EDGE, x + EDGE, y + EDGE)
        elif kind == "arrowhead":
            take(m["x"] - m["size"], m["y"] - m["size"], m["x"] + m["size"], m["y"] + m["size"])
        elif kind == "label":
            wide = m.get("maxWidth")
            wide = js_length(m["text"]) * m["size"] * 0.5 if wide is None else wide
            anchor = m.get("anchor")
            left = (
                m["x"]
                if anchor == "start"
                else m["x"] - wide
                if anchor == "end"
                else m["x"] - wide / 2
            )
            take(left - EDGE, m["y"] - m["size"], left + wide + EDGE, m["y"] + m["size"] * 0.3)
    x0, y0, x1, y1 = edges
    if x0 >= 0 and y0 >= 0 and x1 <= laid["space"]["width"] and y1 <= laid["space"]["height"]:
        return laid
    space = {"width": x1 - x0, "height": y1 - y0}
    marks = []
    for m in laid["marks"]:
        if m["id"] != "background":
            marks.append(_shifted(m, -x0, -y0))
        else:
            rest = {k: v for k, v in m.items() if k != "outline"}
            marks.append({**rest, "x": 0, "y": 0, **space})
    return {**laid, "space": space, "marks": marks}
