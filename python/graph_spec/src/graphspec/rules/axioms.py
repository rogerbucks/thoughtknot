"""The graph spec's axioms (editor spec §64, axioms_checker; GS8): the few laws every valid graph
obeys, and one check that finds each one a graph breaks.

A broken axiom is reported with its place, the axiom in its words and a fix, under its stable code.
It never stops a graph being read or drawn. The laws of an operation, such as a join, cannot be
seen in one graph: the generated-graph tests hold those. This is the twin of the JavaScript
library's src/axioms/axioms.js. The table of axioms is packages/graph-spec/src/axioms/axioms.json,
which this library never reads: tests/test_axioms.py holds the words here to it, and
packages/graph-spec/test/axiom-cases.json holds both libraries to the same answers.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from graphspec.rules.likelihood import RANGE
from graphspec.rules.projection import projects_back
from graphspec.rules.schema_types import untyped

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import Graph, World

# Each axiom: (id, its plain sentence, code, message, fix), in order. Only the ones one graph can
# break have a check below; the rest are laws of an operation.
AXIOMS = [
    (
        "A1",
        "Each thing has one id, and no other thing in its graph has it.",
        "GA01",
        "{place} is held under the name '{key}' but its id is '{id}'",
        "keep each thing under its own id",
    ),
    (
        "A2",
        "Every link starts and ends at a thing that is in the graph.",
        "GA02",
        "{place} has no thing at its {end} end, '{id}'",
        "write the thing it names, or take the link out",
    ),
    (
        "A3",
        "Every thing and every link has a type its schema declares.",
        "GA03",
        "{place} has the type {type}, which the schema does not declare",
        "declare {type} in the schema, or use a type it declares",
    ),
    (
        "A4",
        "Reading is a function: the same text gives the same graph, and writing it out and reading"
        " it back changes nothing.",
        "GA04",
        "graph {graph} does not come back the same when it is written out and read again: {why}",
        "keep to values the flat projection can write, such as text, numbers, dates and true or"
        " false",
    ),
    (
        "A5",
        "A thing is the same as itself, same-as goes both ways, and it chains.",
        "GA05",
        "the things made one by SAME_AS do not form whole sets: {why}",
        "join SAME_AS links only through the one same-as function",
    ),
    (
        "A6",
        "Graphs joined in any order, or joined twice, give the same graph, and the join loses and"
        " invents nothing.",
        "GA06",
        "the join depends on the order of its graphs, or loses or invents something: {why}",
        "merge only through the join, never by hand",
    ),
    (
        "A7",
        "A likelihood is a word on the graph's scale, and a range never runs from high to low.",
        "GA07",
        "{place} has the likelihood {why}",
        "use a word on the scale, with the lower word first",
    ),
    (
        "A8",
        "An item has at most one successor, and following successors never comes back to the"
        " start.",
        "GA08",
        "{place} {why}",
        "give each item one successor, and supersede only something older",
    ),
    (
        "A9",
        "Every cache, snapshot and derived element equals a fresh recompute from the source.",
        "GA09",
        "a derived value differs from a fresh recompute: {why}",
        "recompute it from the source",
    ),
    (
        "A10",
        "A real clash becomes contested claims, and neither side is asserted.",
        "GA10",
        "a clash was settled instead of kept: {why}",
        "keep both sides as contested claims",
    ),
]
_BY_ID = {a[0]: a for a in AXIOMS}


def _fill(template: str, parts: dict[str, Any]) -> str:
    """A template's {name}s filled from parts."""
    return re.sub(r"\{(\w+)\}", lambda m: str(parts[m.group(1)]), template)


def _broken(axiom: str, graph: str, place: str, **parts: Any) -> dict[str, str]:
    """One broken axiom: its id and code, the graph, the place, the axiom in its words, and the
    message and fix."""
    _, law, code, message, fix = _BY_ID[axiom]
    every = {"graph": graph, "place": place, **parts}
    return {
        "axiom": axiom,
        "code": code,
        "graph": graph,
        "place": place,
        "law": law,
        "message": _fill(message, every),
        "fix": _fill(fix, every),
    }


def _thing(i: str) -> str:
    return f"thing '{i}'"


def _link(e) -> str:
    return f"link {e[0]}-[:{e[1]}]->{e[2]}"


def _identity(g: Graph, name: str) -> list[dict[str, str]]:
    """A1: each node is held under its own id."""
    return [
        _broken("A1", name, _thing(key), key=key, id=props.get("id", ""))
        for key, (_, props) in g.nodes.items()
        if props.get("id") != key
    ]


def _two_ends(g: Graph, name: str) -> list[dict[str, str]]:
    """A2: every link starts and ends at a thing the graph holds."""
    return [
        _broken("A2", name, _link(e), end=end, id=i)
        for e in g.edges
        for end, i in (("start", e[0]), ("far", e[2]))
        if i not in g.nodes
    ]


def _declared_types(w: World, name: str) -> list[dict[str, str]]:
    """A3: every node and link has a declared type. A draft, with no schema, works its types out
    from its data (§5)."""
    g = w[name]
    own = bool(g.labelled("ElementType"))
    schema_name, shared = w.schema_for(name)
    if not own and not schema_name:
        return []
    labels, edges, _ = untyped(g, shared)
    out = [
        _broken("A3", name, _thing(i), type=label)
        for i, (own_labels, _) in g.nodes.items()
        for label in sorted(own_labels)
        if label in labels
    ]
    out += [_broken("A3", name, _link(e), type=e[1]) for e in g.edges if e[1] in edges]
    return out


def _same_text(g: Graph, name: str) -> list[dict[str, str]]:
    """A4: written out as the flat projection and read back, the graph is the same."""
    try:
        if projects_back(g, name):
            return []
        why = "it reads back as a different graph"
    except Exception:  # the same words from both readers, whatever refused it
        why = "the flat projection cannot write it"
    return [_broken("A4", name, f"graph {name}", why=why)]


def _certainty(g: Graph, name: str) -> list[dict[str, str]]:
    """A7: a likelihood is a word on the scale, and a range runs from low to high."""
    out = []
    for i, (_, p) in g.nodes.items():
        lo, hi = p.get("likelihood"), p.get("likelihood_to")
        if lo is None and hi is None:
            continue
        off = [x for x in (lo, hi) if x is not None and x not in RANGE]
        if off:
            out.append(
                _broken("A7", name, _thing(i), why=f"'{off[0]}', which is not on the scale")
            )
        elif lo is not None and hi is not None and RANGE[lo][0] > RANGE[hi][1]:
            why = f"range '{lo}' to '{hi}', which runs from high to low"
            out.append(_broken("A7", name, _thing(i), why=why))
    return out


def _history(g: Graph, name: str) -> list[dict[str, str]]:
    """A8: each item has at most one successor, and successors never loop."""
    out = []
    nxt: dict[str, list[str]] = {}
    for succ, typ, item, _ in g.edges:
        if typ == "SUPERSEDES":
            nxt.setdefault(item, []).append(succ)
    for item in sorted(nxt):
        succs = nxt[item]
        if len(succs) > 1:
            why = f"has {len(succs)} successors: {', '.join(sorted(succs))}"
            out.append(_broken("A8", name, _thing(item), why=why))
    reported = set()
    for start in sorted(nxt):
        seen = [start]
        at = start
        while at in nxt and len(nxt[at]) == 1:
            at = nxt[at][0]
            if at == start:
                loop = sorted(seen)
                if loop[0] not in reported:
                    reported.add(loop[0])
                    why = f"is superseded in a loop: {', '.join(loop)}"
                    out.append(_broken("A8", name, _thing(loop[0]), why=why))
                break
            if at in seen:
                break
            seen.append(at)
    return out


_CHECKS = {
    "A1": lambda w, n: _identity(w[n], n),
    "A2": lambda w, n: _two_ends(w[n], n),
    "A3": _declared_types,
    "A4": lambda w, n: _same_text(w[n], n),
    "A7": lambda w, n: _certainty(w[n], n),
    "A8": lambda w, n: _history(w[n], n),
}


def axioms(w: World, name: str, off: tuple[str, ...] = ()) -> list[dict[str, str]]:
    """Every axiom graph name of the world breaks, in the axioms' order; [] when it breaks none.
    off names axioms whose check is switched off, as a safeguard test does (§17,
    axioms_safeguards)."""
    out: list[dict[str, str]] = []
    for a, *_ in AXIOMS:
        if a not in _CHECKS or a in off:
            continue
        # a graph with a link that has no end cannot be written out, so A4 waits until A1 and A2
        if a == "A4" and any(b["axiom"] in ("A1", "A2") for b in out):
            continue
        out += _CHECKS[a](w, name)
    return out
