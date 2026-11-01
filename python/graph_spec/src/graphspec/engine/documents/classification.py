"""The destination matrix and ranked classes, read from the classification note a host
names, and a document's own class."""

from __future__ import annotations

import re

from graphspec.engine import settings


def _classification_note(path):
    path = path or settings.CLASSIFICATION_NOTE
    if not path:
        raise ValueError(
            "refused: no classification note — set graph_spec.CLASSIFICATION_NOTE to the note "
            "that holds the destination matrix"
        )
    return path


def destination_matrix(path: str | None = None) -> dict[str, dict[str, str]]:
    """The destination matrix read from the classification note itself —
    {consumer kind: {class: 'yes' | 'conditional' | 'no'}}. Never a copy."""
    text = open(_classification_note(path), encoding="utf-8").read()
    head = next(
        text_line
        for text_line in text.splitlines()
        if re.match(r"\|\s*\|\s*Unmoderated", text_line)
    )
    classes = [c.strip() for c in head.strip("|").split("|")[1:]]
    out = {}
    for kind, row in settings.MATRIX_ROWS.items():
        line = next(
            text_line for text_line in text.splitlines() if text_line.startswith(f"| **{row}")
        )
        marks = [c.strip() for c in line.strip("|").split("|")[1:]]
        out[kind] = {
            c: {"✅": "yes", "⚠️": "conditional", "❌": "no"}.get(m, "no")
            for c, m in zip(classes, marks)
        }
    return out


def class_order(path: str | None = None) -> list[str]:
    """Classes highest risk first, from the classification note's ranked table."""
    return [
        m.group(1)
        for m in re.finditer(
            r"^\| \d+ \| \*\*([^*]+)\*\*",
            open(_classification_note(path), encoding="utf-8").read(),
            re.M,
        )
    ]


def may_serve(
    kind: str | None,
    cls: str | None,
    conditions_met: bool | None = False,
    matrix: dict[str, dict[str, str]] | None = None,
) -> bool:
    """Whether the destination matrix — the classification note's, unless one is given — lets a
    consumer of this kind be served an item of this class; an unknown consumer or class is
    refused, and a conditional one needs its conditions met."""
    v = (
        (matrix or destination_matrix()).get(kind, {}).get(cls)
    )  # an unknown consumer or class is refused
    return v == "yes" or (v == "conditional" and bool(conditions_met))


# A note's class is read as the core's gate reads it (classificationOf, in
# packages/core/src/claude-gate.ts). So the two readers never give one note different classes
# (TRUST-9). Both are held to packages/core/test/classification-cases.json.
_KEY = re.compile(r"""^("[^"]*"|'[^']*'|[^\s:#'"\[\]{}>|&*!%@`-][^:#]*?)\s*:(?:\s(.*)|())$""")


def _same(a: str, b: str) -> bool:
    return a.strip().lower() == b.strip().lower()


def _front_matter(text: str) -> list[str] | None:
    """The front matter's own lines, or None when the text does not begin with front matter that
    ends."""
    lines = re.split(r"\r?\n", text[1:] if text.startswith("\ufeff") else text)
    if lines[0].strip() != "---":
        return None
    end = next((i for i, line in enumerate(lines) if i > 0 and line.strip() == "---"), -1)
    return None if end < 0 else lines[1:end]


def _opens_over(value: str) -> bool:
    """Whether a value's quote or bracket is left open on its line, so the next lines may belong
    to it."""
    v = value.strip()
    if v.startswith('"'):
        return not re.match(r'^"(?:[^"\\]|\\.)*"\s*(#.*)?$', v)
    if v.startswith("'"):
        return not re.match(r"^'(?:[^']|'')*'\s*(#.*)?$", v)
    if v.startswith("["):
        return not re.search(r"\]\s*(#.*)?$", v)
    if v.startswith("{"):
        return not re.search(r"\}\s*(#.*)?$", v)
    return False


def _label_of(raw: str) -> str | None:
    """The value of a classification key as one label, or None when it cannot be read as exactly
    one."""
    v = raw.strip()
    quoted = re.match(r'^"([^"\\]*)"\s*(?:#.*)?$', v) or re.match(r"^'([^']*)'\s*(?:#.*)?$", v)
    label = quoted.group(1) if quoted else re.sub(r"\s+#.*$", "", v).strip()
    if not label or ": " in label or label.endswith(":"):
        return None
    if not quoted and re.match(r"""^[\[{|>&*!%@`"'#]""", label):
        return None
    return label.strip() or None


def classification_of(text: str) -> dict[str, str]:
    """A note's classification from an unindented, top-level classification key of its front
    matter — {'kind': 'none'}, {'kind': 'given', 'level': ...} or {'kind': 'unknown'}. Several
    such keys, a list, mapping, block, anchor, tag or open quote, an empty value with child lines,
    or an earlier value that may run over the key, are unknown. A key outside the front matter
    does not count."""
    lines = _front_matter(text)
    if lines is None:
        return {"kind": "none"}
    found, risky, more = None, False, False
    for i, line in enumerate(lines):
        if not line or re.match(r"^\s", line) or line.startswith(("-", "#")):
            continue
        m = _KEY.match(line)
        if not m:
            continue
        key = re.sub(r"""^(["'])(.*)\1$""", r"\2", m.group(1) or "").strip()
        raw = m.group(2) or ""
        if _same(key, "classification"):
            if found:
                more = True
            found = (i, raw)
        if _opens_over(raw) and not _same(key, "classification"):
            risky = True
    if more:
        return {"kind": "unknown"}
    mentioned = any(re.match(r"""^\s*-?\s*["']?classification["']?\s*:""", x, re.I) for x in lines)
    if risky and mentioned:
        return {"kind": "unknown"}
    if not found:
        return {"kind": "none"}
    at, raw = found
    nxt = next((x for x in lines[at + 1 :] if x.strip() != ""), None)
    child = nxt is not None and bool(re.match(r"^\s", nxt) or re.match(r"^-(\s|$)", nxt))
    if raw.strip() == "" or raw.strip().startswith("#"):
        return {"kind": "unknown"} if child else {"kind": "none"}
    if child:
        return {"kind": "unknown"}
    level = _label_of(raw)
    return {"kind": "unknown"} if level is None else {"kind": "given", "level": level}


def document_class(path: str) -> str:
    """A document's classification, from its front matter; Unmoderated when it has none. One that
    cannot be read for certain is refused, as the core's gate refuses it."""
    with open(path, encoding="utf-8") as f:
        c = classification_of(f.read())
    if c["kind"] == "unknown":
        raise ValueError(
            "refused: the document's classification cannot be read for certain — give its front "
            "matter one classification line with one value"
        )
    return c["level"] if c["kind"] == "given" else "Unmoderated"  # unassessed is Unmoderated
