"""A graph's own view preset in the style graph (editor spec §69, view_presets_scoped), checked.
The core's style-choice-checks.ts presetOf, as far as its problems go. graph_svg draws no view
preset, so it uses none; but a note's Preset line gets the same problems here as there."""

from __future__ import annotations

from typing import Any

from graphspec.style.words import or_list

# The starter view presets a graph may choose as its own: the core's PRESET_IDS (style-graph.ts).
PRESET_IDS = ("default", "focus", "calm", "detail", "big-picture", "reading")


def preset_of(r: Any, raw: dict) -> dict | None:
    """A Preset, read by `r` (checks.py's reader): {preset, at}, one of the starters by its id."""
    if "preset" not in raw["props"]:
        r.missing(
            "a Preset names a view preset",
            "add preset: " + or_list([f"'{w}'" for w in PRESET_IDS]),
        )
        return None
    preset = r.word("preset", PRESET_IDS, f"preset must be {or_list(PRESET_IDS)}")
    return {"preset": preset, "at": raw["at"]} if preset else None
