"""The calculated-value language (editor spec §57, requirements/calc-language.md).

An expression is read into a tree, and a unit is written like USD/h. This is the twin of the
JavaScript library's src/calculated/language.js.
"""

from __future__ import annotations

import re
from typing import Any

# The most characters an expression holds, and how deep its brackets go.
CALC_LIMITS = {"chars": 1000, "nesting": 64}
ROLLS = {"sum", "count", "avg", "min", "max"}
TOKEN = re.compile(r"\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_]\w*)|([-+*/()<.]))")


class CalcRefusalError(Exception):
    """An expression that cannot be read, with the reason."""


def _no(expr: str, why: str) -> CalcRefusalError:
    return CalcRefusalError(f"the expression {_json(expr[:40])} {why} (editor spec §57)")


def _json(text: str) -> str:
    import json

    return json.dumps(text, ensure_ascii=False)


def parse(expr: object) -> dict[str, Any]:
    """An expression read into a tree, or a CalcRefusalError saying why not."""
    if not isinstance(expr, str) or not expr.strip():
        raise _no("" if expr is None else str(expr), "is empty")
    if len(expr) > CALC_LIMITS["chars"]:
        raise _no(expr, f"is longer than {CALC_LIMITS['chars']} characters")
    toks: list = []
    pos = 0
    while pos < len(expr) and expr[pos:].strip():
        m = TOKEN.match(expr, pos)
        if not m or m.end() == pos:
            raise _no(expr, f"holds {_json(expr[pos:].strip()[:12])}")
        if m.group(1) is not None:
            toks.append(("num", float(m.group(1)) if "." in m.group(1) else int(m.group(1))))
        elif m.group(2) is not None:
            toks.append(("name", m.group(2)))
        else:
            toks.append(("op", m.group(3)))
        pos = m.end()
    st = {"i": 0, "depth": 0}

    def is_op(t, o):
        return t is not None and t[0] == "op" and t[1] == o

    def peek():
        return toks[st["i"]] if st["i"] < len(toks) else None

    def take():
        if st["i"] >= len(toks):
            raise _no(expr, "ends too soon")
        st["i"] += 1
        return toks[st["i"] - 1]

    def deeper(within):
        st["depth"] += 1
        if st["depth"] > CALC_LIMITS["nesting"]:
            raise _no(expr, f"goes more than {CALC_LIMITS['nesting']} deep")
        try:
            return within()
        finally:
            st["depth"] -= 1

    def word():
        t = take()
        if t[0] != "name":
            raise _no(expr, f"has {_json(str(t[1]))} where a name goes")
        return t[1]

    def roll(fn):
        take()  # the bracket
        direction = "out"
        if is_op(peek(), "<"):
            take()
            direction = "in"
        typ = word()
        prop = None
        if is_op(peek(), "."):
            take()
            prop = word()
        if not is_op(take(), ")"):
            raise _no(expr, "has a bracket left open")
        if fn != "count" and prop is None:
            raise _no(expr, f"asks {fn} of links with no property")
        if fn == "count" and prop is not None:
            raise _no(expr, "counts links, which have no property to name")
        return {"t": "roll", "fn": fn, "dir": direction, "type": typ, "prop": prop}

    def atom():
        kind, v = take()
        if kind == "num":
            return {"t": "num", "v": v}
        if kind == "op" and v == "(":

            def inner():
                out = add()
                if not is_op(take(), ")"):
                    raise _no(expr, "has a bracket left open")
                return out

            return deeper(inner)
        if kind == "name":
            if is_op(peek(), "("):
                if v not in ROLLS:
                    raise _no(expr, f"calls {_json(v)}")
                return roll(v)
            return {"t": "name", "n": v}
        raise _no(expr, f"has {_json(str(v))} where a value goes")

    def unary():
        if is_op(peek(), "-"):
            take()
            return deeper(lambda: {"t": "neg", "a": unary()})
        return atom()

    def product():
        a = unary()
        while is_op(peek(), "*") or is_op(peek(), "/"):
            op = take()[1]
            a = {"t": "bin", "op": op, "a": a, "b": unary()}
        return a

    def add():
        a = product()
        while is_op(peek(), "+") or is_op(peek(), "-"):
            op = take()[1]
            a = {"t": "bin", "op": op, "a": a, "b": product()}
        return a

    tree = add()
    if st["i"] != len(toks):
        raise _no(expr, f"has {_json(str(toks[st['i']][1]))} after its end")
    return tree


# ── units: a unit is {symbol: power}, written USD/h ───────────────────────────────────────
def unit_of_text(text: object) -> dict[str, int]:
    """A unit written as text, such as USD/h, read into {symbol: power}."""
    u: dict = {}
    if not isinstance(text, str):
        return u
    nxt = 1
    for part in re.split(r"([*/])", text):
        if part == "*":
            nxt = 1
        elif part == "/":
            nxt = -1
        elif part.strip():
            u[part.strip()] = u.get(part.strip(), 0) + nxt
            nxt = 1
    return {k: p for k, p in u.items() if p != 0}


def unit_text(u: dict[str, int]) -> str:
    """A unit written the one way: top symbols sorted joined by *, then / and the bottom ones."""

    def side(keys):
        return "*".join(k if abs(u[k]) == 1 else f"{k}^{abs(u[k])}" for k in sorted(keys))

    top = [k for k in u if u[k] > 0]
    bottom = [k for k in u if u[k] < 0]
    return side(top) + (f"/{side(bottom)}" if bottom else "")


def shown(u: dict[str, int]) -> str:
    """A unit as a person reads it, or "a plain number" when it has none."""
    return unit_text(u) or "a plain number"


def unit_times(a: dict[str, int], b: dict[str, int], sign: int) -> dict[str, int]:
    """Two units multiplied (sign 1) or divided (sign -1)."""
    u = dict(a)
    for k, p in b.items():
        u[k] = u.get(k, 0) + sign * p
    return {k: p for k, p in u.items() if p != 0}


def same_unit(a: dict[str, int], b: dict[str, int]) -> bool:
    """Whether two units are the same once written the one way."""
    return unit_text(a) == unit_text(b)
