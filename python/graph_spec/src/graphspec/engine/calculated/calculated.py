"""Calculated values (editor spec §57): in schema, by tools, gaps said, loops flagged.

This is the twin of the JavaScript library's src/calculated/calculated.js, and
packages/graph-spec/test/calculated-cases.json holds both to the same answers.

A kind's schema declares a Calculated thing. Its of is the kind and its name the property.
Its is is an expression, as requirements/calc-language.md says, and its unit is optional.
A Quantity thing gives a stored number its unit. Every thing of the kind then has the
property. It is worked out here each time. It is never typed, never by an AI, and never
written into the note text. A reader may keep it as a cache whose basis says what it was
worked out from.

- A value lacking an input is a gap (value None) and counts how many inputs it lacked. A
  total of a set counts the gaps and never counts one as zero.
- Adding values of different units is refused, with the reason.
- A value that depends on itself is a loop (value None) naming the things in it. The rest
  still work out.
"""

from __future__ import annotations

from typing import Any

from graphspec.engine.calculated.language import (
    CALC_LIMITS,  # noqa: F401
    CalcRefusalError,
    parse,
    same_unit,
    shown,
    unit_of_text,
    unit_text,
    unit_times,
)
from graphspec.rules.canonical_json import hash16
from graphspec.rules.plain_graph import Graph


# ── what a schema declares ────────────────────────────────────────────────────────────────
def calculated_of(graph: Graph) -> list[dict[str, Any]]:
    """The Calculated and Quantity things of a graph, each with what is wrong with it."""

    def decl(label):
        out = []
        for i in sorted(graph.labelled(label)):
            p = graph.p(i)
            flags = []
            if not isinstance(p.get("of"), str) or not p.get("of"):
                flags.append(["calc-no-kind", ""])
            if not isinstance(p.get("name"), str) or not p.get("name"):
                flags.append(["calc-unnamed", ""])
            if label == "Calculated":
                try:
                    parse(p.get("is"))
                except CalcRefusalError as e:
                    flags.append(["calc-unreadable", str(e)])
            out.append(
                {
                    "id": i,
                    "of": p.get("of"),
                    "name": p.get("name"),
                    "is": p.get("is") if label == "Calculated" else None,
                    "unit": p.get("unit"),
                    "flags": flags,
                }
            )
        return out

    return decl("Calculated") + decl("Quantity")


def _declarations(graph: Graph):
    calc: dict = {}
    units: dict = {}
    by_name: dict = {}
    for d in calculated_of(graph):
        if (
            not isinstance(d["of"], str)
            or not isinstance(d["name"], str)
            or not d["of"]
            or not d["name"]
        ):
            continue
        key = f"{d['of']}|{d['name']}"
        if d["is"] is not None and key not in calc:
            calc[key] = d
        if isinstance(d["unit"], str) and d["unit"].strip():
            units[key] = d["unit"]
            by_name.setdefault(d["name"], set()).add(unit_text(unit_of_text(d["unit"])))
    return calc, units, by_name


def _gap(u=None):
    return {"v": None, "u": u or {}, "m": 1, "loop": None, "ref": None}


def _lone(v, u=None):
    return {"v": v, "u": u or {}, "m": 0, "loop": None, "ref": None}


def _union(a, b):
    return sorted(set(a or []) | set(b or []))


def _blocked(a, b):
    """Two operands made one when either is a loop or a refusal, else None."""
    if a["loop"] or b["loop"]:
        return {
            "v": None,
            "u": {},
            "m": a["m"] + b["m"],
            "loop": _union(a["loop"], b["loop"]),
            "ref": None,
        }
    if a["ref"] or b["ref"]:
        return {
            "v": None,
            "u": {},
            "m": a["m"] + b["m"],
            "loop": None,
            "ref": a["ref"] or b["ref"],
        }
    return None


def _num(v):
    """A whole float as a whole number, so both libraries write 20 and not 20.0."""
    return int(v) if isinstance(v, float) and v.is_integer() and abs(v) < 1e21 else v


def calculate(graph: Graph, ids: list[str] | None = None) -> dict[str, Any]:
    """Every thing's calculated values. ids limits it to those things.

    The answer is {values, problems}: values by thing and property name, each {value, unit,
    missing, loop, refusal, basis}; problems are declarations that cannot be used. The graph is
    only read."""
    calc, units, by_name = _declarations(graph)
    values: dict = {}
    problems: list = []
    memo: dict = {}
    stack: list = []
    trees: dict = {}
    for d in calculated_of(graph):
        for f in d["flags"]:
            problems.append([d["id"], f[0], f[1]])

    def tree_of(d):
        if d["id"] not in trees:
            try:
                trees[d["id"]] = parse(d["is"])
            except CalcRefusalError as e:
                trees[d["id"]] = e
        return trees[d["id"]]

    def labels_of(i):
        return sorted(graph.nodes[i][0]) if i in graph.nodes else []

    def decl_of(i, name):
        for lab in labels_of(i):
            if f"{lab}|{name}" in calc:
                return calc[f"{lab}|{name}"]
        return None

    def stored_unit(i, name):
        for lab in labels_of(i):
            if f"{lab}|{name}" in units:
                return unit_of_text(units[f"{lab}|{name}"])
        return None

    def any_unit(name):
        s = by_name.get(name)
        return unit_of_text(next(iter(s))) if s and len(s) == 1 else {}

    def value_of(i, name, reads):
        d = decl_of(i, name)
        if d:
            val, rd = result(i, name, d)
            reads.extend(rd)
            return val
        p = graph.p(i).get(name)
        reads.append([f"{i}.{name}", p])
        u = stored_unit(i, name) or {}
        if p is None:
            return _gap(u)
        if isinstance(p, bool) or not isinstance(p, (int, float)):
            return {
                "v": None,
                "u": u,
                "m": 0,
                "loop": None,
                "ref": f"{name} of {i} is not a number",
            }
        return _lone(p, u)

    def result(i, name, d):
        key = f"{i}|{name}"
        if key in memo:
            return memo[key]
        if key in stack:
            members = [k[: k.rindex("|")] for k in stack[stack.index(key) :]]
            return {"v": None, "u": {}, "m": 0, "loop": _union(members, []), "ref": None}, []
        stack.append(key)
        reads: list = []
        tree = tree_of(d)
        if isinstance(tree, CalcRefusalError):
            val = {"v": None, "u": {}, "m": 0, "loop": None, "ref": str(tree)}
        else:
            val = run(tree, i, reads)
        stack.pop()
        # a declared unit must agree with the expression's; a plain number takes the declared one
        if not val["loop"] and not val["ref"] and isinstance(d["unit"], str) and d["unit"].strip():
            want = unit_of_text(d["unit"])
            if unit_text(val["u"]) == "":
                val = {**val, "u": want}
            elif not same_unit(val["u"], want):
                said = f"{name} works out in {shown(val['u'])} but is declared in {shown(want)}"
                val = {**val, "v": None, "ref": said}
        memo[key] = (val, reads)
        return memo[key]

    def run(t, i, reads):
        k = t["t"]
        if k == "num":
            return _lone(t["v"])
        if k == "name":
            return value_of(i, t["n"], reads)
        if k == "neg":
            a = run(t["a"], i, reads)
            return a if a["v"] is None else {**a, "v": -a["v"]}
        if k == "bin":
            a = run(t["a"], i, reads)
            b = run(t["b"], i, reads)
            stop = _blocked(a, b)
            if stop:
                return stop
            m = a["m"] + b["m"]
            op = t["op"]
            if op in ("+", "-"):
                if not same_unit(a["u"], b["u"]):
                    why = (
                        f"cannot add {shown(a['u'])} and {shown(b['u'])}"
                        if op == "+"
                        else f"cannot take {shown(b['u'])} from {shown(a['u'])}"
                    )
                    return {"v": None, "u": {}, "m": m, "loop": None, "ref": why}
                v = (
                    None
                    if a["v"] is None or b["v"] is None
                    else (a["v"] + b["v"] if op == "+" else a["v"] - b["v"])
                )
                return {"v": v, "u": a["u"], "m": m, "loop": None, "ref": None}
            u = unit_times(a["u"], b["u"], 1 if op == "*" else -1)
            if a["v"] is None or b["v"] is None:
                return {"v": None, "u": u, "m": m, "loop": None, "ref": None}
            if op == "/" and b["v"] == 0:
                return {"v": None, "u": u, "m": m, "loop": None, "ref": "it divides by zero"}
            return {
                "v": a["v"] * b["v"] if op == "*" else a["v"] / b["v"],
                "u": u,
                "m": m,
                "loop": None,
                "ref": None,
            }
        return roll(t, i, reads)

    def roll(t, i, reads):
        if t["dir"] == "out":
            links = [e[2] for e in graph.out(i, t["type"])]
        else:
            links = [e[0] for e in graph.inc(i, t["type"])]
        if t["fn"] == "count":
            return _lone(len(links))
        have: list = []
        gaps = 0
        m = 0
        loop = None
        ref = None
        for to in links:
            v = value_of(to, t["prop"], reads) if to in graph.nodes else _gap()
            if v["loop"]:
                loop = _union(loop, v["loop"])
            elif v["ref"]:
                ref = ref or v["ref"]
            elif v["v"] is None:
                gaps += 1
            else:
                have.append(v)
                m += v["m"]
        if loop:
            return {"v": None, "u": {}, "m": 0, "loop": loop, "ref": None}
        if ref:
            return {"v": None, "u": {}, "m": 0, "loop": None, "ref": ref}
        for v in have[1:]:
            if not same_unit(v["u"], have[0]["u"]):
                why = f"cannot {t['fn']} {shown(have[0]['u'])} with {shown(v['u'])}"
                return {"v": None, "u": {}, "m": 0, "loop": None, "ref": why}
        u = have[0]["u"] if have else any_unit(t["prop"])
        m += gaps
        if not have:
            zero = 0 if t["fn"] == "sum" and not links else None
            return {"v": zero, "u": u, "m": m, "loop": None, "ref": None}
        nums = [v["v"] for v in have]
        total = 0
        for n in nums:
            total = total + n
        v = {"sum": total, "avg": total / len(nums), "min": min(nums), "max": max(nums)}[t["fn"]]
        return {"v": v, "u": u, "m": m, "loop": None, "ref": None}

    wanted = set(ids) if ids is not None else None
    for i, (labels, _) in graph.nodes.items():
        if wanted is not None and i not in wanted:
            continue
        for label in sorted(labels):
            for key, d in calc.items():
                if not key.startswith(f"{label}|"):
                    continue
                name = d["name"]
                if decl_of(i, name) is not d:
                    continue
                val, reads = result(i, name, d)
                values.setdefault(i, {})[name] = {
                    "value": _num(val["v"]),
                    "unit": unit_text(val["u"]),
                    "missing": val["m"],
                    "loop": val["loop"],
                    "refusal": val["ref"],
                    "basis": hash16([d["is"], d["unit"], [[k, _num(v)] for k, v in reads]]),
                }
    return {"values": values, "problems": problems}


def stale_calculated(graph: Graph, cache: dict[str, Any] | None) -> list[str]:
    """The keys (thing|name) of kept values no longer what they would be worked out as now."""
    now = calculate(graph)["values"]
    stale = []
    for key, entry in (cache or {}).items():
        cut = key.rindex("|")
        cur = now.get(key[:cut], {}).get(key[cut + 1 :])
        if not cur or not entry or entry.get("basis") != cur["basis"]:
            stale.append(key)
    return sorted(stale)
