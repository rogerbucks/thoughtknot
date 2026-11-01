"""A radial drawing's centre (editor spec §15, radial_centre_chosen): the thing the style graph
names, else the thing with the most links; and the first thing not joined to it. The core's
types.ts and types-shape.ts, function for function."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def centre_of(shape: Mapping[str, Any]) -> str:
    """The thing with the most links, the first drawn when two have as many."""
    degree: dict[str, int] = {}
    for link in shape["links"]:
        for k in (link["from"], link["to"]):
            degree[k] = degree.get(k, 0) + 1
    best = shape["things"][0]["key"] if shape["things"] else ""
    for t in shape["things"]:
        if degree.get(t["key"], 0) > degree.get(best, 0):
            best = t["key"]
    return best


def radial_centre(shape: Mapping[str, Any], chosen: str | None = None) -> str:
    """The centre: the thing chosen, while the drawing holds it, else centre_of."""
    if chosen is not None and any(t["key"] == chosen for t in shape["things"]):
        return chosen
    return centre_of(shape)


def centre_problem(typ: str, centre: str | None) -> tuple[str, str] | None:
    """A centre chosen for a type other than radial, as a problem and its fix, or None."""
    if centre is None or typ == "radial":
        return None
    return (
        "a centre is chosen only for a radial drawing",
        "remove centre, or make it type: 'radial'",
    )
