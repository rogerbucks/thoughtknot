"""A lens as graph data (editor spec §33, lens_is_saved_query).

This is the twin of the JavaScript library's src/lenses/saved-lenses.js, and
packages/graph-spec/test/saved-lens-cases.json holds both to the same answers.

A lens is a Lens thing: a name, a saved query and, if it likes, a default altitude. It is graph
data, so it joins and can be contested like any claim. It holds no data of its own. Its answer is
worked out each time it runs, from the graph as it is then, so a lens opened after an edit answers
fresh.

A query names a kind, or * for every thing, and may add WHERE and a guard-language test of each
thing's properties. A thing lacking a property the test names does not match. The test may also
count a thing's links: links_out, links_in and links, both ways. A property of that name wins. A
rule's look (editor spec §56, rule_look_when) runs its `when` here too, as a query, so both engines
give it the same things. A rule on links tests each link's own properties, and may name its
relationship type. A lens may name the schemas it depends on. When the graph now names another
version of one, the lens is flagged.
"""

from __future__ import annotations

import re

from graphspec.engine import guards
from graphspec.rules.plain_graph import Graph

# The properties a lens may have. Any other is data, which a lens never holds.
LENS_PROPS = [
    "id",
    "name",
    "query",
    "altitude",
    "schemas",
    "likelihood",
    "likelihood_to",
    "confidence",
    "status",
]
QUERY = re.compile(r"^\s*(\*|[A-Za-z_]\w*)(?:\s+WHERE\s+([\s\S]+?))?\s*$")


def _base(schema) -> str:
    return re.sub(r"@[^@]*$", "", str(schema))


def _text(v) -> str:
    """A value as JavaScript's String gives it."""
    if v is True or v is False:
        return "true" if v else "false"
    return "null" if v is None else str(v)


def query_of(text: object) -> dict | None:
    """A saved query read: the kind it asks for, or None for every thing, and its test."""
    m = QUERY.match(text) if isinstance(text, str) else None
    if not m:
        return None
    return {"kind": None if m.group(1) == "*" else m.group(1), "where": m.group(2)}


def lenses_of(graph: Graph, schemas: dict | None = None) -> list:
    """The lens things of a graph, each with what it asks and what is flagged on it, by id."""
    now = schemas or {}
    out = []
    for lid in sorted(graph.labelled("Lens")):
        p, flags = graph.p(lid), []
        query = query_of(p.get("query"))
        if not isinstance(p.get("name"), str) or not p.get("name"):
            flags.append(["lens-unnamed", ""])
        if query is None:
            flags.append(["query-unreadable", _text(p.get("query", ""))])
        extra = sorted(k for k in p if k not in LENS_PROPS)
        if extra:
            flags.append(["lens-holds-data", ", ".join(extra)])
        for e in graph.out(lid):
            flags.append(["lens-holds-data", f"{e[1]} {e[2]}"])
        text = p.get("schemas")
        named = [s.strip() for s in text.split(",") if s.strip()] if isinstance(text, str) else []
        for s in named:
            if _base(s) in now and now[_base(s)] != s:
                flags.append(["schema-changed", f"{s} -> {now[_base(s)]}"])
        out.append(
            {
                "id": lid,
                "name": p.get("name"),
                "query": p.get("query"),
                "altitude": p.get("altitude"),
                "schemas": named,
                "topics": [query["kind"]] if query and query["kind"] else [],
                "flags": flags,
            }
        )
    return out


def _holds(where, ctx) -> bool:
    """Whether a test holds for a context: one that cannot be run, or that names what is not
    there, does not."""
    if where is None:
        return True
    try:
        return guards.holds(where, ctx)
    except (NameError, ValueError, TypeError):
        return False


def _found(graph: Graph, query: dict | None) -> list:
    """The things a query read by query_of finds, in the graph's order. A Lens thing is never
    found."""
    things: list = []
    if not query:
        return things
    out: dict = {}
    inc: dict = {}
    if query["where"] is not None:
        for s, _t, d, *_ in graph.edges:
            out[s] = out.get(s, 0) + 1
            inc[d] = inc.get(d, 0) + 1
    for i, (labels, props) in graph.nodes.items():
        if "Lens" in labels or (query["kind"] is not None and query["kind"] not in labels):
            continue
        ctx = None
        if query["where"] is not None:
            o, n = out.get(i, 0), inc.get(i, 0)
            ctx = {"links_out": o, "links_in": n, "links": o + n, **props}
        if _holds(query["where"], ctx):
            things.append(i)
    return things


def run_lens(graph: Graph, lens_id: str, schemas: dict | None = None) -> dict:
    """A lens run on the graph as it is now: the things it finds, its altitude and its flags."""
    lens = next((x for x in lenses_of(graph, schemas) if x["id"] == lens_id), None)
    if lens is None:
        raise ValueError(f"refused: {lens_id} is not a lens (editor spec §33)")
    return {
        "lens": lens["id"],
        "things": _found(graph, query_of(lens["query"])),
        "altitude": lens["altitude"],
        "flags": lens["flags"],
    }


def query_things(graph: Graph, query: str) -> list:
    """The things a query finds, as a lens would, in the graph's order. None when it cannot be
    read."""
    return _found(graph, query_of(query))


def query_links(graph: Graph, typ: str | None, where: str | None) -> list:
    """The links a rule finds, by their place in the graph's edges: those of `typ`, or of every
    type when it is None, whose own properties pass `where`, or every one when it is None."""
    return [
        n
        for n, (_s, t, _d, *rest) in enumerate(graph.edges)
        if (typ is None or t == typ) and _holds(where, dict(rest[0] if rest and rest[0] else {}))
    ]
