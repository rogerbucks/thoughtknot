"""Conserved quantities (editor spec §51, spec_conserved).

A graph says which quantities must balance by holding a Conserved thing. The checker tests it in
any domain, because the thing names what to add up and nothing in the checker knows the domain:
- over: the label of the things to add up.
- amount: the property that holds each thing's number.
- by: optional. The property that groups the things. Each group must balance on its own.
- total: optional. What the sum must be. It is 0 when left out.

A thing with no number in `amount` is reported, never skipped. Sums are exact, so a cent never
drifts.
"""

from __future__ import annotations

from fractions import Fraction
from typing import Any

from graphspec.rules.plain_graph import Graph


def _number(value: Any) -> Fraction | None:
    """A number as an exact fraction, or None when the value is not a number."""
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        return Fraction(str(value))
    except (ValueError, ZeroDivisionError):
        return None


def conserved_problems(graph: Graph) -> list[dict[str, Any]]:
    """Every conserved quantity in the graph that does not balance, each with the reason."""
    out: list[dict[str, Any]] = []
    for rule in sorted(graph.labelled("Conserved")):
        spec = graph.p(rule)
        over, amount = spec.get("over"), spec.get("amount")
        if not over or not amount:
            out.append({"rule": rule, "why": "names no `over` label and `amount` property"})
            continue
        expected = _number(spec.get("total", 0))
        if expected is None:
            out.append({"rule": rule, "why": f"`total` {spec.get('total')!r} is not a number"})
            continue
        sums: dict[Any, Fraction] = {}
        for thing in sorted(graph.labelled(over)):
            props = graph.p(thing)
            n = _number(props.get(amount))
            if n is None:
                out.append({"rule": rule, "thing": thing, "why": f"has no number in `{amount}`"})
                continue
            group = props.get(spec["by"]) if spec.get("by") else None
            sums[group] = sums.get(group, Fraction(0)) + n
        if not sums:
            sums[None] = Fraction(0)
        for group, got in sums.items():
            if got != expected:
                out.append(
                    {
                        "rule": rule,
                        "group": group,
                        "sum": float(got),
                        "expected": float(expected),
                        "why": f"adds to {float(got):g}, not {float(expected):g}",
                    }
                )
    return out
