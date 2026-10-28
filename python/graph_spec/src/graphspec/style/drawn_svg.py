"""The SVG Graphviz draws from a layout source, as the core's render.ts svgOf draws it (editor
spec §25, untangle_direct). Direct links are the default: the drawing is read from Graphviz's
layout as marks (marks.py), its links drawn direct and its boxes moved aside (direct_links.py),
and written as Graphviz writes it (marks_svg.py). Any other routing is Graphviz's own, and so is a
layout the marks cannot give back exactly."""

from __future__ import annotations

import json
import re
import subprocess

from graphspec.style.direct_links import direct_links
from graphspec.style.fold_source import routed_source
from graphspec.style.marks import layout_marks
from graphspec.style.marks_svg import layout_svg
from graphspec.style.quick import QUICK_LAYOUT
from graphspec.style.rows_route import marks_in_rows


def run_dot(dot: str, src: str, form: str) -> str:
    """What Graphviz (the `dot` program) writes for `src` in `form`, such as svg or json. Raises
    RuntimeError if it fails."""
    r = subprocess.run([dot, f"-T{form}"], input=src, capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise RuntimeError(f"Graphviz failed: {r.stderr.strip()[:300]}")
    return r.stdout


def drawn_svg(dot: str, src: str, routing: str | None = None) -> str:
    """The SVG of `src`, drawn by the `dot` program: with direct links unless `routing` chooses
    another way (None is the default, direct). Curved links are routed by our own router."""
    curved = routing == "curved"
    if routing not in (None, "direct", "curved"):
        return run_dot(dot, src, "svg")
    # its links are drawn again here, so Graphviz lays them out straight. Its curves would be
    # thrown away, and routing them is about a quarter of its work (curves_not_routed)
    laid = layout_marks(json.loads(run_dot(dot, routed_source(src, "direct"), "json")))
    if laid["layout"].get("lost"):
        return run_dot(dot, src, "svg")
    # past the quick size, each link is routed between the rows Graphviz laid out, and no box
    # moves (links_routed_in_rows). Curved links a person chose are routed so at any size. Laid
    # out in no rows, as a radial drawing is, they are Graphviz's own while small; past the quick
    # size routing them is slow, so they are drawn direct (curves_routed_ours)
    way = "TB" if re.search(r"rankdir=(TB|BT)", src) else "LR"
    things = sum(1 for m in laid["marks"] if m["kind"] == "box" and m.get("role") == "thing")
    rows = not re.search(r"\blayout=", src) and marks_in_rows(
        laid["marks"], 1 if way == "TB" else 0
    )
    large = things > QUICK_LAYOUT
    if curved and not rows and not large:
        return run_dot(dot, src, "svg")
    return layout_svg(direct_links(laid, way, rows and (large or curved)))
