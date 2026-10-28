"""The space, painter and lens of a graph or a view in the style graph (editor spec §68,
layout_concept_layers), checked. The core's style-choice-checks.ts renderOf, as far as its
problems go. graph_svg draws flat and paints SVG, so it uses neither; but a note's Render line
gets the same problems here as there."""

from __future__ import annotations

from typing import Any

from graphspec.style.words import or_list

# The spaces, painters and lenses a Render may name: the core's SPACES and PAINTERS
# (render-choice.ts) and LENSES (lenses.ts).
SPACES = ("2d", "2.5d", "3d")
PAINTERS = ("auto", "webgpu", "webgl2", "canvas")
LENSES = ("none", "fisheye", "semantic")


def render_of(r: Any, raw: dict) -> dict | None:
    """A Render, read by `r` (checks.py's reader): {space, painter, lens, view, at}, each
    if written."""
    before, props = len(r.out), raw["props"]
    if "space" not in props and "painter" not in props and "lens" not in props:
        add = "add space: " + or_list([f"'{w}'" for w in SPACES]) + ", or painter: 'canvas'"
        r.missing("a Render sets space, painter or lens", add)
        return None
    space = r.word("space", SPACES, f"space must be {or_list(SPACES)}")
    painter = r.word("painter", PAINTERS, f"painter must be {or_list(PAINTERS)}")
    lens = r.word("lens", LENSES, f"lens must be {or_list(LENSES)}")
    view = r.text("view")
    if len(r.out) != before:
        return None
    chosen = {"space": space, "painter": painter, "lens": lens, "view": view}
    return {**{k: v for k, v in chosen.items() if v is not None}, "at": raw["at"]}
