"""Where a reader picture sits in a note, and whether it is up to date (editor spec §62,
picture_kept_in_step, picture_where, picture_same_everywhere). The core's reader-picture-note.ts,
function for function, so the Python reader names, links and fingerprints a picture as the apps do.
A picture is an SVG file named `<note>.<graph>.thoughtknot.svg`, linked by a Markdown image line
straight after its gql block. It names itself as ThoughtKnot's with the fingerprint of the text it
was drawn from, and only that is ever read from it. The same text gives the same fingerprint on
every machine. So the apps, the command line and this reader never take turns rewriting one."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Callable, Sequence
from typing import Literal, TypedDict

from graphspec.reader.drawing import _data_kind, _first_line, _graph_of
from graphspec.reader.whitespace import N, S

# The ending of every reader picture's file name.
PICTURE_ENDING = ".thoughtknot.svg"
# The drawing's version: a change to how a picture is drawn changes every fingerprint.
PICTURE_VERSION = 1
# How many characters of the plain-language reading a picture carries as its alt text.
ALT_MOST = 300

_MARK = re.compile(r"<metadata>thoughtknot reader picture ([0-9a-f]{16})</metadata>")
_LINE = re.compile(r"^ {0,3}!\[((?:[^\]\\]|\\.)*)\]\((?:<([^>]*)>|([^)\s]*))\)\s*$")
_FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})\s*gql\s*$", re.IGNORECASE)
_HEADER = re.compile(r"^\s*//\s*graph\s*:", re.IGNORECASE)
# A board and drawings over a graph are never drawn as one (blocks.ts, boardOf and sketchOf).
_BOARD = re.compile(rf"{S}*//{S}*graph:{S}*{N}+{S}*·{S}*BOARD(?:{S}+ON{S}+{N}+)?{S}*$")
_SKETCH = re.compile(rf"{S}*//{S}*graph:{S}*{N}+{S}*·{S}*SKETCH{S}+ON{S}+{N}+{S}*$")
_UNSAFE_IN_A_NAME = '/\\:*?"<>|#^[]'
# The characters JavaScript's \s matches, so a name is cut where the core cuts it.
_JS_SPACE = re.compile(
    "[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]"
)

PictureState = Literal["missing", "current", "stale", "not-ours"]


class Span(TypedDict):
    """A gql fenced block of a note: its text and the 0-based lines of its fences."""

    text: str
    open: int
    close: int


class PictureBlock(TypedDict):
    """A block of a note that gets a picture: its index among the note's gql blocks, its graph."""

    block: int
    graph: str


class PictureLineAt(TypedDict):
    """A picture line in a note: the gql block it follows, its 0-based line and its link."""

    block: int
    line: int
    href: str


def gql_spans(note: str) -> list[Span]:
    """Where each gql fenced block of a note is. An unclosed fence runs to the end (fences.ts)."""
    lines = [line.removesuffix("\r") for line in note.split("\n")]
    out: list[Span] = []
    i = 0
    while i < len(lines):
        opened = _FENCE.match(lines[i])
        if opened:
            mark = opened.group(1)
            close = re.compile(rf"^ {{0,3}}{'`' if mark[0] == '`' else '~'}{{{len(mark)},}}\s*$")
            j = i + 1
            while j < len(lines) and not close.match(lines[j]):
                j += 1
            out.append({"text": "\n".join(lines[i + 1 : j]), "open": i, "close": j})
            i = j
        i += 1
    return out


def picture_blocks(note: str) -> list[PictureBlock]:
    """The blocks of `note` that get a picture: the first data block of each graph
    (reader-picture.ts, pictureBlocks). A view, a step, a block drawn from elsewhere, a change set,
    a style, a board and drawings get none."""
    seen: set[str] = set()
    out: list[PictureBlock] = []
    for block, span in enumerate(gql_spans(note)):
        text = span["text"]
        first = _first_line(text)
        if _BOARD.match(first) or _SKETCH.match(first) or _data_kind(text) != "data":
            continue
        graph = _graph_of(text)
        if graph and graph not in seen:
            seen.add(graph)
            out.append({"block": block, "graph": graph})
    return out


def _cut(text: str, most: int) -> str:
    """The start of `text` that fits in `most` UTF-8 bytes, cut between characters."""
    used, out = 0, ""
    for c in text:
        used += len(c.encode("utf-8"))
        if used > most:
            break
        out += c
    return out


def _tidy(s: str) -> str:
    return re.sub(r"-{2,}", "-", s).strip("-.")


def part(text: str, most: int) -> str:
    """One part of a file name: unsafe characters and spaces made hyphens, no leading or trailing
    dot or hyphen, cut short (export-plan.ts)."""
    safe = "".join(
        "-" if ord(c) < 32 or c in _UNSAFE_IN_A_NAME or _JS_SPACE.match(c) else c for c in text
    )
    return _tidy(_cut(_tidy(safe), most))


def picture_file_name(note: str, graph: str) -> str:
    """The file name of graph `graph`'s picture in note `note`: the note, the graph, the ending."""
    stem = re.sub(r"\.md$", "", note.split("/")[-1], flags=re.IGNORECASE)
    return f"{part(stem, 80) or 'note'}.{part(graph, 44) or 'graph'}{PICTURE_ENDING}"


def is_picture_file(path: str) -> bool:
    """Whether `path` is named as a reader picture."""
    return path.lower().endswith(PICTURE_ENDING)


def _folder_of(path: str) -> str:
    return "/".join(path.split("/")[:-1])


def picture_href(note: str, picture: str) -> str:
    """The link from note `note` to the picture at `picture`, relative to the note's folder, with
    spaces and brackets escaped."""
    start = [p for p in _folder_of(note).split("/") if p]
    to = [p for p in picture.split("/") if p]
    same = 0
    while same < len(start) and same < len(to) - 1 and start[same] == to[same]:
        same += 1
    rel = "/".join([".."] * (len(start) - same) + to[same:])
    return rel.replace("%", "%25").replace(" ", "%20").replace("(", "%28").replace(")", "%29")


def _decoded(href: str) -> str:
    """`href` with its %XX escapes undone, as UTF-8, as JavaScript's decodeURIComponent does."""
    return re.sub(
        r"(?:%[0-9A-Fa-f]{2})+",
        lambda m: bytes.fromhex(m.group(0).replace("%", "")).decode("utf-8", "replace"),
        href,
    )


def picture_target(note: str, href: str) -> str:
    """The vault path a link from note `note` points at, the reverse of picture_href."""
    out = [p for p in _folder_of(note).split("/") if p]
    for step in _decoded(href).split("/"):
        if step == "..":
            if out:
                out.pop()
        elif step and step != ".":
            out.append(step)
    return "/".join(out)


def picture_texts(note: str, graph: str) -> list[str]:
    """The texts a picture of `graph` is drawn from: each gql block whose header names it."""
    named = re.compile(rf"(^|[^\w]){re.escape(graph)}([^\w]|$)", re.ASCII)
    out = []
    for span in gql_spans(note):
        header = span["text"].split("\n", 1)[0]
        if _HEADER.match(header) and named.search(header):
            out.append(span["text"])
    return out


def picture_fingerprint(note: str, texts: Sequence[str]) -> str:
    """Sixteen hexadecimal digits of the SHA-256 of the drawing's version, the note's path and the
    texts, joined by a NUL."""
    joined = "\u0000".join([str(PICTURE_VERSION), note, *texts])
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:16]


def picture_mark(fingerprint: str) -> str:
    """The metadata a picture names itself by, to put straight inside its <svg>."""
    return f"<metadata>thoughtknot reader picture {fingerprint}</metadata>"


def made_by_thoughtknot(svg: str) -> bool:
    """Whether an SVG names itself as a ThoughtKnot reader picture."""
    return _MARK.search(svg) is not None


def picture_state(existing: str | None, fingerprint: str) -> PictureState:
    """None yet, ours and up to date, ours and old, or someone else's."""
    if existing is None:
        return "missing"
    mark = _MARK.search(existing)
    if not mark:
        return "not-ours"
    return "current" if mark.group(1) == fingerprint else "stale"


def picture_alt(sentences: Sequence[str], most: int = ALT_MOST) -> str:
    """The plain-language reading cut to `most` characters, between words, with "…"."""
    whole = re.sub(r"\s+", " ", " ".join(sentences)).strip()
    if len(whole) <= most:
        return whole
    cut = whole[: most - 1]
    space = cut.rfind(" ")
    return f"{(cut[:space] if space > most / 2 else cut).rstrip()}…"


def picture_line(alt: str, href: str) -> str:
    """The Markdown image line for a picture: the alt text with its brackets escaped, the link."""
    said = re.sub(r"[\\\[\]]", lambda m: "\\" + m.group(0), re.sub(r"\s+", " ", alt))
    return f"![{said}]({href})"


def picture_link_of(line: str) -> str | None:
    """A line's picture link, or None when it is not an image line linking a reader picture."""
    m = _LINE.match(line)
    href = (m.group(2) if m.group(2) is not None else m.group(3) or "") if m else ""
    return href if href and is_picture_file(re.split(r"[?#]", href)[0]) else None


def picture_lines(note: str) -> list[PictureLineAt]:
    """Each picture line of `note`: an image line straight after a gql block's closing fence."""
    lines = note.split("\n")
    out: list[PictureLineAt] = []
    for block, span in enumerate(gql_spans(note)):
        at = span["close"] + 1
        href = picture_link_of(lines[at].removesuffix("\r")) if at < len(lines) else None
        if href:
            out.append({"block": block, "line": at, "href": href})
    return out


def with_picture_line(note: str, block: int, line: str) -> str:
    """`note` with `line` straight after gql block number `block`, in place of the picture line
    there, else added. An unclosed block gets none. The note's line endings are kept."""
    spans = gql_spans(note)
    lines = note.split("\n")
    if block >= len(spans) or spans[block]["close"] >= len(lines):
        return note
    close = spans[block]["close"]
    crlf = "\r" if lines[close].endswith("\r") else ""
    at = close + 1
    there = at < len(lines) and picture_link_of(lines[at].removesuffix("\r")) is not None
    lines[at : at + (1 if there else 0)] = [line + crlf]
    return "\n".join(lines)


def without_picture_lines(
    note: str, which: Callable[[PictureLineAt], bool] = lambda _: True
) -> str:
    """`note` without the picture lines `which` keeps, and nothing else changed."""
    gone = {p["line"] for p in picture_lines(note) if which(p)}
    if not gone:
        return note
    return "\n".join(line for i, line in enumerate(note.split("\n")) if i not in gone)
