"""What a stand-in for Graphviz answers, for the tests that look at what graph_svg.render hands it
without running it: a drawing 300 by 100 points, as SVG or as the JSON layout direct links are
drawn from (graphspec.style.drawn_svg)."""

import json

SVG = '<svg width="300pt" height="100pt"></svg>'
# with Graphviz's room of 4 points round it, 300 by 100 points in all
LAYOUT = json.dumps({"name": "G", "directed": True, "bb": "0,0,292,92", "objects": []})


def answer(args) -> str:
    """What Graphviz writes for its arguments `args`: JSON for -Tjson, else SVG."""
    return LAYOUT if "-Tjson" in args else SVG


# The line drawing direct adds to the source it lays out, so Graphviz routes no curves
# (drawn_svg.py, curves_not_routed).
STRAIGHT = "\n  graph [splines=line];"


def as_written(source: str) -> str:
    """The source handed to Graphviz as the drawing wrote it: without the line drawing direct
    adds to lay its links out straight."""
    return source.replace(STRAIGHT, "", 1)
